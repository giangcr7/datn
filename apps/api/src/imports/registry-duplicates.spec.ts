import { BadRequestException } from '@nestjs/common';
import type { RegistryInput, RowIssue } from './registry-parser';
import {
  registryDuplicateIndex,
  registryDuplicateIssues,
  registryDuplicateValue,
  registryEffectiveData,
} from './registry-duplicates';
import {
  refreshRegistryDuplicates,
  registryDuplicateState,
  storedNumberIssues,
} from './registry-duplicate-data';

type Issue = RowIssue & { id: string; resolvedAt: Date | null };
type TestRow = {
  id: string;
  sheetName: string;
  rowNumber: number;
  status: string;
  normalizedData: RegistryInput;
  overrides: Partial<RegistryInput> | null;
  reviewedAt: Date | null;
  issues: Issue[];
};
function row(id: string, data: Partial<RegistryInput> = {}): TestRow {
  return {
    id,
    sheetName: '2025',
    rowNumber: Number(id.replace(/[^0-9]/g, '')) || 2,
    status: 'NEEDS_REVIEW',
    normalizedData: {
      studentCode: '0012345678',
      certificateNo: null,
      registryNo: null,
      ...data,
    } as RegistryInput,
    overrides: null,
    reviewedAt: null,
    issues: [],
  };
}
function fixture(
  rows: TestRow[],
  diplomas: Awaited<ReturnType<typeof registryDuplicateState>>['diplomas'] = [],
) {
  let issueId = 0;
  const client = {
    importRow: {
      findMany: jest.fn().mockImplementation(() =>
        rows
          .filter((item) => item.status !== 'SKIPPED')
          .map((item) => ({
            ...item,
            issues: item.issues.filter((issue) => !issue.resolvedAt),
          })),
      ),
      updateMany: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: { in: string[] } };
            data: { status: string };
          }) => {
            for (const item of rows)
              if (where.id.in.includes(item.id)) Object.assign(item, data);
            return { count: where.id.in.length };
          },
        ),
      update: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: { status: string };
          }) => Object.assign(rows.find((item) => item.id === where.id)!, data),
        ),
    },
    diploma: { findMany: jest.fn().mockResolvedValue(diplomas) },
    validationIssue: {
      updateMany: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: { in: string[] } };
            data: { resolvedAt: Date };
          }) => {
            for (const item of rows)
              for (const issue of item.issues)
                if (where.id.in.includes(issue.id)) Object.assign(issue, data);
            return { count: where.id.in.length };
          },
        ),
      createMany: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: (RowIssue & { rowId: string })[] }) => {
            for (const issue of data)
              rows
                .find((item) => item.id === issue.rowId)!
                .issues.push({
                  ...issue,
                  id: 'issue-' + ++issueId,
                  resolvedAt: null,
                });
            return { count: data.length };
          },
        ),
    },
  };
  return {
    client,
    refresh: (target?: { rowId: string; previous?: RegistryInput }) =>
      refreshRegistryDuplicates(
        client as unknown as Parameters<typeof refreshRegistryDuplicates>[0],
        'batch',
        'institution',
        target,
      ),
  };
}

describe('Registry duplicate identification', () => {
  it('identifies exact fields, source sheet/row and values while preserving leading zeros', () => {
    const current = row('1208', {
      certificateNo: '0000123',
      registryNo: '0000456',
    });
    const peer = { ...row('1333', current.normalizedData), sheetName: '2024' };
    const issues = registryDuplicateIssues(
      current,
      registryDuplicateIndex([current, peer]),
    );
    expect(issues).toHaveLength(3);
    expect(issues[0]).toMatchObject({
      field: 'studentCode',
      severity: 'WARNING',
    });
    expect(issues[1]).toMatchObject({
      field: 'certificateNo',
      severity: 'ERROR',
    });
    expect(issues[2]).toMatchObject({ field: 'registryNo', severity: 'ERROR' });
    expect(issues[1].message).toContain('Số hiệu văn bằng "0000123"');
    expect(issues[1].message).toContain('sheet 2024, dòng 1333');
    expect(issues[1].message).not.toContain('dòng 1208');
  });
  it('uses saved corrections, ignores skipped rows and invalid or blank identities', () => {
    const current = row('1');
    current.overrides = { studentCode: '0099999999' };
    const peer = row('2');
    const skipped = {
      ...row('3', { studentCode: '0099999999' }),
      status: 'SKIPPED',
    };
    expect(
      registryDuplicateIssues(
        current,
        registryDuplicateIndex([current, peer, skipped]),
      ),
    ).toEqual([]);
    for (const studentCode of ['', '123', 'unknown', '12345678901'])
      expect(
        registryDuplicateValue({ studentCode } as RegistryInput, 'studentCode'),
      ).toBe('');
    expect(registryEffectiveData(current).studentCode).toBe('0099999999');
    expect(current.normalizedData.studentCode).toBe('0012345678');
  });
  it('bounds source-location messages without losing the remaining count', () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      row(String(index + 1)),
    );
    const [issue] = registryDuplicateIssues(
      rows[0],
      registryDuplicateIndex(rows),
    );
    expect(issue.message.match(/sheet 2025/g)).toHaveLength(8);
    expect(issue.message).toContain('3 dòng khác');
  });
});

describe('Registry duplicate revalidation', () => {
  it('clears both sides of an old collision after one row changes without confirming its peer', async () => {
    const current = row('1', { certificateNo: 'A' });
    const peer = row('2', { certificateNo: 'A' });
    const { refresh, client } = fixture([current, peer]);
    await refresh();
    const previous = registryEffectiveData(current);
    current.overrides = { studentCode: '0023456789', certificateNo: 'B' };
    current.reviewedAt = new Date();
    const result = await refresh({ rowId: current.id, previous });
    expect(result.get(peer.id)).toEqual({ ready: true, issues: [] });
    expect(peer.status).toBe('READY');
    expect(peer.reviewedAt).toBeNull();
    expect(current.normalizedData.certificateNo).toBe('A');
    expect(client.validationIssue.updateMany).toHaveBeenCalled();
    expect(current.issues.filter((issue) => !issue.resolvedAt)).toEqual([]);
    expect(peer.issues.filter((issue) => !issue.resolvedAt)).toEqual([]);
  });
  it('rechecks old and new groups and preserves unrelated errors and imported records', async () => {
    const current = row('1', { certificateNo: 'A' });
    const oldPeer = row('2', { studentCode: '0023456789', certificateNo: 'A' });
    const newPeer = row('3', { studentCode: '0034567890', certificateNo: 'B' });
    const imported = {
      ...row('4', { studentCode: '0045678901', certificateNo: 'B' }),
      status: 'IMPORTED',
    };
    oldPeer.issues.push({
      id: 'identity-error',
      field: 'fullName',
      code: 'INVALID_NAME',
      severity: 'ERROR',
      message: 'Invalid identity',
      resolvedAt: null,
    });
    const original = structuredClone(imported);
    const { refresh, client } = fixture([current, oldPeer, newPeer, imported]);
    await refresh();
    const previous = registryEffectiveData(current);
    current.overrides = { certificateNo: 'B' };
    const result = await refresh({ rowId: current.id, previous });
    expect(result.get(oldPeer.id)?.issues.map((issue) => issue.code)).toEqual([
      'INVALID_NAME',
    ]);
    expect(result.get(newPeer.id)?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'certificateNo', severity: 'ERROR' }),
      ]),
    );
    expect(result.get(current.id)?.ready).toBe(false);
    expect(imported).toEqual(original);
    expect(
      client.importRow.updateMany.mock.calls.flatMap(
        ([query]) => (query as { where: { id: { in: string[] } } }).where.id.in,
      ),
    ).not.toContain(imported.id);
  });
  it('requires confirmation for repeated MSSV but never permits duplicate diploma numbers', async () => {
    const current = row('1');
    const peer = row('2');
    const { refresh } = fixture([current, peer]);
    expect((await refresh()).get(current.id)?.ready).toBe(false);
    current.reviewedAt = new Date();
    expect((await refresh()).get(current.id)?.ready).toBe(true);
    expect(peer.status).toBe('NEEDS_REVIEW');
    current.overrides = { registryNo: 'R' };
    peer.overrides = { registryNo: 'R' };
    expect((await refresh()).get(current.id)?.ready).toBe(false);
  });
  it('does not rewrite identical issues on repeated checks', async () => {
    const { refresh, client } = fixture([row('1'), row('2')]);
    await refresh();
    client.validationIssue.createMany.mockClear();
    client.validationIssue.updateMany.mockClear();
    await refresh();
    expect(client.validationIssue.createMany).not.toHaveBeenCalled();
    expect(client.validationIssue.updateMany).not.toHaveBeenCalled();
  });
  it('excludes the same imported source diploma but blocks institutional number collisions', async () => {
    const current = row('1', { certificateNo: 'C', registryNo: 'R' });
    const own = {
      id: 'own',
      campusId: 'campus',
      certificateNo: 'C',
      registryNo: 'R',
      graduation: { sourceRowId: current.id },
    };
    expect(
      storedNumberIssues(current.normalizedData, current.id, [own]),
    ).toEqual([]);
    const other = {
      ...own,
      id: 'other',
      graduation: { sourceRowId: 'other-row' },
    };
    expect(
      storedNumberIssues(current.normalizedData, current.id, [other]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'certificateNo', severity: 'ERROR' }),
        expect.objectContaining({ field: 'registryNo', severity: 'ERROR' }),
      ]),
    );
    const { refresh, client } = fixture([current], [other]);
    current.reviewedAt = new Date();
    expect((await refresh()).get(current.id)?.ready).toBe(false);
    expect(client.diploma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          institutionId: 'institution',
          OR: [{ certificateNo: { in: ['C'] } }, { registryNo: { in: ['R'] } }],
        },
      }),
    );
  });
  it('chunks issue and status writes for a large duplicate group', async () => {
    const rows = Array.from({ length: 602 }, (_, index) => ({
      ...row(String(index + 1), {
        studentCode: String(index).padStart(10, '0'),
        certificateNo: 'SHARED',
      }),
      status: 'READY',
    }));
    const { refresh, client } = fixture(rows);
    const result = await refresh();
    expect(result.size).toBe(602);
    expect(client.validationIssue.createMany).toHaveBeenCalledTimes(2);
    expect(client.importRow.updateMany).toHaveBeenCalledTimes(2);
    expect(
      client.validationIssue.createMany.mock.calls.map(
        ([query]) => (query as { data: unknown[] }).data.length,
      ),
    ).toEqual([500, 102]);
    expect(rows.every((item) => item.status === 'NEEDS_REVIEW')).toBe(true);
  });
  it('rejects an oversized batch before querying diploma data', async () => {
    const { refresh, client } = fixture(
      Array.from({ length: 6001 }, (_, index) => row(String(index))),
    );
    await expect(refresh()).rejects.toBeInstanceOf(BadRequestException);
    expect(client.diploma.findMany).not.toHaveBeenCalled();
  });
});

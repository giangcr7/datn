import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import type { DocumentStorageService } from '../storage/document-storage.service';
import type { RegistryInput, RowIssue } from './registry-parser';
import { RegistryImportService } from './registry-import.service';

type Issue = RowIssue & { id: string; resolvedAt: Date | null };
const actor = {
  id: 'maker',
  email: 'maker@example.test',
  role: 'university',
  isHeadquarters: true,
  canApproveDiplomas: true,
  institutionId: 'institution',
  campusId: 'campus',
} as AuthActor;
const input = {
  studentCode: '0012345678',
  fullName: 'Nguyễn An',
  dateOfBirth: '2002-01-01',
  programId: 'program',
  programOriginal: 'Old program alias',
  classCode: 'C01',
  graduationYear: 2024,
  classification: 'GOOD',
  certificateNo: 'CERT',
  registryNo: 'REG',
  issuedOn: '2024-06-01',
  degreeType: 'ENGINEER',
  majorNameEn: 'Civil Engineering',
  issuePlace: 'TP. Hồ Chí Minh',
  diplomaSignerName: 'Confirmed signer',
  diplomaSignerTitle: 'HIỆU TRƯỞNG',
  gpa: null,
  gpaScale: 4,
} as RegistryInput;
function setup() {
  const rows = ['current', 'peer'].map((id, index) => ({
    id,
    sheetName: '2025',
    rowNumber: index ? 1333 : 1208,
    status: 'NEEDS_REVIEW',
    normalizedData: { ...input },
    overrides: null as Partial<RegistryInput> | null,
    reviewedAt: null as Date | null,
    issues: [] as Issue[],
    rawData: { privateNotes: 'DO-NOT-RETURN' },
  }));
  const diplomas = [
    {
      id: 'own',
      campusId: actor.campusId,
      certificateNo: 'CERT',
      registryNo: 'OWN',
      graduation: { sourceRowId: 'current' },
    },
    {
      id: 'linked',
      campusId: actor.campusId,
      certificateNo: 'CERT',
      registryNo: 'REG',
      graduation: { sourceRowId: 'peer' },
    },
    {
      id: 'stored',
      campusId: actor.campusId,
      certificateNo: 'OTHER-CERT',
      registryNo: 'REG',
      graduation: { sourceRowId: 'another-batch' },
    },
    {
      id: 'restricted-id',
      campusId: 'another-campus',
      certificateNo: 'CERT',
      registryNo: 'HIDDEN-REG',
      graduation: { sourceRowId: 'restricted-source' },
    },
  ];
  const details = diplomas
    .filter((diploma) => diploma.campusId === actor.campusId)
    .map((diploma) => ({
      ...diploma,
      status: 'ACTIVE',
      workflowStatus: 'APPROVED',
      graduation: {
        ...diploma.graduation,
        graduationYear: 2023,
        classification: 'GOOD',
        student: {
          studentCode: '0099999999',
          fullName: 'Stored Student',
          dateOfBirth: new Date('2001-02-03'),
        },
        program: { id: 'program', name: 'Kỹ thuật xây dựng' },
        enrollment: { academicClass: { code: 'C02' } },
      },
    }));
  const database = {
    $queryRaw: jest.fn(),
    institution: {
      findUnique: jest.fn().mockResolvedValue({ nameEn: 'Fixture University' }),
    },
    importBatch: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'batch',
        document: { fileName: 'source.xlsx' },
      }),
    },
    importRow: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          rows.find((row) => row.id === where.id),
        ),
      findMany: jest.fn().mockImplementation(() =>
        rows
          .filter((row) => row.status !== 'SKIPPED')
          .map((row) => ({
            ...row,
            issues: row.issues.filter((issue) => !issue.resolvedAt),
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
            for (const row of rows)
              if (where.id.in.includes(row.id)) Object.assign(row, data);
            return { count: where.id.in.length };
          },
        ),
      update: jest
        .fn()
        .mockImplementation(
          ({ where, data }: { where: { id: string }; data: object }) =>
            Object.assign(rows.find((row) => row.id === where.id)!, data),
        ),
    },
    diploma: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { id?: { in: string[] } } }) =>
            where.id
              ? details.filter((item) => where.id!.in.includes(item.id))
              : diplomas,
        ),
    },
    program: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'program', name: 'Kỹ thuật xây dựng' }]),
      findFirst: jest.fn().mockResolvedValue({ id: 'program' }),
    },
    validationIssue: {
      updateMany: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { rowId?: string; id?: { in: string[] } };
            data: { resolvedAt: Date };
          }) => {
            for (const row of rows)
              for (const issue of row.issues)
                if (
                  (!where.rowId || where.rowId === row.id) &&
                  (!where.id || where.id.in.includes(issue.id))
                )
                  Object.assign(issue, data);
            return { count: 1 };
          },
        ),
      createMany: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: (RowIssue & { rowId: string })[] }) => {
            for (const issue of data) {
              const row = rows.find((row) => row.id === issue.rowId)!;
              row.issues.push({
                ...issue,
                id: 'issue-' + row.issues.length,
                resolvedAt: null,
              });
            }
            return { count: data.length };
          },
        ),
    },
    auditLog: {
      create: jest.fn<Promise<void>, [{ data: { metadata: unknown } }]>(),
    },
  };
  const client = {
    ...database,
    $transaction: jest
      .fn()
      .mockImplementation(
        (callback: (transaction: typeof database) => Promise<unknown>) =>
          callback(database),
      ),
  };
  return {
    service: new RegistryImportService(
      client as unknown as DatabaseService,
      {} as DocumentStorageService,
    ),
    database,
    rows,
    diplomas,
  };
}

describe('Registry duplicate comparison access and safe projections', () => {
  it('shows source locations, exact matched fields and current approved program names', async () => {
    const { service, database } = setup();
    const result = await service.duplicates('batch', 'current', actor);
    expect(result.current).toMatchObject({
      sheetName: '2025',
      rowNumber: 1208,
      fileName: 'source.xlsx',
      values: {
        studentCode: '0012345678',
        programOriginal: 'Kỹ thuật xây dựng',
      },
    });
    expect(result.total).toBe(2);
    expect(result.matches[0]).toMatchObject({
      kind: 'row',
      id: 'peer',
      rowNumber: 1333,
      workflowStatus: 'APPROVED',
      diplomaStatus: 'ACTIVE',
      matchedFields: ['studentCode', 'certificateNo', 'registryNo'],
    });
    expect(result.matches[1]).toMatchObject({
      kind: 'diploma',
      id: 'stored',
      matchedFields: ['registryNo'],
      values: {
        fullName: 'Stored Student',
        dateOfBirth: '2001-02-03',
        classCode: 'C02',
      },
    });
    expect(result.restrictedCount).toBe(1);
    expect(result.fields).toContainEqual({
      field: 'certificateNo',
      label: 'Số hiệu văn bằng',
      value: 'CERT',
      count: 1,
      restricted: true,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /DO-NOT-RETURN|restricted-id|restricted-source|HIDDEN-REG/,
    );
    expect(database.diploma.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['linked', 'stored'] },
          institutionId: actor.institutionId,
          campusId: actor.campusId,
        },
      }),
    );
    expect(database.importRow.update).not.toHaveBeenCalled();
    expect(database.validationIssue.createMany).not.toHaveBeenCalled();
  });
  it('paginates combined row and stored-diploma matches without duplicating linked records', async () => {
    const { service } = setup();
    const result = await service.duplicates('batch', 'current', actor, 2, 1);
    expect(result).toMatchObject({ total: 2, page: 2, limit: 1 });
    expect(result.matches.map((match) => match.key)).toEqual([
      'diploma:stored',
    ]);
    expect(
      (await service.duplicates('batch', 'current', actor, 3, 1)).matches,
    ).toEqual([]);
  });
  it('keeps a stored diploma separate when its numbers differ from its linked import row', async () => {
    const { service, rows } = setup();
    rows[1].overrides = { certificateNo: 'DIFFERENT' };
    const result = await service.duplicates('batch', 'current', actor);
    expect(result.total).toBe(3);
    expect(result.matches[0].matchedFields).not.toContain('certificateNo');
    expect(result.matches.find((match) => match.id === 'linked')).toMatchObject(
      {
        kind: 'diploma',
        matchedFields: ['certificateNo', 'registryNo'],
        values: { certificateNo: 'CERT' },
      },
    );
  });
  it('uses corrected values and returns no matches for numbers and MSSV no longer shared', async () => {
    const { service, rows, diplomas } = setup();
    rows[0].overrides = {
      studentCode: '0088888888',
      certificateNo: 'NEW',
      registryNo: 'NEW-REG',
    };
    diplomas.length = 0;
    expect(await service.duplicates('batch', 'current', actor)).toMatchObject({
      total: 0,
      fields: [],
      restrictedCount: 0,
    });
  });
  it.each([
    { role: 'student' },
    { role: 'admin' },
    { isHeadquarters: false },
    { canApproveDiplomas: false },
  ])('denies unauthorized actor %j before reading rows', async (change) => {
    const { service, database } = setup();
    await expect(
      service.duplicates('batch', 'current', {
        ...actor,
        ...change,
      } as AuthActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.importBatch.findFirst).not.toHaveBeenCalled();
    expect(database.importRow.findMany).not.toHaveBeenCalled();
  });
  it('checks institution and campus ownership before querying duplicate data', async () => {
    const { service, database } = setup();
    database.importBatch.findFirst.mockResolvedValue(null);
    await expect(
      service.duplicates('other-batch', 'current', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(database.importBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'other-batch',
          institutionId: actor.institutionId,
          campusId: actor.campusId,
        },
      }),
    );
    expect(database.importRow.findMany).not.toHaveBeenCalled();
  });
  it('rejects an unrelated row ID without loading diploma details', async () => {
    const { service, database } = setup();
    await expect(
      service.duplicates('batch', 'unrelated-row', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(database.diploma.findMany).toHaveBeenCalledTimes(1);
    expect(database.program.findMany).not.toHaveBeenCalled();
  });
  it.each([
    [0, 5],
    [1, 101],
    [1.5, 5],
    [1, NaN],
  ])('rejects invalid pagination %j', async (page, limit) => {
    const { service, database } = setup();
    await expect(
      service.duplicates('batch', 'current', actor, page, limit),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.importBatch.findFirst).not.toHaveBeenCalled();
  });
});

describe('Registry review integration with related rows', () => {
  it('returns current blocking fields, keeps workbook data and records related rows in audit', async () => {
    const { service, database, rows, diplomas } = setup();
    diplomas.length = 0;
    const original = structuredClone(rows[0].normalizedData);
    const result = await service.review(
      'batch',
      'current',
      {},
      'Đối chiếu hồ sơ gốc',
      actor,
    );
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DUPLICATE_CERTIFICATE_NO',
          severity: 'ERROR',
        }),
        expect.objectContaining({
          code: 'REPEATED_STUDENT_CODE',
          severity: 'WARNING',
        }),
      ]),
    );
    expect(rows[1].status).toBe('NEEDS_REVIEW');
    expect(rows[1].reviewedAt).toBeNull();
    expect(rows[0].normalizedData).toEqual(original);
    expect(database.auditLog.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        metadata: { recheckedRowIds: ['current', 'peer'], ready: false },
      },
    });
    const fixed = await service.review(
      'batch',
      'current',
      {
        studentCode: '0099999999',
        certificateNo: 'NEW',
        registryNo: 'NEW-REG',
      },
      'Sửa theo hồ sơ gốc',
      actor,
    );
    expect(fixed.ready).toBe(true);
    expect(fixed.issues).toEqual([]);
    expect(rows[1].status).toBe('READY');
    expect(rows[1].issues.filter((issue) => !issue.resolvedAt)).toEqual([]);
    expect(rows[0].normalizedData).toEqual(original);
  });
  it('allows reviewed repeated MSSV while blocking stored certificate numbers', async () => {
    const { service, diplomas } = setup();
    diplomas.length = 0;
    const result = await service.review(
      'batch',
      'current',
      { certificateNo: 'NEW', registryNo: 'NEW-REG' },
      'Xác nhận hai văn bằng cùng người học',
      actor,
    );
    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'REPEATED_STUDENT_CODE',
        severity: 'WARNING',
      }),
    ]);
    diplomas.push({
      id: 'existing',
      campusId: actor.campusId,
      certificateNo: 'NEW',
      registryNo: 'OTHER',
      graduation: { sourceRowId: 'external' },
    });
    expect(
      (await service.review('batch', 'current', {}, 'Đối chiếu số hiệu', actor))
        .ready,
    ).toBe(false);
  });
  it('requires a reason before changing or confirming a duplicate row', async () => {
    const { service, database } = setup();
    await expect(
      service.review('batch', 'current', {}, ' ', actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });
});

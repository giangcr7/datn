import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import type { DiplomaWithRelations } from '../database/diploma-projection';
import type { Prisma } from '../generated/prisma/client';
import { CertService } from './cert.service';
import {
  CreateIssuanceBatchDto,
  IssuanceBatchMembersDto,
  IssuanceBatchQueryDto,
  PublishIssuanceBatchDto,
} from './issuance-batch.dto';
import { issuanceBatchRow } from './issuance-batch-state';
import { IssuanceBatchService } from './issuance-batch.service';

const actor = {
  id: randomUUID(),
  institutionId: randomUUID(),
  campusId: randomUUID(),
  role: 'university',
  isHeadquarters: true,
  canApproveDiplomas: true,
  email: 'officer@example.test',
} as AuthActor;
const batch = {
  id: randomUUID(),
  institutionId: actor.institutionId,
  campusId: actor.campusId,
  code: 'TEST_2024',
  name: 'Đợt kiểm thử',
  graduationYear: 2024,
  decisionId: randomUUID(),
  programId: null,
  decision: { documentNumber: '123/QĐ', signedOn: new Date('2024-06-01') },
  program: null,
  createdBy: { displayName: 'Cán bộ' },
};

function record() {
  return {
    id: randomUUID(),
    issuanceBatchId: batch.id,
    institutionId: actor.institutionId,
    campusId: actor.campusId,
    status: 'DRAFT',
    workflowStatus: 'DRAFT',
    originType: 'ISSUANCE',
    certificateNo: 'VB-001',
    registryNo: 'VS-001',
    issuedOn: new Date('2024-06-02'),
    updatedAt: new Date('2026-11-03T01:00:00Z'),
    printTemplate: 'tlu-bilingual-v1',
    majorNameEn: 'Civil Engineering',
    issuePlace: 'TP.HCM',
    diplomaSignerName: 'Người ký',
    diplomaSignerTitle: 'Hiệu trưởng',
    institution: { name: 'Trường kiểm thử', nameEn: 'Test University' },
    campus: { code: 'MAIN', name: 'Cơ sở chính' },
    graduation: {
      graduationYear: 2024,
      classification: 'GOOD',
      degreeType: 'ENGINEER',
      gpa: null,
      gpaScale: 4,
      student: {
        studentCode: '00123',
        fullName: 'Nguyễn Văn Kiểm Thử',
        dateOfBirth: new Date('2002-01-01'),
      },
      program: { name: 'Xây dựng', nameEn: 'Civil Engineering', active: true },
      decision: { documentNumber: '123/QĐ', signedOn: new Date('2024-06-01') },
      sourceRow: null,
      enrollment: null,
    },
    versions: [],
    signedDocuments: [],
    events: [],
    supersedes: null,
    replacement: null,
  } as unknown as DiplomaWithRelations & { events: { eventType: string }[] };
}

function setup() {
  const row = record();
  const transaction = {
    diplomaIssuanceBatch: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...batch, ...data, decision: null, program: null }),
        ),
      findFirst: jest.fn().mockResolvedValue(batch),
      count: jest.fn().mockResolvedValue(1),
    },
    diploma: {
      findMany: jest.fn().mockResolvedValue([row]),
      count: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(row),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const database = {
    ...transaction,
    $transaction: jest.fn((callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  const certificates = {
    approveCert: jest.fn().mockResolvedValue({ success: true }),
  };
  const service = new IssuanceBatchService(
    database as unknown as DatabaseService,
    certificates as unknown as CertService,
  );
  return { row, transaction, database, certificates, service };
}

describe('issuance batch DTO validation', () => {
  it('validates the issuance year independently of graduation year', async () => {
    const value = plainToInstance(CreateIssuanceBatchDto, {
      issuanceYear: '2026',
      batchNumber: '2',
    });
    expect(await validate(value)).toEqual([]);
    expect(value.issuanceYear).toBe(2026);
    expect(value.batchNumber).toBe(2);
  });
  it.each([
    { issuanceYear: 1899 },
    { issuanceYear: 2201 },
    { issuanceYear: 2026.5 },
    { batchNumber: 0 },
    { batchNumber: 1000 },
    { batchNumber: 1.5 },
  ])('rejects invalid batch metadata %p', async (changes) => {
    const value = plainToInstance(CreateIssuanceBatchDto, {
      issuanceYear: 2026,
      batchNumber: 1,
      ...changes,
    });
    expect((await validate(value)).length).toBeGreaterThan(0);
  });
  it.each([
    { ids: [] },
    { ids: ['bad-id'] },
    { ids: Array(101).fill(randomUUID()) as string[] },
    { ids: [actor.id, actor.id] },
  ])('rejects invalid member selections %p', async ({ ids }) => {
    expect(
      (
        await validate(
          plainToInstance(IssuanceBatchMembersDto, { diplomaIds: ids }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    { entries: [] },
    { entries: [null] },
    { entries: [{ uuid: actor.id, expectedUpdatedAt: 'not-a-date' }] },
    {
      entries: Array(2).fill({
        uuid: actor.id,
        expectedUpdatedAt: '2026-11-03T00:00:00Z',
      }),
    },
  ])('rejects unsafe publish payloads %p', async (value) => {
    expect(
      (await validate(plainToInstance(PublishIssuanceBatchDto, value))).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    { page: 0 },
    { limit: 101 },
    { status: 'INVALID' },
    { search: 'x'.repeat(256) },
  ])('rejects invalid query %p', async (query) => {
    expect(
      (await validate(plainToInstance(IssuanceBatchQueryDto, query))).length,
    ).toBeGreaterThan(0);
  });
});

describe('issuance batch checks', () => {
  it('marks complete unsigned drafts ready, without signing or writing', () => {
    expect(issuanceBatchRow(record())).toMatchObject({
      batchState: 'DRAFT',
      ready: true,
      removable: true,
      checkErrors: [],
    });
  });
  it.each([
    'issuedOn',
    'printTemplate',
    'diplomaSignerName',
    'majorNameEn',
  ] as const)('blocks incomplete %s', (field) => {
    const value = record();
    value[field] = null;
    if (field === 'majorNameEn') value.graduation.program.nameEn = null;
    expect(issuanceBatchRow(value).ready).toBe(false);
  });
  it('requires the diploma issue date to match the issuance year for new batches', () => {
    expect(issuanceBatchRow(record(), 2024).ready).toBe(true);
    expect(issuanceBatchRow(record(), 2026).checkErrors).toContain(
      'Năm trên ngày cấp không trùng năm phát hành 2026 của đợt',
    );
    expect(issuanceBatchRow(record(), null).ready).toBe(true);
  });
  it('blocks inactive programs and incomplete decisions', () => {
    const value = record();
    value.graduation.program.active = false;
    value.graduation.decision!.signedOn = null;
    expect(issuanceBatchRow(value).checkErrors).toEqual(
      expect.arrayContaining([
        'Ngành đào tạo đã ngừng sử dụng',
        'Quyết định chưa ghi ngày ký',
      ]),
    );
  });
  it('routes reopened drafts back through correction review', () => {
    const value = record();
    value.events = [{ eventType: 'REOPENED' }];
    expect(issuanceBatchRow(value).ready).toBe(false);
  });
  it.each(['QUEUED', 'FAILED', 'COMMITTED'] as const)(
    'distinguishes ledger state %s',
    (state) => {
      const value = record();
      value.workflowStatus = 'APPROVED';
      value.status = 'ACTIVE';
      value.versions = [
        {
          version: 1,
          payload: {},
          anchors: [{ eventType: 'ISSUE', status: state }],
        },
      ] as unknown as typeof value.versions;
      expect(issuanceBatchRow(value)).toMatchObject({
        batchState:
          state === 'COMMITTED'
            ? 'ON_CHAIN'
            : state === 'FAILED'
              ? 'ANCHOR_FAILED'
              : 'ANCHOR_PENDING',
        ready: false,
        removable: false,
      });
    },
  );
});

describe('issuance batch authorization and workflow', () => {
  it('creates a numbered issuance-year batch without changing graduation metadata', async () => {
    const { service, transaction } = setup();
    const result = await service.create(
      { issuanceYear: 2026, batchNumber: 2 },
      actor,
    );
    expect(transaction.diplomaIssuanceBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issuanceYear: 2026,
          batchNumber: 2,
          code: 'CAPBANG_2026_2',
        }),
      }),
    );
    expect(result.data).toMatchObject({
      issuanceYear: 2026,
      batchNumber: 2,
      decisionNo: null,
    });
  });
  it('allows new batches to select diplomas without constraining graduation year or decision', async () => {
    const { service, transaction } = setup();
    transaction.diplomaIssuanceBatch.findFirst.mockResolvedValue({
      ...batch,
      issuanceYear: 2026,
      batchNumber: 1,
      decisionId: null,
      graduationYear: null,
      decision: null,
    });
    await service.candidates(batch.id, new IssuanceBatchQueryDto(), actor);
    expect(
      transaction.diploma.findMany.mock.calls[0][0].where,
    ).not.toHaveProperty('graduation');
  });
  it('keeps legacy batches restricted to their original decision and graduation year', async () => {
    const { service, transaction } = setup();
    await service.candidates(batch.id, new IssuanceBatchQueryDto(), actor);
    expect(
      transaction.diploma.findMany.mock.calls[0][0].where.graduation,
    ).toMatchObject({ decisionId: batch.decisionId, graduationYear: 2024 });
  });
  it.each([
    { role: 'admin' },
    { role: 'student' },
    { isHeadquarters: false },
    { canApproveDiplomas: false },
    { campusId: '' },
  ])('denies unauthorized actors before database access %p', async (flags) => {
    const { service, database } = setup();
    await expect(
      service.list(new IssuanceBatchQueryDto(), {
        ...actor,
        ...flags,
      } as AuthActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
  it('computes the full-batch summary before pagination and filtering', async () => {
    const { service, row, transaction } = setup();
    const invalid = record();
    invalid.issuedOn = null;
    transaction.diploma.findMany.mockResolvedValue([row, invalid]);
    const result = await service.detail(
      batch.id,
      Object.assign(new IssuanceBatchQueryDto(), {
        status: 'NEEDS_REVIEW',
        limit: 1,
      }),
      actor,
    );
    expect(result.summary).toMatchObject({
      total: 2,
      DRAFT: 2,
      ready: 1,
      needsReview: 1,
    });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0].uuid).toBe(invalid.id);
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expect(transaction.diploma.updateMany).not.toHaveBeenCalled();
  });
  it('rolls back mixed or stale membership changes before any update', async () => {
    const { service, transaction } = setup();
    transaction.diploma.count.mockResolvedValue(0);
    await expect(
      service.changeMembers(
        batch.id,
        { diplomaIds: [randomUUID()] },
        true,
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.diploma.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
  it('caps batch size without silently truncating', async () => {
    const { service, transaction } = setup();
    transaction.diploma.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5000);
    await expect(
      service.changeMembers(
        batch.id,
        { diplomaIds: [randomUUID()] },
        true,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.diploma.updateMany).not.toHaveBeenCalled();
  });
  it('binds every signed document to its checked batch and timestamp', async () => {
    const { service, row, certificates } = setup();
    const result = await service.publish(
      batch.id,
      {
        entries: [
          {
            uuid: row.id,
            expectedUpdatedAt: row.updatedAt.toISOString(),
            expectedReviewToken: issuanceBatchRow(row).reviewToken,
          },
        ],
      },
      actor,
    );
    expect(certificates.approveCert).toHaveBeenCalledWith(
      row.id,
      actor,
      undefined,
      undefined,
      undefined,
      {
        id: batch.id,
        updatedAt: row.updatedAt.toISOString(),
        reviewToken: issuanceBatchRow(row).reviewToken,
      },
    );
    expect(result).toMatchObject({
      succeeded: 1,
      failed: 0,
      results: [{ status: 'ANCHOR_PENDING' }],
    });
  });
  it('keeps per-record failures and continues remaining records', async () => {
    const { service, row, transaction, certificates } = setup();
    const invalid = record();
    invalid.issuedOn = null;
    transaction.diploma.findFirst
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(row);
    const result = await service.publish(
      batch.id,
      {
        entries: [invalid, row].map((value) => ({
          uuid: value.id,
          expectedUpdatedAt: value.updatedAt.toISOString(),
          expectedReviewToken: issuanceBatchRow(value).reviewToken,
        })),
      },
      actor,
    );
    expect(result).toMatchObject({ succeeded: 1, failed: 1 });
    expect(result.results[0].error).toContain('Ngày cấp');
    expect(certificates.approveCert).toHaveBeenCalledTimes(1);
  });
  it('rechecks batch membership under the diploma row lock before signing', async () => {
    const row = record();
    const transaction = {
      campus: {
        findFirst: jest.fn().mockResolvedValue({ fabricMspId: 'TestMSP' }),
      },
      $queryRaw: jest.fn(),
      diploma: { findFirst: jest.fn().mockResolvedValue(row) },
    };
    const database = {
      $transaction: (
        callback: (client: typeof transaction) => Promise<unknown>,
      ) => callback(transaction),
    };
    const service = new CertService(database as unknown as DatabaseService);
    await expect(
      service.approveCert(row.id, actor, undefined, undefined, undefined, {
        id: randomUUID(),
        updatedAt: row.updatedAt.toISOString(),
        reviewToken: issuanceBatchRow(row).reviewToken,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('uses a consistent database snapshot for complete batch checks', async () => {
    const { service, database } = setup();
    await service.detail(batch.id, new IssuanceBatchQueryDto(), actor);
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    } satisfies { isolationLevel: Prisma.TransactionIsolationLevel });
  });
});

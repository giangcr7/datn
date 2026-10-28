import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CertService } from './cert.service';
import { reviewedDiplomaErrors } from './reviewed-diploma';
import { diplomaPayload } from '../database/diploma-hash';
import {
  BulkDiplomaDto,
  BulkRejectDiplomaDto,
} from '../common/dto/bulk-diploma.dto';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import type { DiplomaWithRelations } from '../database/diploma-projection';

const maker = {
  id: randomUUID(),
  role: 'university',
  institutionId: randomUUID(),
  campusId: randomUUID(),
  org: 'ORG2',
  isHeadquarters: true,
  canApproveDiplomas: true,
} as AuthActor;
const checker = {
  ...maker,
  id: randomUUID(),
  campusId: randomUUID(),
  isHeadquarters: true,
  canApproveDiplomas: true,
};
const diplomaIds = [randomUUID(), randomUUID(), randomUUID()];

function reviewedRecord() {
  return {
    id: diplomaIds[0],
    certificateNo: 'CERT-1',
    registryNo: 'REG-1',
    issuedOn: new Date('2024-06-01'),
    status: 'DRAFT',
    workflowStatus: 'DRAFT',
    versions: [],
    campus: { code: 'ORG2', name: 'HCM' },
    graduation: {
      graduationYear: 2024,
      classification: 'GOOD',
      gpa: null,
      gpaScale: 4,
      student: {
        studentCode: '0012345678',
        fullName: 'Test student',
        dateOfBirth: new Date('2002-01-01'),
      },
      program: { name: 'Program' },
      sourceRow: {
        id: randomUUID(),
        batchId: randomUUID(),
        status: 'IMPORTED',
        sheetName: '2024',
        rowNumber: 2,
        normalizedData: { issuedOn: '2024-06-01' },
        overrides: null,
        batch: { document: { fileName: 'registry.xlsx' } },
      },
    },
  } as unknown as DiplomaWithRelations;
}

function submissionFixture(
  record: DiplomaWithRelations | null = reviewedRecord(),
) {
  const transaction = {
    $queryRaw: jest.fn(),
    diploma: {
      findFirst: jest.fn().mockResolvedValue(record),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    diplomaEvent: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    outboxEvent: { create: jest.fn() },
    blockchainAnchor: { create: jest.fn() },
  };
  const service = new CertService({
    $transaction: (callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
  } as unknown as DatabaseService);
  return { transaction, service };
}

describe('reviewed diploma submission', () => {
  it('submits stored reviewed values without changing the original issue date or creating an anchor', async () => {
    const { service, transaction } = submissionFixture();
    const result = await service.submitDraft(diplomaIds[0], undefined, maker);
    expect(result.status).toBe('PENDING');
    expect(transaction.$queryRaw).toHaveBeenCalled();
    expect(transaction.diploma.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          institutionId: maker.institutionId,
          campusId: maker.campusId,
          status: 'DRAFT',
          workflowStatus: 'DRAFT',
        }),
      }),
    );
    const data = transaction.diploma.updateMany.mock.calls[0][0].data;
    expect(data.workflowStatus).toBe('REQUESTED');
    expect(data.requestedById).toBe(maker.id);
    expect(data).not.toHaveProperty('issuedOn');
    expect(transaction.outboxEvent.create).not.toHaveBeenCalled();
    expect(transaction.blockchainAnchor.create).not.toHaveBeenCalled();
  });
  it('rejects changing an already reviewed issue date during submission', async () => {
    const { service, transaction } = submissionFixture();
    await expect(
      service.submitDraft(diplomaIds[0], '2024-07-01', maker),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.diploma.updateMany).not.toHaveBeenCalled();
  });
  it.each(['READY', 'NEEDS_REVIEW', 'SKIPPED'])(
    'does not submit an unfinalized source row: %s',
    async (status) => {
      const record = reviewedRecord();
      record.graduation.sourceRow!.status = status as 'READY';
      const { service, transaction } = submissionFixture(record);
      await expect(
        service.submitDraft(record.id, undefined, maker),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction.diploma.updateMany).not.toHaveBeenCalled();
    },
  );
  it('rejects clearing an issue date already recorded in the source', async () => {
    const record = reviewedRecord();
    record.issuedOn = null;
    const { service } = submissionFixture(record);
    await expect(
      service.submitDraft(record.id, undefined, maker),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['DIGITIZATION', 'ISSUANCE'])(
    'blocks submission without a confirmed date for %s',
    async (originType) => {
      const record = reviewedRecord();
      record.originType = originType;
      record.issuedOn = null;
      record.graduation.sourceRow!.normalizedData = { issuedOn: null };
      const { service, transaction } = submissionFixture(record);
      await expect(
        service.submitDraft(record.id, undefined, maker),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction.diploma.updateMany).not.toHaveBeenCalled();
    },
  );
  it('does not treat a cleared source date as an originally unrecorded date', () => {
    const record = reviewedRecord();
    record.issuedOn = null;
    record.graduation.sourceRow!.overrides = { issuedOn: null };
    expect(reviewedDiplomaErrors(record)).toContain(
      'Cần xác nhận ngày cấp trước khi gửi yêu cầu',
    );
    expect(diplomaPayload(record)).not.toHaveProperty('issueDateStatus');
  });
  it('keeps dated payloads compatible with existing anchored hashes', () => {
    const record = reviewedRecord();
    expect(diplomaPayload(record)).toMatchObject({ issueDate: '2024-06-01' });
    expect(diplomaPayload(record)).not.toHaveProperty('issueDateStatus');
    expect(diplomaPayload(record)).not.toHaveProperty('sourceRegistry');
  });
  it('blocks approval without a date even when a source row exists', async () => {
    const record = reviewedRecord();
    record.issuedOn = null;
    record.workflowStatus = 'REQUESTED';
    record.requestedById = maker.id;
    record.graduation.sourceRow!.normalizedData = { issuedOn: null };
    const transaction = {
      $queryRaw: jest.fn(),
      campus: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: checker.campusId, fabricMspId: 'Org1MSP' }),
      },
      diploma: {
        findFirst: jest.fn().mockResolvedValue(record),
        update: jest.fn(),
      },
      diplomaVersion: {
        create: jest.fn().mockResolvedValue({ id: 'version-1' }),
      },
      blockchainAnchor: { create: jest.fn() },
      outboxEvent: { create: jest.fn() },
      diplomaEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new CertService({
      $transaction: (callback: any) => callback(transaction),
    } as unknown as DatabaseService);
    await expect(
      service.approveCert(record.id, checker),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.diplomaVersion.create).not.toHaveBeenCalled();
    record.graduation.sourceRow = null;
    await expect(
      service.approveCert(record.id, checker),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('does not accept a record that is outside the maker scope or already submitted', async () => {
    const { service } = submissionFixture(null);
    await expect(
      service.submitDraft(diplomaIds[0], undefined, maker),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('handles a concurrent submission without creating a second requested event', async () => {
    const { service, transaction } = submissionFixture();
    transaction.diploma.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.submitDraft(diplomaIds[0], undefined, maker),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.diplomaEvent.create).not.toHaveBeenCalled();
  });
  it.each(['2001-01-01', '2023-12-31', '2099-01-01'])(
    'blocks an invalid reviewed timeline: %s',
    (date) => {
      const record = reviewedRecord();
      record.issuedOn = new Date(date);
      expect(reviewedDiplomaErrors(record).length).toBeGreaterThan(0);
    },
  );
});

describe('bulk diploma processing', () => {
  it('submits one or multiple IDs using stored data and continues after a per-row conflict', async () => {
    const service = new CertService({} as DatabaseService);
    const submit = jest.spyOn(service, 'submitDraft').mockResolvedValue({
      success: true,
      uuid: diplomaIds[0],
      status: 'PENDING',
    });
    submit.mockRejectedValueOnce(new ConflictException('Already requested'));
    const result = await service.processBulk('submit', diplomaIds, maker);
    expect(result).toMatchObject({ total: 3, succeeded: 2, failed: 1 });
    expect(result.results[0]).toMatchObject({
      success: false,
      error: 'Already requested',
    });
    expect(result.results[2].success).toBe(true);
    expect(submit).toHaveBeenNthCalledWith(2, diplomaIds[1], undefined, maker);
  });
  it('approves records separately, leaving each successful result waiting for Fabric', async () => {
    const service = new CertService({} as DatabaseService);
    const approve = jest.spyOn(service, 'approveCert').mockResolvedValue({
      success: true,
      uuid: diplomaIds[0],
      hash: 'hash',
      status: 'ANCHOR_PENDING',
      issuingCampusId: checker.campusId,
      issuerMspId: 'Org1MSP',
      message: '',
    });
    const result = await service.processBulk('approve', diplomaIds, checker);
    expect(approve).toHaveBeenCalledTimes(3);
    expect(
      result.results.every((record) => record.status === 'ANCHOR_PENDING'),
    ).toBe(true);
  });
  it('requires a meaningful rejection reason and passes the trimmed reason per record', async () => {
    const service = new CertService({} as DatabaseService);
    const reject = jest
      .spyOn(service, 'rejectCert')
      .mockResolvedValue({ success: true, message: 'Rejected' });
    await expect(
      service.processBulk('reject', diplomaIds, checker, '  '),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reject).not.toHaveBeenCalled();
    const result = await service.processBulk(
      'reject',
      diplomaIds,
      checker,
      '  Source mismatch  ',
    );
    expect(result.failed).toBe(0);
    expect(reject).toHaveBeenCalledWith(
      diplomaIds[0],
      'Source mismatch',
      checker,
      undefined,
    );
  });
  it.each([
    ['approve', { ...maker, canApproveDiplomas: false }],
    ['reject', { ...maker, canApproveDiplomas: false }],
    ['approve', { ...checker, role: 'admin' }],
    ['submit', { ...checker, isHeadquarters: false }],
    ['submit', { ...maker, role: 'student' }],
  ])(
    'rejects unauthorized %s before processing any rows',
    async (action, actor) => {
      const service = new CertService({} as DatabaseService);
      const submit = jest.spyOn(service, 'submitDraft');
      const approve = jest.spyOn(service, 'approveCert');
      await expect(
        service.processBulk(
          action as 'submit',
          diplomaIds,
          actor as AuthActor,
          'Reason',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(submit).not.toHaveBeenCalled();
      expect(approve).not.toHaveBeenCalled();
    },
  );
  it.each([
    [],
    [diplomaIds[0], diplomaIds[0]],
    ['not-a-uuid'],
    Array.from({ length: 101 }, () => randomUUID()),
  ])(
    'rejects empty, duplicate, malformed or oversized selections',
    async (...selection) => {
      const service = new CertService({} as DatabaseService);
      const ids = Array.isArray(selection[0]) ? selection[0] : selection;
      await expect(
        service.processBulk('submit', ids as string[], maker),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('returns campus-scoped paginated candidates from finalized review rows only', async () => {
    const record = reviewedRecord();
    const findMany = jest.fn().mockResolvedValue([record]);
    const service = new CertService({
      diploma: { findMany, count: jest.fn().mockResolvedValue(1) },
    } as unknown as DatabaseService);
    const result = await service.findRequestCandidates(
      2,
      20,
      '',
      undefined,
      maker,
    );
    expect(result.data[0].requestErrors).toEqual([]);
    expect(result.data[0].sourceFileName).toBe('registry.xlsx');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              institutionId: maker.institutionId,
              campusId: maker.campusId,
            }),
          ]),
          workflowStatus: 'DRAFT',
          graduation: { sourceRow: { status: 'IMPORTED' } },
        }),
      }),
    );
  });
  it('paginates headquarters pending requests instead of silently truncating to 100', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new CertService({
      diploma: { findMany, count: jest.fn().mockResolvedValue(1955) },
    } as unknown as DatabaseService);
    const result = await service.findPendingPaginated(
      2,
      100,
      '',
      undefined,
      checker,
    );
    expect(result.pagination).toMatchObject({ total: 1955, totalPages: 20 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 100,
        take: 100,
        where: expect.objectContaining({
          AND: [{ institutionId: maker.institutionId }, {}],
        }),
      }),
    );
  });
});

describe('bulk request DTO validation', () => {
  it.each([
    { diplomaIds: [] },
    { diplomaIds: ['invalid'] },
    { diplomaIds: [diplomaIds[0], diplomaIds[0]] },
    { diplomaIds: Array.from({ length: 101 }, () => randomUUID()) },
  ])('rejects unsafe selections at the HTTP boundary', async (body) => {
    expect(
      (await validate(plainToInstance(BulkDiplomaDto, body))).length,
    ).toBeGreaterThan(0);
  });
  it('accepts a single ID and rejects an extra rejection payload on a submission', async () => {
    expect(
      await validate(
        plainToInstance(BulkDiplomaDto, { diplomaIds: [diplomaIds[0]] }),
      ),
    ).toEqual([]);
    expect(
      (
        await validate(
          plainToInstance(BulkDiplomaDto, { diplomaIds, reason: 'extra' }),
          { whitelist: true, forbidNonWhitelisted: true },
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('requires a rejection reason in a bulk rejection', async () => {
    expect(
      (await validate(plainToInstance(BulkRejectDiplomaDto, { diplomaIds })))
        .length,
    ).toBeGreaterThan(0);
  });
});

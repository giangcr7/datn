import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import type { Prisma } from '../generated/prisma/client';
import { CorrectionService } from './correction.service';
import { CorrectionActionDto, CorrectionQueryDto } from './correction.dto';

const actor = {
  id: randomUUID(),
  institutionId: randomUUID(),
  campusId: randomUUID(),
  email: 'officer@example.test',
  role: 'university',
  isHeadquarters: true,
  canApproveDiplomas: true,
} as AuthActor;
const uuid = randomUUID();
const updatedAt = new Date('2026-10-28T00:00:00Z');
const action = {
  note: '  Đã đối chiếu hồ sơ gốc  ',
  expectedUpdatedAt: updatedAt.toISOString(),
};

function setup(stage = 'REJECTED') {
  const record = {
    id: uuid,
    status: 'DRAFT',
    workflowStatus: stage,
    updatedAt,
    institution: { name: 'Trường', nameEn: 'University' },
    campus: { name: 'Cơ sở chính', code: 'MAIN' },
    issuingCampus: null,
    signedDocuments: [],
    versions: [],
    certificateNo: '001VB',
    registryNo: '0001',
    issuedOn: new Date('2024-06-01'),
    printTemplate: 'tlu-bilingual-v1',
    issuePlace: 'TP. Hồ Chí Minh',
    majorNameEn: 'Information Technology',
    diplomaSignerName: 'Nguyễn Văn A',
    diplomaSignerTitle: 'HIỆU TRƯỞNG',
    graduation: {
      id: randomUUID(),
      studentId: randomUUID(),
      graduationYear: 2024,
      gpa: 3.2,
      gpaScale: 4,
      classification: 'GOOD',
      degreeType: 'ENGINEER',
      student: {
        fullName: 'Nguyễn Văn B',
        studentCode: '0012345678',
        dateOfBirth: new Date('2000-01-01'),
      },
      program: {
        active: true,
        name: 'Công nghệ thông tin',
        nameEn: 'Information Technology',
      },
      sourceRow: null,
    },
    events: [
      {
        id: 'rejection-1',
        reason: 'Sai tên người ký',
        createdAt: updatedAt,
        actor: { displayName: 'Cán bộ' },
      },
    ],
  };
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ sourceRowId: null }]),
    diploma: {
      findFirst: jest.fn().mockResolvedValue(record),
      findMany: jest
        .fn<Promise<(typeof record)[]>, [Prisma.DiplomaFindManyArgs]>()
        .mockResolvedValue([record]),
      count: jest.fn().mockResolvedValue(1),
      update: jest
        .fn<Promise<typeof record>, [Prisma.DiplomaUpdateArgs]>()
        .mockResolvedValue(record),
    },
    diplomaEvent: {
      findFirst: jest
        .fn<
          Promise<{ id: string } | null>,
          [Prisma.DiplomaEventFindFirstArgs]
        >()
        .mockResolvedValue({ id: 'reopened-1' }),
      create: jest.fn<Promise<void>, [Prisma.DiplomaEventCreateArgs]>(),
    },
    auditLog: { create: jest.fn<Promise<void>, [Prisma.AuditLogCreateArgs]>() },
  };
  const database = {
    $transaction: jest.fn(
      async (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  return {
    service: new CorrectionService(database as unknown as DatabaseService),
    transaction,
    record,
    database,
  };
}

describe('rejected diploma recovery', () => {
  it.each([
    { role: 'admin' },
    { role: 'student' },
    { role: 'employer' },
    { isHeadquarters: false },
    { canApproveDiplomas: false },
    { institutionId: undefined },
    { campusId: undefined },
    { id: undefined },
  ])(
    'denies unauthorized or missing-scope actor %p before any access',
    async (flags) => {
      const { service, database } = setup();
      const reader = { ...actor, ...flags } as AuthActor;
      for (const operation of [
        () => service.list(new CorrectionQueryDto(), reader),
        () => service.reopen(uuid, action, reader),
        () => service.resubmit(uuid, action, reader),
      ])
        await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
      expect(database.$transaction).not.toHaveBeenCalled();
    },
  );
  it('scopes pagination and count identically and returns the latest rejection', async () => {
    const { service, transaction } = setup();
    const result = await service.list(
      Object.assign(new CorrectionQueryDto(), {
        page: 2,
        limit: 10,
        search: '001',
      }),
      actor,
    );
    const query = transaction.diploma.findMany.mock.calls[0][0];
    expect(query).toMatchObject({
      where: {
        institutionId: actor.institutionId,
        campusId: actor.campusId,
        workflowStatus: 'REJECTED',
        status: 'DRAFT',
      },
      skip: 10,
      take: 10,
    });
    expect(transaction.diploma.count).toHaveBeenCalledWith({
      where: query.where,
    });
    expect(result.data[0].rejection?.reason).toBe('Sai tên người ký');
  });
  it('does not mix ordinary drafts with reopened rejected records', async () => {
    const { service, transaction } = setup('DRAFT');
    await service.list(
      Object.assign(new CorrectionQueryDto(), { stage: 'DRAFT' }),
      actor,
    );
    expect(transaction.diploma.findMany.mock.calls[0][0].where).toMatchObject({
      events: { some: { eventType: 'REOPENED' } },
    });
  });
  it('reopens the same unissued record and appends history without deleting the rejection', async () => {
    const { service, transaction } = setup();
    expect((await service.reopen(uuid, action, actor)).status).toBe('DRAFT');
    expect(transaction.diploma.update).toHaveBeenCalledWith({
      where: { id: uuid },
      data: { workflowStatus: 'DRAFT', requestedById: null, requestedAt: null },
    });
    expect(transaction.diplomaEvent.create.mock.calls[0][0].data).toMatchObject(
      {
        eventType: 'REOPENED',
        reason: 'Đã đối chiếu hồ sơ gốc',
        metadata: { rejectionEventId: 'rejection-1' },
      },
    );
    expect(transaction.auditLog.create.mock.calls[0][0].data.action).toBe(
      'REOPEN_REJECTED_DIPLOMA',
    );
  });
  it.each(['stale', 'wrong-stage', 'signed', 'versioned'])(
    'refuses unsafe reopening: %s',
    async (failure) => {
      const { service, record, transaction } = setup();
      if (failure === 'stale')
        record.updatedAt = new Date(updatedAt.getTime() + 1);
      if (failure === 'wrong-stage') record.workflowStatus = 'APPROVED';
      if (failure === 'signed') (record.signedDocuments as unknown[]).push({});
      if (failure === 'versioned') (record.versions as unknown[]).push({});
      await expect(service.reopen(uuid, action, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(transaction.diploma.update).not.toHaveBeenCalled();
    },
  );
  it('hides another campus record before reading its data', async () => {
    const { service, transaction } = setup();
    transaction.$queryRaw.mockResolvedValue([]);
    await expect(service.reopen(uuid, action, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(transaction.diploma.findFirst).not.toHaveBeenCalled();
  });
  it('requires a real nonblank handling note', async () => {
    const { service } = setup();
    await expect(
      service.reopen(uuid, { ...action, note: '   ' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('resubmits only to REQUESTED and retains the same document identity', async () => {
    const { service, transaction } = setup('DRAFT');
    expect(await service.resubmit(uuid, action, actor)).toEqual({
      success: true,
      uuid,
      status: 'PENDING',
    });
    expect(
      transaction.diploma.update.mock.calls[0][0].data.workflowStatus,
    ).toBe('REQUESTED');
    expect(
      transaction.diplomaEvent.create.mock.calls[0][0].data.eventType,
    ).toBe('RESUBMITTED');
  });
  it('checks data again on resubmission rather than trusting UI flags', async () => {
    const { service, record, transaction } = setup('DRAFT');
    record.diplomaSignerName = '';
    await expect(service.resubmit(uuid, action, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction.diploma.update).not.toHaveBeenCalled();
  });
  it('rejects ordinary drafts sent to the recovery endpoint', async () => {
    const { service, transaction } = setup('DRAFT');
    transaction.diplomaEvent.findFirst.mockResolvedValue(null);
    await expect(service.resubmit(uuid, action, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('validates strict paging and concurrency DTO values', async () => {
    expect(
      await validate(
        plainToInstance(CorrectionQueryDto, {
          stage: 'REJECTED',
          page: 1,
          limit: 20,
        }),
      ),
    ).toHaveLength(0);
    for (const invalid of [{ page: 0 }, { limit: 101 }, { stage: 'APPROVED' }])
      expect(
        (await validate(plainToInstance(CorrectionQueryDto, invalid))).length,
      ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(CorrectionActionDto, {
            note: 'Đối chiếu',
            expectedUpdatedAt: 'bad-date',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});

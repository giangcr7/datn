import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditService } from './audit.service';
import type { DatabaseService } from '../database/database.service';
import type { AuthActor } from '../auth/auth-actor';
import type { Prisma } from '../generated/prisma/client';

const actor = { institutionId: 'institution1', role: 'admin' } as AuthActor;

describe('audit isolation and durability', () => {
  it('allows the main officer to filter institution history', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = new AuditService({
      auditLog: { findMany, count },
    } as unknown as DatabaseService);
    await service.findAll(
      {
        ...actor,
        role: 'university',
        isHeadquarters: true,
        canApproveDiplomas: true,
      },
      2,
      20,
      'APPROVE_CERT',
      {
        search: 'staff',
        result: 'SUCCESS',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-31T23:59:59Z',
      },
    );
    const query = (
      findMany.mock.calls as [Prisma.AuditLogFindManyArgs][]
    )[0][0];
    expect(query).toMatchObject({
      skip: 20,
      take: 20,
      where: {
        institutionId: actor.institutionId,
        action: 'APPROVE_CERT',
        result: 'SUCCESS',
      },
    });
    expect(query.where?.OR).toHaveLength(3);
    expect(query.where?.createdAt).toEqual({
      gte: new Date('2026-10-01T00:00:00Z'),
      lte: new Date('2026-10-31T23:59:59Z'),
    });
    expect(count).toHaveBeenCalledWith({
      where: query.where,
    });
  });

  it.each([
    { role: 'student' },
    { role: 'university', isHeadquarters: false, canApproveDiplomas: true },
    { role: 'university', isHeadquarters: true, canApproveDiplomas: false },
  ])('rejects unauthorized log readers: %j', async (flags) => {
    const service = new AuditService({} as DatabaseService);
    await expect(
      service.findAll({ ...actor, ...flags } as AuthActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects reversed and malformed dates', async () => {
    const service = new AuditService({} as DatabaseService);
    await expect(
      service.findAll(actor, 1, 20, undefined, {
        from: '2026-10-31',
        to: '2026-10-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.findAll(actor, 1, 20, undefined, { from: 'invalid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('scopes audit results and counts to the current institution', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = new AuditService({
      auditLog: { findMany, count },
    } as unknown as DatabaseService);
    await service.findAll(actor, 1, 20, 'LOGIN');
    const where = { institutionId: actor.institutionId, action: 'LOGIN' };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('resolves import-row references in batches within the institution', async () => {
    const rowId = '11111111-1111-4111-8111-111111111111';
    const diplomaId = '22222222-2222-4222-8222-222222222222';
    const graduationId = '33333333-3333-4333-8333-333333333333';
    const actorId = '44444444-4444-4444-8444-444444444444';
    const entry = {
      id: '55555555-5555-4555-8555-555555555555',
      actorId,
      actorEmail: 'staff@example.test',
      action: 'COMMIT_IMPORT_ROW',
      target: rowId,
      metadata: { diplomaId, graduationId, originType: 'ISSUANCE' },
    };
    const diplomaFind = jest.fn().mockResolvedValue([
      {
        id: diplomaId,
        certificateNo: 'VB-001',
        registryNo: 'SO-001',
        issuedOn: null,
        status: 'DRAFT',
        workflowStatus: 'DRAFT',
        campus: { name: 'Campus' },
        graduation: {
          graduationYear: 2025,
          student: { fullName: 'Student Name', studentCode: 'SV001' },
          program: { name: 'Computing' },
        },
      },
    ]);
    const graduationFind = jest.fn().mockResolvedValue([
      {
        id: graduationId,
        graduationYear: 2025,
        student: { fullName: 'Student Name', studentCode: 'SV001' },
        program: { name: 'Computing' },
        decision: { documentNumber: 'QD-001' },
      },
    ]);
    const accountFind = jest
      .fn()
      .mockResolvedValue([{ id: actorId, displayName: 'Officer' }]);
    const rowFind = jest.fn().mockResolvedValue([
      {
        id: rowId,
        rowNumber: 2,
        sheetName: '2025',
        status: 'IMPORTED',
        reviewedAt: null,
        batch: { document: { fileName: 'import.xlsx' } },
      },
    ]);
    const service = new AuditService({
      auditLog: {
        findMany: jest.fn().mockResolvedValue([entry]),
        count: jest.fn().mockResolvedValue(1),
      },
      diploma: { findMany: diplomaFind },
      graduationRecord: { findMany: graduationFind },
      account: { findMany: accountFind },
      importRow: { findMany: rowFind },
    } as unknown as DatabaseService);

    const result = await service.findAll(actor);
    expect(diplomaFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [diplomaId] }, institutionId: actor.institutionId },
      }),
    );
    expect(graduationFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [graduationId] },
          institutionId: actor.institutionId,
        },
      }),
    );
    expect(accountFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [actorId] },
          memberships: {
            some: { campus: { institutionId: actor.institutionId } },
          },
        },
      }),
    );
    expect(rowFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [rowId] },
          batch: { institutionId: actor.institutionId },
        },
      }),
    );
    expect(result.data[0].actorName).toBe('Officer');
    expect(result.data[0].targetKind).toBe('import-row');
    expect(result.data[0].targetLabel).toContain('import.xlsx');
    expect(result.data[0].metadata).toEqual(entry.metadata);
    expect(
      result.data[0].references.find((ref) => ref.key === 'target')?.details,
    ).toMatchObject({
      sourceFile: 'import.xlsx',
      rowNumber: 2,
      importRowStatus: 'IMPORTED',
    });
    expect(
      result.data[0].references.find((ref) => ref.key === 'diplomaId')?.details,
    ).toMatchObject({
      fullName: 'Student Name',
      studentCode: 'SV001',
      certificateNo: 'VB-001',
      registryNo: 'SO-001',
      diplomaStatus: 'DRAFT',
    });
    expect(
      result.data[0].references.find((ref) => ref.key === 'graduationId')
        ?.details,
    ).toMatchObject({ decisionNumber: 'QD-001' });
  });

  it('keeps unresolved references without inventing related details', async () => {
    const diplomaId = '22222222-2222-4222-8222-222222222222';
    const service = new AuditService({
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            actorId: null,
            action: 'COMMIT_IMPORT_ROW',
            target: null,
            metadata: { diplomaId },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      diploma: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as DatabaseService);
    const result = await service.findAll(actor);
    expect(result.data[0]).toMatchObject({
      actorName: null,
      targetLabel: null,
      references: [{ key: 'diplomaId', value: diplomaId }],
    });
    expect(result.data[0].references[0]).not.toHaveProperty('details');
  });

  it('does not expose user audit events from another institution', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new AuditService({
      auditLog: { findMany },
    } as unknown as DatabaseService);
    await service.findByUser('other-user', actor);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { actorId: 'other-user', institutionId: actor.institutionId },
      }),
    );
  });

  it('propagates audit failures in a business transaction', async () => {
    const failure = new Error('audit unavailable');
    const create = jest.fn().mockRejectedValue(failure);
    const transaction = {
      auditLog: { create },
    } as unknown as Prisma.TransactionClient;
    const service = new AuditService({} as DatabaseService);
    await expect(
      service.log(
        {
          institutionId: actor.institutionId,
          userEmail: 'staff@example.test',
          action: 'CHANGE_PASSWORD',
        },
        transaction,
      ),
    ).rejects.toBe(failure);
  });

  it('uses the active institution instead of an arbitrary first membership', async () => {
    const create = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn();
    const transaction = {
      auditLog: { create },
      account: { findUnique },
    } as unknown as Prisma.TransactionClient;
    const service = new AuditService({} as DatabaseService);
    await service.log(
      {
        userId: '00000000-0000-0000-0000-000000000001',
        institutionId: actor.institutionId,
        userEmail: 'staff@example.test',
        action: 'LOGIN',
      },
      transaction,
    );
    expect(findUnique).not.toHaveBeenCalled();
    expect(create.mock.calls).toMatchObject([
      [
        {
          data: {
            institutionId: actor.institutionId,
          },
        },
      ],
    ]);
  });

  it('raises email and IP burst alerts from failed logins in the lookback window', async () => {
    const start = new Date('2026-11-07T10:00:00Z');
    const failures = [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `email-${index}`,
        action: 'LOGIN',
        actorEmail: 'staff@example.test',
        ip: `192.0.2.${index + 1}`,
        createdAt: new Date(start.getTime() + index * 60_000),
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `ip-${index}`,
        action: 'LOGIN',
        actorEmail: `user-${index}@example.test`,
        ip: '198.51.100.8',
        createdAt: new Date(start.getTime() + index * 60_000),
      })),
    ];
    const findMany = jest.fn().mockResolvedValue(failures);
    const service = new AuditService({
      auditLog: { findMany },
    } as unknown as DatabaseService);

    const result = await service.securitySummary(actor);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          institutionId: actor.institutionId,
          action: { in: ['LOGIN', 'RATE_LIMITED'] },
          result: 'FAILED',
        }),
        take: 1000,
      }),
    );
    expect(result.failedLogins).toBe(15);
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'EMAIL_FAILURE_BURST',
          subject: 'staff@example.test',
          count: 5,
        }),
        expect.objectContaining({
          kind: 'IP_FAILURE_BURST',
          subject: '198.51.100.8',
          count: 10,
        }),
      ]),
    );
  });

  it('raises a rate-limit burst alert from blocked requests', async () => {
    const start = new Date('2026-11-07T10:00:00Z');
    const blocked = Array.from({ length: 3 }, (_, index) => ({
      id: `rate-${index}`,
      action: 'RATE_LIMITED',
      actorEmail: 'staff@example.test',
      ip: '198.51.100.9',
      createdAt: new Date(start.getTime() + index * 60_000),
    }));
    const findMany = jest
      .fn()
      .mockResolvedValueOnce(blocked)
      .mockResolvedValueOnce([]);
    const service = new AuditService({
      auditLog: { findMany },
    } as unknown as DatabaseService);

    const result = await service.securitySummary(actor);

    expect(result.failedLogins).toBe(0);
    expect(result.rateLimitedRequests).toBe(3);
    expect(result.alerts).toEqual([
      expect.objectContaining({
        kind: 'RATE_LIMIT_BURST',
        subjectType: 'IP',
        subject: '198.51.100.9',
        count: 3,
        auditIds: ['rate-0', 'rate-1', 'rate-2'],
      }),
    ]);
  });

  it('stores security alert status changes as audit events', async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = new AuditService({
      auditLog: { create },
    } as unknown as DatabaseService);

    await expect(
      service.updateSecurityAlertStatus(
        'a'.repeat(64),
        'RESOLVED',
        'Đã kiểm tra và khóa nguồn truy cập',
        {
          ...actor,
          id: '00000000-0000-0000-0000-000000000001',
          email: 'admin@example.test',
        } as AuthActor,
        '192.0.2.10',
      ),
    ).resolves.toEqual({
      success: true,
      id: 'a'.repeat(64),
      status: 'RESOLVED',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SECURITY_ALERT_STATUS',
          target: 'a'.repeat(64),
          result: 'SUCCESS',
          ip: '192.0.2.10',
          metadata: expect.objectContaining({
            status: 'RESOLVED',
            note: 'Đã kiểm tra và khóa nguồn truy cập',
          }),
        }),
      }),
    );
  });
});

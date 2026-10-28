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
});

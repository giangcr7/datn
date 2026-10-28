import { AuthService } from './auth.service';
import type { DatabaseService } from '../database/database.service';
import type { AuthActor } from './auth-actor';
import type { JwtService } from '@nestjs/jwt';
import type { AuditService } from '../audit/audit.service';
import type { NotifyService } from '../notify/notify.service';
import { UnauthorizedException } from '@nestjs/common';

describe('archived campus access', () => {
  it('rejects a membership whose campus is no longer active', () => {
    const service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(() =>
      service.actor(
        {
          active: true,
          memberships: [{ id: 'old-membership', campus: { active: false } }],
        } as never,
        'old-membership',
      ),
    ).toThrow(UnauthorizedException);
  });
});

describe('account list isolation', () => {
  it('limits accounts and memberships to the active institution', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new AuthService(
      { account: { findMany } } as unknown as DatabaseService,
      {} as JwtService,
      {} as AuditService,
      {} as NotifyService,
    );
    const actor = { institutionId: 'institution1' } as AuthActor;
    await service.findAllUsers(actor);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          memberships: {
            some: { campus: { institutionId: actor.institutionId } },
          },
        },
        select: expect.objectContaining({
          memberships: {
            where: { campus: { institutionId: actor.institutionId } },
            select: { role: true, campusId: true },
          },
        }),
      }),
    );
  });
});

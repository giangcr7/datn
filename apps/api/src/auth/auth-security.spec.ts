import { randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import type { AuthActor } from './auth-actor';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt.guard';
import { ALLOW_PASSWORD_CHANGE } from './decorators/allow-password-change.decorator';

type Session = {
  id: string;
  accountId: string;
  membershipId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById?: string;
};
const passwordHash = hash('fixture-old-password', 4);

async function fixture() {
  const sessions = new Map<string, Session>();
  const account = {
    id: randomUUID(),
    email: 'staff@example.invalid',
    displayName: 'Fixture',
    active: true,
    mustChangePassword: false,
    sessionVersion: 0,
    studentId: null,
    passwordHash: await passwordHash,
    memberships: [
      {
        id: randomUUID(),
        role: 'UNIVERSITY',
        canApproveDiplomas: true,
        campusId: randomUUID(),
        campus: {
          active: true,
          institutionId: randomUUID(),
          code: 'FIXTURE',
          name: 'Fixture',
          isHeadquarters: true,
        },
      },
    ],
  };
  const database = {
    account: {
      findUnique: jest.fn(() => Promise.resolve(account)),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(account)),
      update: jest.fn(
        ({
          data,
        }: {
          data: Partial<Omit<typeof account, 'sessionVersion'>> & {
            sessionVersion?: { increment: number };
          };
        }) => {
          const { sessionVersion, ...rest } = data;
          Object.assign(account, rest);
          if (sessionVersion?.increment)
            account.sessionVersion += sessionVersion.increment;
          return Promise.resolve(account);
        },
      ),
    },
    refreshSession: {
      create: jest.fn(
        ({ data }: { data: Omit<Session, 'id' | 'revokedAt'> }) => {
          const session = {
            id: randomUUID(),
            revokedAt: null,
            ...data,
          } as Session;
          sessions.set(session.id, session);
          return Promise.resolve(session);
        },
      ),
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; tokenHash?: string } }) =>
          Promise.resolve(
            [...sessions.values()].find((session) =>
              where.id
                ? session.id === where.id
                : session.tokenHash === where.tokenHash,
            ) || null,
          ),
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => {
        const session = sessions.get(where.id);
        if (!session)
          return Promise.reject(new Error('Missing fixture session'));
        return Promise.resolve(session);
      }),
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: Pick<Session, 'accountId' | 'membershipId' | 'familyId'> & {
            expiresAt: { gt: Date };
          };
        }) => {
          const session = [...sessions.values()].find(
            (row) =>
              row.accountId === where.accountId &&
              row.membershipId === where.membershipId &&
              row.familyId === where.familyId &&
              row.revokedAt === null &&
              row.expiresAt > where.expiresAt.gt,
          );
          return Promise.resolve(session ? { ...session, account } : null);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<Session>;
        }) => {
          const session = sessions.get(where.id)!;
          Object.assign(session, data);
          return Promise.resolve(session);
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: Partial<Pick<Session, 'accountId' | 'familyId' | 'revokedAt'>>;
          data: Partial<Session>;
        }) => {
          let count = 0;
          for (const session of sessions.values()) {
            if (
              (!where.accountId || session.accountId === where.accountId) &&
              (!where.familyId || session.familyId === where.familyId) &&
              (where.revokedAt !== null || session.revokedAt === null)
            ) {
              Object.assign(session, data);
              count++;
            }
          }
          return Promise.resolve({ count });
        },
      ),
    },
    $queryRaw: jest.fn(() => Promise.resolve([])),
    $transaction: jest.fn(),
  };
  database.$transaction.mockImplementation((operation: unknown) => {
    if (Array.isArray(operation)) return Promise.all(operation as unknown[]);
    const callback = operation as (client: typeof database) => Promise<unknown>;
    return callback(database);
  });
  const jwt = new JwtService({
    secret: randomBytes(32).toString('hex'),
    signOptions: { expiresIn: '15m' },
  });
  const service = new AuthService(
    database as never,
    jwt,
    { log: jest.fn() } as never,
    {} as never,
  );
  const login = () =>
    service.login(account.email, 'fixture-old-password', 'university');
  return { service, account, sessions, database, jwt, login };
}

describe('access token session binding', () => {
  it('binds login access tokens to a persisted refresh family without storing raw tokens', async () => {
    const test = await fixture();
    const result = await test.login();
    const payload = test.jwt.verify<AuthActor>(result.access_token);
    const session = [...test.sessions.values()][0];
    expect(payload.sessionId).toBe(session.familyId);
    expect(session.tokenHash).not.toBe(result.refresh_token);
    await expect(test.service.validateActor(payload)).resolves.toMatchObject({
      sessionId: session.familyId,
    });
  });

  it('rejects access immediately after logout while preserving a separate device', async () => {
    const test = await fixture();
    const first = await test.login();
    const second = await test.login();
    await test.service.logout(first.refresh_token);
    await expect(
      test.service.validateActor(
        test.jwt.verify<AuthActor>(first.access_token),
      ),
    ).rejects.toThrow('thu hồi');
    await expect(
      test.service.validateActor(
        test.jwt.verify<AuthActor>(second.access_token),
      ),
    ).resolves.toHaveProperty('id', test.account.id);
    expect(test.database.$queryRaw).toHaveBeenCalled();
  });

  it('retains the family across refresh and lets an older rotated token revoke the whole device', async () => {
    const test = await fixture();
    const first = await test.login();
    const refreshed = await test.service.refreshAccessToken(
      first.refresh_token,
    );
    expect(refreshed.user.sessionId).toBe(first.user.sessionId);
    await expect(
      test.service.validateActor(
        test.jwt.verify<AuthActor>(first.access_token),
      ),
    ).resolves.toHaveProperty('id');
    await test.service.logout(first.refresh_token);
    await expect(
      test.service.validateActor(
        test.jwt.verify<AuthActor>(refreshed.access_token),
      ),
    ).rejects.toThrow('thu hồi');
    expect(
      [...test.sessions.values()].every((session) => !!session.revokedAt),
    ).toBe(true);
  });

  it('rejects legacy tokens without a family', async () => {
    const test = await fixture();
    await expect(
      test.service.validateActor({
        id: test.account.id,
        membershipId: test.account.memberships[0].id,
      } as never),
    ).rejects.toThrow('đăng nhập lại');
    expect(test.database.refreshSession.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    'expired',
    'revoked',
    'wrong-family',
    'wrong-account',
    'wrong-membership',
    'old-version',
    'locked',
  ])('rejects a %s session', async (condition) => {
    const test = await fixture();
    const login = await test.login();
    const payload = test.jwt.verify<AuthActor>(login.access_token);
    const session = [...test.sessions.values()][0];
    if (condition === 'expired') session.expiresAt = new Date(0);
    if (condition === 'revoked') session.revokedAt = new Date();
    if (condition === 'wrong-family') payload.sessionId = randomUUID();
    if (condition === 'wrong-account') payload.id = randomUUID();
    if (condition === 'wrong-membership') payload.membershipId = randomUUID();
    if (condition === 'old-version') test.account.sessionVersion++;
    if (condition === 'locked') test.account.active = false;
    await expect(test.service.validateActor(payload)).rejects.toThrow();
  });

  it('preserves refresh-token reuse detection', async () => {
    const test = await fixture();
    const first = await test.login();
    const refreshed = await test.service.refreshAccessToken(
      first.refresh_token,
    );
    await expect(
      test.service.refreshAccessToken(first.refresh_token),
    ).rejects.toThrow('dùng lại');
    await expect(
      test.service.validateActor(
        test.jwt.verify<AuthActor>(refreshed.access_token),
      ),
    ).rejects.toThrow('thu hồi');
  });

  it('keeps logout idempotent for unknown or already revoked tokens', async () => {
    const test = await fixture();
    await expect(test.service.logout('unknown')).resolves.toEqual({
      success: true,
    });
    const login = await test.login();
    await test.service.logout(login.refresh_token);
    await expect(test.service.logout(login.refresh_token)).resolves.toEqual({
      success: true,
    });
  });

  it('rejects weak passwords before database writes even when called outside a controller', async () => {
    const test = await fixture();
    await expect(
      test.service.changePassword(
        test.account.id,
        'fixture-old-password',
        '123456',
      ),
    ).rejects.toThrow('15');
    await expect(
      test.service.registerStudent(
        'FIXTURE',
        test.account.email,
        '123456',
        '123456',
      ),
    ).rejects.toThrow('15');
    expect(test.database.account.update).not.toHaveBeenCalled();
  });
});

describe('mandatory password change guard', () => {
  const passport = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
    canActivate: (context: ExecutionContext) => Promise<boolean>;
  };
  afterEach(() => jest.restoreAllMocks());

  function guard(role: string, required: boolean, allowed = false) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(allowed),
    } as unknown as Reflector;
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role, mustChangePassword: required } }),
      }),
    } as unknown as ExecutionContext;
    jest.spyOn(passport, 'canActivate').mockResolvedValue(true);
    return new JwtAuthGuard(reflector).canActivate(context);
  }

  it.each(['admin', 'university', 'student', 'employer'])(
    'blocks %s business APIs until the password is changed',
    async (role) => {
      await expect(guard(role, true)).rejects.toThrow(ForbiddenException);
    },
  );

  it.each(['admin', 'university', 'student'])(
    'allows %s after the password was changed',
    async (role) => {
      await expect(guard(role, false)).resolves.toBe(true);
    },
  );

  it('permits an explicitly allowed recovery endpoint', async () => {
    await expect(guard('university', true, true)).resolves.toBe(true);
  });

  it('marks only profile, password change and logout-all as recovery endpoints', () => {
    for (const method of ['getProfile', 'changePassword', 'logoutAll'] as const)
      expect(
        Reflect.getMetadata(
          ALLOW_PASSWORD_CHANGE,
          Reflect.get(AuthController.prototype, method) as object,
        ),
      ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_PASSWORD_CHANGE,
        Reflect.get(AuthController.prototype, 'listUsers') as object,
      ),
    ).toBeUndefined();
  });
});

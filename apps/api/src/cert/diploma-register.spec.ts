import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import { CertService } from './cert.service';
import { registerQuery } from './diploma-register';
import { RegisterQueryDto } from './register-query.dto';

const actor = {
  role: 'university',
  institutionId: 'institution1',
  campusId: 'campus1',
  isHeadquarters: true,
  canApproveDiplomas: true,
} as AuthActor;

describe('diploma register', () => {
  const transform = (input: object) =>
    plainToInstance(RegisterQueryDto, input, {
      enableImplicitConversion: true,
    });

  it('validates typed filters and defaults', async () => {
    const query = transform({
      year: '2024',
      search: '  Nguyễn An  ',
      major: '  Công nghệ thông tin  ',
      status: 'REVOKED',
      issuedFrom: '2024-02-29',
      issuedTo: '2024-12-31',
    });
    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({
      page: 1,
      limit: 20,
      year: 2024,
      search: 'Nguyễn An',
      major: 'Công nghệ thông tin',
    });
  });

  it.each([
    { page: 0 },
    { page: 1.5 },
    { limit: 101 },
    { limit: 'invalid' },
    { year: 1800 },
    { year: 2024.5 },
    { status: 'DRAFT' },
    { issuedFrom: '2023-02-29' },
    { issuedTo: '2024-01-01T00:00:00Z' },
    { search: 'a'.repeat(256) },
    { institutionId: 'other-institution' },
  ])('rejects invalid query %p', async (input) => {
    expect(
      (
        await validate(transform(input), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length,
    ).toBeGreaterThan(0);
  });

  it('parameterizes input and escapes wildcard searches', () => {
    const query = registerQuery(
      'institution1',
      transform({ search: "50%_\\'; DROP TABLE diplomas;--" }),
    );
    expect(query.text).not.toContain('DROP TABLE');
    expect(query.values).toContain("%50\\%\\_\\\\';%");
    expect(query.values).toContain('%drop%');
    expect(query.values).toContain('institution1');
    expect(query.text).toContain('newer.version > version.version');
    expect(query.text).toContain("anchor.status = 'COMMITTED'");
    expect(query.text).toContain('version.payload ->>');
  });

  it.each([
    { role: 'student' },
    { role: 'employer' },
    { isHeadquarters: false },
    { canApproveDiplomas: false },
    { institutionId: undefined },
  ])('denies unauthorized register access %p', async (flags) => {
    const database = { $transaction: jest.fn() };
    await expect(
      new CertService(database as unknown as DatabaseService).findRegister(
        new RegisterQueryDto(),
        { ...actor, ...flags } as AuthActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.$transaction).not.toHaveBeenCalled();
    await expect(
      new CertService(database as unknown as DatabaseService).suggestRegister(
        transform({ search: 'Nguyen An' }),
        { ...actor, ...flags } as AuthActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it.each(['', ' ', 'a', 'ế'])(
    'skips suggestions for short query %p',
    async (search) => {
      const database = { $transaction: jest.fn() };
      await expect(
        new CertService(database as unknown as DatabaseService).suggestRegister(
          transform({ search }),
          actor,
        ),
      ).resolves.toEqual({ data: [] });
      expect(database.$transaction).not.toHaveBeenCalled();
    },
  );

  it('reads lightweight suggestions without hydrating diplomas', async () => {
    const sqlCalls: { text: string }[] = [];
    const transaction = {
      $queryRaw: jest.fn((query: { text: string }) => {
        sqlCalls.push(query);
        return Promise.resolve([]);
      }),
    };
    const database = {
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    await expect(
      new CertService(database as unknown as DatabaseService).suggestRegister(
        transform({ search: 'Nguyen' }),
        actor,
      ),
    ).resolves.toEqual({ data: [] });
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    const sql = sqlCalls[0];
    expect(sql.text).toContain('LIMIT 6');
    expect(sql.text).not.toContain('COUNT(*)');
  });

  it('rejects reversed date ranges before reading the database', async () => {
    const database = { $transaction: jest.fn() };
    await expect(
      new CertService(database as unknown as DatabaseService).findRegister(
        transform({ issuedFrom: '2024-02-01', issuedTo: '2024-01-01' }),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it.each(['university', 'admin'] as const)(
    'reads count and entries from one stable snapshot for %s',
    async (role) => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([{ total: 0, ids: [] }]),
        diploma: { findMany: jest.fn() },
      };
      const database = {
        $transaction: jest.fn(
          (callback: (client: typeof transaction) => unknown) =>
            callback(transaction),
        ),
      };
      await expect(
        new CertService(database as unknown as DatabaseService).findRegister(
          new RegisterQueryDto(),
          { ...actor, role },
        ),
      ).resolves.toEqual({
        data: [],
        pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });
      expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
      expect(transaction.diploma.findMany).not.toHaveBeenCalled();
    },
  );
});

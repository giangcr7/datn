import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare } from 'bcryptjs';
import ExcelJS from 'exceljs';
import { StudentsService } from './students.service';
import { AuthService } from '../auth/auth.service';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import type { JwtService } from '@nestjs/jwt';
import type { AuditService } from '../audit/audit.service';
import type { NotifyService } from '../notify/notify.service';
import { Prisma } from '../generated/prisma/client';

const actor = {
  id: 'staff',
  email: 'staff@example.test',
  role: 'university',
  institutionId: 'institution',
  campusId: 'campus',
} as AuthActor;
const code = '0099999981';
const name = 'Student One';
const email = 'student.one@example.test';

function fixture() {
  const transaction = {
    student: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'student' }),
      update: jest.fn().mockResolvedValue({}),
    },
    enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
    account: { create: jest.fn().mockResolvedValue({ id: 'account' }) },
    accountMembership: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const database = {
    $transaction: jest.fn().mockImplementation((callback) => callback(transaction)),
  };
  const service = new StudentsService(database as unknown as DatabaseService);
  const existing = {
    id: 'student',
    studentCode: code,
    fullName: name,
    contactEmail: email,
    account: { email, memberships: [{ id: 'membership' }] },
  };
  return { service, transaction, database, existing };
}

async function excel(rows: string[][], headers = ['MSSV', 'Họ và tên', 'Email']) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Students');
  sheet.addRow(headers);
  sheet.addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}

describe('student account creation', () => {
  it('creates a pending account without computing a throwaway password hash', async () => {
    const { service, transaction } = fixture();
    await expect(service.create(name, email, code, actor)).resolves.toEqual({
      success: true,
      created: true,
    });
    const account = transaction.account.create.mock.calls[0][0].data;
    expect(account.mustChangePassword).toBe(true);
    expect(account.passwordHash).toMatch(/^!pending-activation![a-f0-9]{64}$/);
    expect(await compare('any-password', account.passwordHash)).toBe(false);
    expect(transaction.student.update).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
    expect(transaction.accountMembership.create).toHaveBeenCalledWith({
      data: { accountId: 'account', campusId: actor.campusId, role: 'STUDENT' },
    });
    await service.create('Student Two', 'two@example.test', '0099999982', actor);
    expect(transaction.account.create.mock.calls[1][0].data.passwordHash)
      .not.toBe(account.passwordHash);
  });

  it('does not let a pending marker authenticate through the actual login service', async () => {
    const { service, transaction } = fixture();
    await service.create(name, email, code, actor);
    const passwordHash = transaction.account.create.mock.calls[0][0].data.passwordHash;
    const log = jest.fn();
    const auth = new AuthService(
      { account: { findUnique: jest.fn().mockResolvedValue({
        id: 'account', active: true, passwordHash,
        memberships: [{ role: 'STUDENT' }],
      }) } } as unknown as DatabaseService,
      {} as JwtService,
      { log } as unknown as AuditService,
      {} as NotifyService,
    );
    await expect(auth.login(email, passwordHash, 'student'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ result: 'FAILED' }));
  });

  it('skips an identical existing campus account without overwriting it', async () => {
    const { service, transaction, existing } = fixture();
    transaction.student.findUnique.mockResolvedValue(existing);
    await expect(service.create(name, email, code, actor, { skipExisting: true }))
      .resolves.toEqual({ success: true, created: false });
    expect(transaction.enrollment.findFirst).not.toHaveBeenCalled();
    expect(transaction.account.create).not.toHaveBeenCalled();
    expect(transaction.student.update).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expect(transaction.student.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: { account: { select: {
        email: true,
        memberships: {
          where: { campusId: actor.campusId, role: 'STUDENT', active: true },
          select: { id: true },
        },
      } } },
    }));
  });

  it('still rejects duplicate accounts when creating manually', async () => {
    const { service, transaction, existing } = fixture();
    transaction.student.findUnique.mockResolvedValue(existing);
    await expect(service.create(name, email, code, actor))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('can add an account for a campus academic profile with no account yet', async () => {
    const { service, transaction, existing } = fixture();
    transaction.student.findUnique.mockResolvedValue({ ...existing, contactEmail: null, account: null });
    transaction.enrollment.findFirst.mockResolvedValue({ id: 'enrollment' });
    await expect(service.create(name, email, code, actor)).resolves.toEqual({ success: true, created: true });
    expect(transaction.student.create).not.toHaveBeenCalled();
    expect(transaction.student.update).toHaveBeenCalledWith({ where: { id: 'student' }, data: { contactEmail: email } });
  });

  it('rejects a student outside the active campus even during retry', async () => {
    const { service, transaction, existing } = fixture();
    transaction.student.findUnique.mockResolvedValue({ ...existing, account: { email, memberships: [] } });
    await expect(service.create(name, email, code, actor, { skipExisting: true }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.account.create).not.toHaveBeenCalled();
  });

  it.each([
    ['different name', { fullName: 'Other Student' }],
    ['different profile email', { contactEmail: 'other@example.test' }],
    ['different account email', { account: { email: 'other@example.test', memberships: [{ id: 'membership' }] } }],
  ])('rejects %s instead of silently skipping', async (_, changed) => {
    const { service, transaction, existing } = fixture();
    transaction.student.findUnique.mockResolvedValue({ ...existing, ...changed });
    await expect(service.create(name, email, code, actor, { skipExisting: true }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(transaction.account.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent unique constraint violation to a conflict', async () => {
    const { service, transaction } = fixture();
    transaction.account.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test',
    }));
    await expect(service.create(name, email, code, actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects non-staff actors before writing anything', async () => {
    const { service, database } = fixture();
    await expect(service.create(name, email, code, { ...actor, role: 'student' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});

describe('student Excel imports', () => {
  it('imports 1000 rows through the real creation path without bcrypt per row', async () => {
    const { service, transaction } = fixture();
    const rows = Array.from({ length: 1000 }, (_, i) => [String(9900000000 + i), 'Student ' + i, 'sv.' + i + '@example.test']);
    const result = await service.importFromExcel('students.xlsx', await excel(rows), actor);
    expect(result).toMatchObject({ success: true, created: 1000, skipped: 0, failed: 0, total: 1000, errors: [] });
    expect(transaction.account.create).toHaveBeenCalledTimes(1000);
    expect(new Set(transaction.account.create.mock.calls.map(([input]) => input.data.passwordHash)).size).toBe(1000);
  });

  it('can safely retry a 1000-row file without creating accounts or errors', async () => {
    const { service, transaction } = fixture();
    const rows = Array.from({ length: 1000 }, (_, i) => [String(9900000000 + i), 'Student ' + i, 'sv.' + i + '@example.test']);
    transaction.student.findUnique.mockImplementation(async ({ where }) => {
      const index = Number(where.institutionId_studentCode.studentCode) - 9900000000;
      return { id: 'student-' + index, fullName: rows[index][1], contactEmail: rows[index][2], account: { email: rows[index][2], memberships: [{ id: 'membership' }] } };
    });
    const result = await service.importFromExcel('students.xlsx', await excel(rows), actor);
    expect(result).toMatchObject({ success: true, created: 0, skipped: 1000, failed: 0, total: 1000, errors: [] });
    expect(transaction.account.create).not.toHaveBeenCalled();
    expect(transaction.student.update).not.toHaveBeenCalled();
  });

  it('counts duplicate, invalid and newly created rows separately and ignores empty rows', async () => {
    const { service, transaction, existing } = fixture();
    transaction.student.findUnique.mockImplementation(async ({ where }) =>
      where.institutionId_studentCode.studentCode === code ? existing : null);
    const result = await service.importFromExcel('students.xlsx', await excel([
      [code, name, email],
      ['0099999982', 'Student Two', 'two@example.test'],
      ['bad-code', 'Student Three', 'three@example.test'],
      ['', '', ''],
    ]), actor);
    expect(result).toMatchObject({ created: 1, skipped: 1, failed: 1, total: 3, errors: [{ row: 4, message: expect.any(String) }] });
  });

  it('rejects diploma registry headers instead of trying to create accounts', async () => {
    const { service, transaction } = fixture();
    await expect(service.importFromExcel('registry.xlsx', await excel([[code, name]], ['MSSV', 'Họ và tên']), actor))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.account.create).not.toHaveBeenCalled();
  });

  it('rejects more than 1000 students before writing', async () => {
    const { service, transaction } = fixture();
    await expect(service.importFromExcel('students.xlsx', await excel(Array.from({ length: 1001 }, () => [code, name, email])), actor))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.account.create).not.toHaveBeenCalled();
  });

  it('rejects invalid Excel data', async () => {
    const { service } = fixture();
    await expect(service.importFromExcel('students.xlsx', Buffer.from('not-an-xlsx').toString('base64'), actor))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

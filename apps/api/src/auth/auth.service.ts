import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { Prisma, Role } from '../generated/prisma/client';
import { AuditService, AuditAction } from '../audit/audit.service';
import { NotifyService } from '../notify/notify.service';
import { AuthActor } from './auth-actor';

const accountInclude = {
  student: true,
  memberships: {
    where: { active: true, campus: { active: true } },
    include: { campus: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.AccountInclude;
type AccountWithMemberships = Prisma.AccountGetPayload<{
  include: typeof accountInclude;
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
  ) {}

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private otpHash(accountId: string, code: string) {
    return createHmac('sha256', process.env.JWT_SECRET!)
      .update(accountId + ':' + code)
      .digest('hex');
  }

  actor(account: AccountWithMemberships, membershipId: string): AuthActor {
    const membership = account.memberships.find(
      (item) => item.id === membershipId,
    );
    if (!account.active || !membership || membership.campus.active === false)
      throw new UnauthorizedException(
        'Tài khoản hoặc quyền truy cập đã bị khóa',
      );
    return {
      id: account.id,
      email: account.email,
      name: account.displayName,
      role: membership.role.toLowerCase() as AuthActor['role'],
      membershipId: membership.id,
      institutionId: membership.campus.institutionId,
      campusId: membership.campusId,
      org: membership.campus.code,
      campusName: membership.campus.name,
      isHeadquarters: membership.campus.isHeadquarters,
      canApproveDiplomas:
        membership.role === Role.UNIVERSITY &&
        membership.campus.isHeadquarters &&
        membership.canApproveDiplomas,
      studentId: account.studentId,
      mssv: account.student?.studentCode || null,
      mustChangePassword: account.mustChangePassword,
      sessionVersion: account.sessionVersion,
    };
  }

  private newSession(
    accountId: string,
    membershipId: string,
    familyId: string = randomUUID(),
    ip?: string,
    userAgent?: string,
  ) {
    const token = randomBytes(40).toString('hex');
    return {
      token,
      data: {
        accountId,
        membershipId,
        familyId: familyId as any,
        tokenHash: this.tokenHash(token),
        expiresAt: new Date(Date.now() + 7 * 86400000),
        ip,
        userAgent: userAgent?.slice(0, 500),
      },
    };
  }

  async login(
    email: string,
    password: string,
    role: string,
    ip?: string,
    userAgent?: string,
  ) {
    const account = await this.database.account.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: accountInclude,
    });
    const membership = account?.memberships.find(
      (item) => item.role === role.toUpperCase(),
    );
    if (
      !account ||
      !account.active ||
      !membership ||
      !(await compare(password, account.passwordHash))
    ) {
      await this.audit.log({
        userId: account?.id,
        userEmail: email,
        action: AuditAction.LOGIN,
        result: 'FAILED',
        ip,
      });
      throw new UnauthorizedException(
        'Email, mật khẩu hoặc cổng đăng nhập không hợp lệ',
      );
    }
    const user = this.actor(account, membership.id);
    const session = this.newSession(
      account.id,
      membership.id,
      undefined,
      ip,
      userAgent,
    );
    await this.database.$transaction(async (transaction) => {
      await transaction.refreshSession.create({ data: session.data });
      await this.audit.log(
        {
          userId: account.id,
          institutionId: user.institutionId,
          userEmail: account.email,
          action: AuditAction.LOGIN,
          ip,
        },
        transaction,
      );
    });
    return {
      access_token: this.jwt.sign(user),
      refresh_token: session.token,
      user,
    };
  }

  async validateActor(payload: AuthActor) {
    if (!payload.id || !payload.membershipId)
      throw new UnauthorizedException(
        'Phiên cũ đã hết hiệu lực; vui lòng đăng nhập lại',
      );
    const account = await this.database.account.findUnique({
      where: { id: payload.id },
      include: accountInclude,
    });
    if (!account || account.sessionVersion !== payload.sessionVersion)
      throw new UnauthorizedException('Phiên đăng nhập đã bị thu hồi');
    return this.actor(account, payload.membershipId);
  }

  async refreshAccessToken(token: string, ip?: string, userAgent?: string) {
    const outcome = await this.database.$transaction(async (transaction) => {
      const stored = await transaction.refreshSession.findUnique({
        where: { tokenHash: this.tokenHash(token) },
      });
      if (!stored) return null;
      await transaction.$queryRaw`SELECT id FROM accounts WHERE id = ${stored.accountId}::uuid FOR UPDATE`;
      const current = await transaction.refreshSession.findUniqueOrThrow({
        where: { id: stored.id },
      });
      if (current.revokedAt) {
        await transaction.refreshSession.updateMany({
          where: {
            accountId: current.accountId,
            familyId: current.familyId,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        await transaction.account.update({
          where: { id: current.accountId },
          data: { sessionVersion: { increment: 1 } },
        });
        return null;
      }
      if (current.expiresAt <= new Date()) return null;
      const account = await transaction.account.findUniqueOrThrow({
        where: { id: current.accountId },
        include: accountInclude,
      });
      const user = this.actor(account, current.membershipId);
      const session = this.newSession(
        current.accountId,
        current.membershipId,
        current.familyId,
        ip,
        userAgent,
      );
      const next = await transaction.refreshSession.create({
        data: session.data,
      });
      await transaction.refreshSession.update({
        where: { id: current.id },
        data: { revokedAt: new Date(), replacedById: next.id },
      });
      return {
        access_token: this.jwt.sign(user),
        refresh_token: session.token,
        user,
      };
    });
    if (!outcome)
      throw new UnauthorizedException(
        'Refresh token hết hạn, bị thu hồi hoặc đã dùng lại',
      );
    return outcome;
  }

  async logout(token: string) {
    await this.database.refreshSession.updateMany({
      where: { tokenHash: this.tokenHash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async logoutAllDevices(accountId: string) {
    await this.database.$transaction([
      this.database.refreshSession.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.database.account.update({
        where: { id: accountId },
        data: { sessionVersion: { increment: 1 } },
      }),
    ]);
    return { success: true };
  }

  async changePassword(
    accountId: string,
    oldPassword: string,
    newPassword: string,
    ip?: string,
    institutionId?: string,
  ) {
    const account = await this.database.account.findUnique({
      where: { id: accountId },
    });
    if (!account || !(await compare(oldPassword, account.passwordHash)))
      throw new UnauthorizedException('Mật khẩu cũ không đúng');
    const passwordHash = await hash(newPassword, 12);
    await this.database.$transaction(async (transaction) => {
      await transaction.account.update({
        where: { id: accountId },
        data: {
          passwordHash,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
        },
      });
      await transaction.refreshSession.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        {
          userId: accountId,
          institutionId,
          userEmail: account.email,
          action: AuditAction.CHANGE_PASSWORD,
          ip,
        },
        transaction,
      );
    });
    return {
      success: true,
      message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.',
    };
  }

  private async activationAccount(mssv: string, email: string) {
    const account = await this.database.account.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: accountInclude,
    });
    if (
      !account ||
      !account.active ||
      account.student?.studentCode !== mssv ||
      !account.memberships.some((item) => item.role === Role.STUDENT) ||
      !account.mustChangePassword
    )
      throw new UnauthorizedException('Thông tin kích hoạt không hợp lệ');
    return account;
  }

  async sendOtp(mssv: string, email: string) {
    const account = await this.activationAccount(mssv, email);
    const code = randomInt(100000, 1000000).toString();
    const challenge = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM accounts WHERE id = ${account.id}::uuid FOR UPDATE`;
      await transaction.otpChallenge.updateMany({
        where: { accountId: account.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return transaction.otpChallenge.create({
        data: {
          accountId: account.id,
          codeHash: this.otpHash(account.id, code),
          expiresAt: new Date(Date.now() + 5 * 60000),
        },
      });
    });
    try {
      await this.notify.sendActivationOtp(
        account.email,
        account.displayName,
        code,
      );
    } catch (error) {
      await this.database.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw error;
    }
    return {
      success: true,
      message: 'Mã kích hoạt đã được gửi tới email đã đăng ký',
    };
  }

  async registerStudent(
    mssv: string,
    email: string,
    password: string,
    otp: string,
    ip?: string,
  ) {
    const account = await this.activationAccount(mssv, email);
    const passwordHash = await hash(password, 12);
    const accepted = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM accounts WHERE id = ${account.id}::uuid FOR UPDATE`;
      const current = await transaction.account.findUniqueOrThrow({
        where: { id: account.id },
      });
      if (!current.mustChangePassword) return false;
      const challenge = await transaction.otpChallenge.findFirst({
        where: {
          accountId: account.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: 5 },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!challenge) return false;
      const matched = timingSafeEqual(
        Buffer.from(challenge.codeHash, 'hex'),
        Buffer.from(this.otpHash(account.id, otp.trim()), 'hex'),
      );
      await transaction.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: { increment: 1 },
          ...(matched ? { consumedAt: new Date() } : {}),
        },
      });
      if (!matched) return false;
      await transaction.account.update({
        where: { id: account.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
        },
      });
      await transaction.refreshSession.updateMany({
        where: { accountId: account.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        {
          userId: account.id,
          institutionId: account.memberships.find(
            (membership) => membership.role === Role.STUDENT,
          )?.campus.institutionId,
          userEmail: account.email,
          action: AuditAction.REGISTER,
          ip,
        },
        transaction,
      );
      return true;
    });
    if (!accepted)
      throw new UnauthorizedException('Mã OTP không hợp lệ hoặc đã hết hạn');
    return { success: true, message: 'Kích hoạt tài khoản thành công' };
  }

  async getProfile(accountId: string) {
    const account = await this.database.account.findUniqueOrThrow({
      where: { id: accountId },
      include: accountInclude,
    });
    return {
      id: account.id,
      _id: account.id,
      email: account.email,
      name: account.displayName,
      mssv: account.student?.studentCode,
      mustChangePassword: account.mustChangePassword,
      memberships: account.memberships.map((membership) => ({
        id: membership.id,
        role: membership.role.toLowerCase(),
        campus: membership.campus.name,
        isHeadquarters: membership.campus.isHeadquarters,
        canApproveDiplomas:
          membership.role === Role.UNIVERSITY &&
          membership.campus.isHeadquarters &&
          membership.canApproveDiplomas,
      })),
    };
  }

  async findAllUsers(actor: AuthActor) {
    return this.database.account.findMany({
      where: {
        memberships: {
          some: { campus: { institutionId: actor.institutionId } },
        },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        active: true,
        createdAt: true,
        memberships: {
          where: { campus: { institutionId: actor.institutionId } },
          select: { role: true, campusId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}

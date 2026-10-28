import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { jsonData, pagination } from '../database/data-utils';
import type { AuthActor } from '../auth/auth-actor';
import type { AuditQueryDto } from './audit-query.dto';

export enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  REGISTER = 'REGISTER',
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  ISSUE_CERT = 'ISSUE_CERT',
  REVOKE_CERT = 'REVOKE_CERT',
  IMPORT_STUDENTS = 'IMPORT_STUDENTS',
  CREATE_STUDENT = 'CREATE_STUDENT',
  VERIFY_CERT = 'VERIFY_CERT',
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly database: DatabaseService) {}

  async log(
    data: {
      userId?: string;
      institutionId?: string;
      userEmail: string;
      action: AuditAction | string;
      target?: string;
      ip?: string;
      userAgent?: string;
      result?: 'SUCCESS' | 'FAILED';
      errorMessage?: string;
      metadata?: Record<string, unknown>;
    },
    transaction?: Prisma.TransactionClient,
  ) {
    try {
      const database = transaction || this.database;
      const actorId =
        data.userId && /^[0-9a-f-]{36}$/i.test(data.userId)
          ? data.userId
          : undefined;
      const actor =
        actorId && !data.institutionId
          ? await database.account.findUnique({
              where: { id: actorId },
              select: {
                memberships: {
                  select: {
                    campus: { select: { institutionId: true } },
                    createdAt: true,
                  },
                  orderBy: { createdAt: 'asc' },
                  take: 1,
                },
              },
            })
          : null;
      await database.auditLog.create({
        data: {
          actorId,
          institutionId:
            data.institutionId || actor?.memberships[0]?.campus.institutionId,
          actorEmail: data.userEmail || 'system',
          action: String(data.action),
          target: data.target,
          result: data.result || 'SUCCESS',
          ip: data.ip,
          userAgent: data.userAgent,
          errorMessage: data.errorMessage,
          metadata:
            data.metadata === undefined ? undefined : jsonData(data.metadata),
        },
      });
    } catch (error) {
      if (transaction) throw error;
      this.logger.error(
        'Không ghi được audit log; cần kiểm tra kết nối database',
      );
    }
  }

  async findAll(
    actor: AuthActor,
    page = 1,
    limit = 20,
    action?: string,
    filters: Pick<AuditQueryDto, 'search' | 'result' | 'from' | 'to'> = {},
  ) {
    if (
      !actor.institutionId ||
      (actor.role !== 'admin' &&
        !(
          actor.role === 'university' &&
          actor.isHeadquarters &&
          actor.canApproveDiplomas
        ))
    )
      throw new ForbiddenException('Không có quyền tra cứu nhật ký nhà trường');
    const { skip, take } = pagination(page, limit);
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    if (
      (from && Number.isNaN(from.getTime())) ||
      (to && Number.isNaN(to.getTime())) ||
      (from && to && from > to)
    )
      throw new BadRequestException('Khoảng thời gian tra cứu không hợp lệ');
    const search = filters.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      ...(action ? { action } : {}),
      institutionId: actor.institutionId,
      ...(filters.result ? { result: filters.result } : {}),
      ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
      ...(search
        ? {
            OR: [
              { actorEmail: { contains: search, mode: 'insensitive' } },
              { target: { contains: search, mode: 'insensitive' } },
              { action: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.database.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.database.auditLog.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByUser(userId: string, actor: AuthActor) {
    return this.database.auditLog.findMany({
      where: { actorId: userId, institutionId: actor.institutionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

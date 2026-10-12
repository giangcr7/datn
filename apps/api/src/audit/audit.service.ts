import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { jsonData, pagination } from '../database/data-utils';

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

  async log(data: {
    userId?: string;
    userEmail: string;
    action: AuditAction | string;
    target?: string;
    ip?: string;
    userAgent?: string;
    result?: 'SUCCESS' | 'FAILED';
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      const actorId =
        data.userId && /^[0-9a-f-]{36}$/i.test(data.userId)
          ? data.userId
          : undefined;
      const actor = actorId
        ? await this.database.account.findUnique({
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
      await this.database.auditLog.create({
        data: {
          actorId,
          institutionId: actor?.memberships[0]?.campus.institutionId,
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
    } catch {
      this.logger.error(
        'Không ghi được audit log; cần kiểm tra kết nối database',
      );
    }
  }

  async findAll(page = 1, limit = 20, action?: string) {
    const { skip, take } = pagination(page, limit);
    const where: Prisma.AuditLogWhereInput = action ? { action } : {};
    const [data, total] = await Promise.all([
      this.database.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.database.auditLog.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByUser(userId: string) {
    return this.database.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

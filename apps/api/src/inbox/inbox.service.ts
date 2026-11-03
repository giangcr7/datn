import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import { DatabaseService } from '../database/database.service';
import { payloadHash } from '../database/diploma-hash';
import type { Prisma } from '../generated/prisma/client';
import { requestScope } from '../requests/change-request-state';
import { inboxQuery } from './inbox-query';

export interface InboxGroup {
  key: string;
  count: number;
  version: string;
}
export const inboxDefinitions: Record<
  string,
  {
    title: string;
    href: string;
    priority: number;
    severity: 'info' | 'warning' | 'error';
  }
> = {
  'blockchain-failed': {
    title: 'Giao dịch blockchain cần kiểm tra',
    href: '/explorer',
    priority: 1,
    severity: 'error',
  },
  'student-supplement': {
    title: 'Nhà trường yêu cầu bổ sung thông tin',
    href: '/student/requests?status=NEEDS_INFORMATION',
    priority: 1,
    severity: 'warning',
  },
  requests: {
    title: 'Yêu cầu chỉnh sửa cần xử lý',
    href: '/diploma-records/requests',
    priority: 3,
    severity: 'info',
  },
  approvals: {
    title: 'Hồ sơ chờ duyệt phát hành',
    href: '/pending',
    priority: 4,
    severity: 'info',
  },
  'replacement-approvals': {
    title: 'Hồ sơ thay thế chờ duyệt',
    href: '/pending?view=replacements&stage=REQUESTED',
    priority: 4,
    severity: 'info',
  },
  rejected: {
    title: 'Hồ sơ bị từ chối cần rà soát',
    href: '/pending?view=rejected',
    priority: 5,
    severity: 'warning',
  },
  'replacement-rejected': {
    title: 'Hồ sơ thay thế bị từ chối',
    href: '/pending?view=replacements&stage=REJECTED',
    priority: 5,
    severity: 'warning',
  },
  'blockchain-delayed': {
    title: 'Giao dịch chờ xác nhận quá 15 phút',
    href: '/explorer',
    priority: 6,
    severity: 'warning',
  },
  'student-review': {
    title: 'Yêu cầu đang được nhà trường xử lý',
    href: '/student/requests?status=IN_REVIEW',
    priority: 2,
    severity: 'info',
  },
  'student-results': {
    title: 'Yêu cầu đã có kết quả xử lý',
    href: '/student/requests',
    priority: 3,
    severity: 'info',
  },
};

export function inboxItems(
  groups: InboxGroup[],
  receipts: { key: string; fingerprint: string; readAt: Date }[],
) {
  return groups
    .filter((group) => group.count > 0 && inboxDefinitions[group.key])
    .map((group) => {
      const definition = inboxDefinitions[group.key];
      const fingerprint = payloadHash({
        key: group.key,
        count: group.count,
        version: group.version,
      });
      const receipt = receipts.find(
        (value) => value.key === group.key && value.fingerprint === fingerprint,
      );
      return {
        key: group.key,
        count: group.count,
        fingerprint,
        ...definition,
        read: !!receipt,
        readAt: receipt?.readAt || null,
      };
    })
    .sort((left, right) => left.priority - right.priority);
}

@Injectable()
export class InboxService {
  constructor(private readonly database: DatabaseService) {}
  private authorize(actor: AuthActor) {
    if (
      !actor?.id ||
      !actor.membershipId ||
      !actor.institutionId ||
      !actor.campusId
    )
      throw new ForbiddenException('Không có quyền xem thông báo');
    if (actor.role !== 'admin') requestScope(actor);
  }
  private async snapshot(
    transaction: Prisma.TransactionClient,
    actor: AuthActor,
  ) {
    const now = new Date();
    const groups = await transaction.$queryRaw<InboxGroup[]>(
      inboxQuery(actor, now),
    );
    const receipts = await transaction.inboxReceipt.findMany({
      where: { membershipId: actor.membershipId },
    });
    const items = inboxItems(groups, receipts);
    return {
      items,
      unread: items.filter((item) => !item.read).length,
      totalTasks: items.reduce((total, item) => total + item.count, 0),
      generatedAt: now.toISOString(),
    };
  }
  async list(actor: AuthActor) {
    this.authorize(actor);
    return this.database.$transaction(
      (transaction) => this.snapshot(transaction, actor),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async read(key: string, fingerprint: string, actor: AuthActor) {
    this.authorize(actor);
    return this.database.$transaction(
      async (transaction) => {
        const current = await this.snapshot(transaction, actor);
        if (
          !current.items.some(
            (item) => item.key === key && item.fingerprint === fingerprint,
          )
        )
          throw new ConflictException(
            'Công việc đã thay đổi. Hãy tải lại thông báo.',
          );
        await transaction.inboxReceipt.upsert({
          where: {
            membershipId_key: { membershipId: actor.membershipId, key },
          },
          create: { membershipId: actor.membershipId, key, fingerprint },
          update: { fingerprint, readAt: new Date() },
        });
        return this.snapshot(transaction, actor);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}

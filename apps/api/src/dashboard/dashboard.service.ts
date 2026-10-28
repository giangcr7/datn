import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import { DatabaseService } from '../database/database.service';
import { dashboardImportQuery, dashboardQuery } from './dashboard-query';

export interface CountGroup {
  name: string;
  value: number;
}

export interface DashboardRecords {
  summary: {
    totalRecords: number;
    draftRecords: number;
    requestedRecords: number;
    rejectedRecords: number;
    reopenedDrafts: number;
    replacementDrafts: number;
    replacementRejected: number;
    replacementRequested: number;
    pendingAnchoring: number;
    registered: number;
    active: number;
    revoked: number;
    replaced: number;
    registeredThisMonth: number;
    undatedRegistrations: number;
  };
  byMajor: CountGroup[];
  byYear: CountGroup[];
  byMonth: { month: string; value: number }[];
  recentIssued: {
    id: string;
    fullName: string | null;
    mssv: string | null;
    certificateNo: string | null;
    status: string;
    committedAt: string | null;
  }[];
}

export interface ImportCounts {
  needsReview: number;
  ready: number;
  graduationOnly: number;
  prepare: number;
}

export interface DashboardImports {
  counts: ImportCounts;
  batches: (ImportCounts & {
    id: string;
    fileName: string;
    createdAt: string;
  })[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

  async overview(actor: AuthActor) {
    if (
      !actor?.institutionId ||
      !(
        actor.role === 'admin' ||
        (actor.role === 'university' &&
          actor.isHeadquarters &&
          actor.canApproveDiplomas &&
          actor.campusId)
      )
    )
      throw new ForbiddenException('Không có quyền xem tổng quan nhà trường');
    const generatedAt = new Date();
    return this.database.$transaction(
      async (transaction) => {
        const [records] = await transaction.$queryRaw<DashboardRecords[]>(
          dashboardQuery(actor.institutionId, generatedAt),
        );
        const [imports] = await transaction.$queryRaw<DashboardImports[]>(
          dashboardImportQuery(
            actor.institutionId,
            actor.role === 'admin' ? undefined : actor.campusId,
          ),
        );
        const students = await transaction.student.count({
          where: { institutionId: actor.institutionId },
        });
        const failedTransactions = await transaction.blockchainAnchor.count({
          where: {
            version: { diploma: { institutionId: actor.institutionId } },
            eventType: { in: ['ISSUE', 'REVOKE'] },
            status: 'FAILED',
          },
        });
        return {
          ...records,
          summary: { ...records.summary, students, failedTransactions },
          imports,
          generatedAt: generatedAt.toISOString(),
          timezone: 'Asia/Ho_Chi_Minh',
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}

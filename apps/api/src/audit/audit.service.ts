import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { jsonData, pagination } from '../database/data-utils';
import type { AuthActor } from '../auth/auth-actor';
import type { AuditQueryDto } from './audit-query.dto';
import { currentRequestId } from '../common/request-context';

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
  SHARE_DIPLOMA = 'SHARE_DIPLOMA',
  RATE_LIMITED = 'RATE_LIMITED',
  SECURITY_ALERT_STATUS = 'SECURITY_ALERT_STATUS',
  REVOKE_SESSION = 'REVOKE_SESSION',
}

type TargetKind =
  | 'diploma'
  | 'student'
  | 'program'
  | 'diploma-type'
  | 'issuance-batch'
  | 'import-batch'
  | 'import-row'
  | 'change-request';

export interface AuditReference {
  key: string;
  label: string;
  value: string;
  kind: 'target' | 'request' | 'blockchain' | 'source' | 'record';
}

type AuditRecord = Prisma.AuditLogGetPayload<{}>;
type AuditEntry = AuditRecord & {
  targetKind: TargetKind | null;
  targetLabel: string | null;
  references: AuditReference[];
};

export type SecurityAlertStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'RESOLVED'
  | 'DISMISSED';

export type SecurityAlert = {
  id: string;
  kind: 'EMAIL_FAILURE_BURST' | 'IP_FAILURE_BURST' | 'RATE_LIMIT_BURST';
  severity: 'HIGH' | 'MEDIUM';
  subjectType: 'EMAIL' | 'IP';
  subject: string;
  count: number;
  windowMinutes: number;
  firstAt: Date;
  lastAt: Date;
  auditIds: string[];
  status: SecurityAlertStatus;
  statusNote: string | null;
  statusChangedAt: Date | null;
  statusChangedBy: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECURITY_WINDOW_MS = 15 * 60 * 1000;
const SECURITY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const referenceLabels: Record<string, string> = {
  anchorId: 'Mã neo blockchain',
  batchId: 'Mã lô dữ liệu',
  blockNumber: 'Số block',
  changeRequestId: 'Mã yêu cầu chỉnh sửa',
  diplomaId: 'Mã văn bằng',
  eventId: 'Mã sự kiện',
  graduationId: 'Mã hồ sơ tốt nghiệp',
  outboxId: 'Mã hàng đợi blockchain',
  programId: 'Mã ngành đào tạo',
  replacementId: 'Mã văn bằng thay thế',
  requestId: 'Mã yêu cầu',
  sourceId: 'Mã nguồn',
  sourceRowId: 'Mã dòng dữ liệu nguồn',
  transactionId: 'Mã giao dịch blockchain',
  txId: 'Mã giao dịch blockchain',
  version: 'Phiên bản dữ liệu',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const securityAlertId = (kind: SecurityAlert['kind'], subject: string) =>
  createHash('sha256').update(`${kind}:${subject}`).digest('hex');

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly database: DatabaseService) {}

  async institutionIdForEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return undefined;
    try {
      const account = await this.database.account.findUnique({
        where: { email: normalizedEmail },
        select: {
          memberships: {
            where: { active: true, campus: { active: true } },
            select: { campus: { select: { institutionId: true } } },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      });
      return account?.memberships[0]?.campus.institutionId;
    } catch {
      return undefined;
    }
  }

  private assertReader(actor: AuthActor) {
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
  }

  private targetKind(action: string): TargetKind | null {
    if (
      [
        'REQUEST_CERT',
        'SAVE_PENDING_DIPLOMA',
        'REVIEW_DIPLOMA_PRINT_DATA',
        'APPROVE_CERT',
        'ISSUE_CERT',
        'REJECT_CERT',
        'REOPEN_REJECTED_DIPLOMA',
        'CORRECT_REJECTED_DIPLOMA',
        'RESUBMIT_REJECTED_DIPLOMA',
        'REVOKE_CERT',
        'CREATE_REPLACEMENT',
        'EDIT_REPLACEMENT',
        'SUBMIT_REPLACEMENT',
        'REOPEN_REPLACEMENT',
        'REJECT_REPLACEMENT',
        'APPROVE_REPLACEMENT',
        'VERIFY_CERT',
        'CHECK_BLOCKCHAIN',
        'RETRY_BLOCKCHAIN',
        'COMMIT_BLOCKCHAIN',
        'SHARE_DIPLOMA',
      ].includes(action)
    )
      return 'diploma';
    if (action === 'CREATE_STUDENT') return 'student';
    if (
      ['CREATE_PROGRAM', 'UPDATE_PROGRAM', 'APPROVE_PROGRAM_ALIAS'].includes(
        action,
      )
    )
      return 'program';
    if (['CREATE_DIPLOMA_TYPE', 'UPDATE_DIPLOMA_TYPE'].includes(action))
      return 'diploma-type';
    if (
      [
        'CREATE_ISSUANCE_BATCH',
        'ADD_ISSUANCE_BATCH_MEMBERS',
        'REMOVE_ISSUANCE_BATCH_MEMBERS',
      ].includes(action)
    )
      return 'issuance-batch';
    if (['STAGE_REGISTRY', 'RECHECK_REGISTRY_PRINT_DATA'].includes(action))
      return 'import-batch';
    if (
      [
        'REVIEW_IMPORT_ROW',
        'REVIEW_IMPORTED_PRINT_DATA',
        'COMMIT_IMPORT_ROW',
      ].includes(action)
    )
      return 'import-row';
    if (action === 'DIPLOMA_CHANGE_REQUEST') return 'change-request';
    return null;
  }

  private referenceKind(key: string): AuditReference['kind'] {
    if (key === 'requestId' || key === 'changeRequestId') return 'request';
    if (['anchorId', 'blockNumber', 'transactionId', 'txId'].includes(key))
      return 'blockchain';
    if (key === 'sourceId' || key === 'sourceRowId') return 'source';
    return 'record';
  }

  private references(record: AuditRecord): AuditReference[] {
    const references: AuditReference[] = [];
    const seen = new Set<string>();
    const add = (
      key: string,
      value: unknown,
      kind?: AuditReference['kind'],
    ) => {
      if (
        (typeof value !== 'string' && typeof value !== 'number') ||
        !String(value).trim()
      )
        return;
      const normalized = String(value);
      const fingerprint = `${key}:${normalized}`;
      if (seen.has(fingerprint)) return;
      seen.add(fingerprint);
      references.push({
        key,
        label: key === 'target' ? 'Mã đối tượng' : referenceLabels[key] || key,
        value: normalized,
        kind: kind || this.referenceKind(key),
      });
    };
    add('target', record.target, 'target');
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!isRecord(value)) return;
      Object.entries(value).forEach(([key, child]) => {
        if (referenceLabels[key]) add(key, child);
        visit(child);
      });
    };
    visit(record.metadata);
    return references;
  }

  private async enrich(entries: AuditRecord[], institutionId: string) {
    if (!entries.length) return [] as AuditEntry[];
    type DiplomaSummary = {
      id: string;
      certificateNo: string;
      registryNo: string;
      graduation: { student: { fullName: string; studentCode: string } };
    };
    type StudentSummary = { id: string; fullName: string; studentCode: string };
    type ProgramSummary = { id: string; code: string; name: string };
    type DiplomaTypeSummary = { id: string; code: string; name: string };
    type IssuanceBatchSummary = {
      id: string;
      code: string;
      name: string;
      graduationYear: number;
    };
    type ImportBatchSummary = {
      id: string;
      campus: { name: string };
      document: { fileName: string };
    };
    type ImportRowSummary = {
      id: string;
      rowNumber: number;
      sheetName: string;
      batch: { document: { fileName: string } };
    };
    type ChangeRequestSummary = {
      id: string;
      status: string;
      diploma: {
        certificateNo: string;
        graduation: { student: { fullName: string; studentCode: string } };
      };
    };
    const idsByKind = (kind: TargetKind) =>
      Array.from(
        new Set(
          entries
            .filter((entry) => this.targetKind(entry.action) === kind)
            .map((entry) => entry.target)
            .filter((id): id is string => !!id && UUID_PATTERN.test(id)),
        ),
      );
    const diplomaIds = idsByKind('diploma');
    const studentIds = idsByKind('student');
    const programIds = idsByKind('program');
    const diplomaTypeIds = idsByKind('diploma-type');
    const batchIds = idsByKind('issuance-batch');
    const importBatchIds = idsByKind('import-batch');
    const importRowIds = idsByKind('import-row');
    const changeRequestIds = idsByKind('change-request');
    const [
      diplomas,
      students,
      programs,
      diplomaTypes,
      batches,
      importBatches,
      importRows,
      changeRequests,
    ] = (await Promise.all([
      diplomaIds.length
        ? this.database.diploma.findMany({
            where: { id: { in: diplomaIds }, institutionId },
            select: {
              id: true,
              certificateNo: true,
              registryNo: true,
              graduation: {
                select: {
                  student: { select: { fullName: true, studentCode: true } },
                },
              },
            },
          })
        : Promise.resolve([] as DiplomaSummary[]),
      studentIds.length
        ? this.database.student.findMany({
            where: { id: { in: studentIds }, institutionId },
            select: { id: true, fullName: true, studentCode: true },
          })
        : Promise.resolve([] as StudentSummary[]),
      programIds.length
        ? this.database.program.findMany({
            where: { id: { in: programIds }, institutionId },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([] as ProgramSummary[]),
      diplomaTypeIds.length
        ? this.database.diplomaTypeCatalog.findMany({
            where: { id: { in: diplomaTypeIds }, institutionId },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([] as DiplomaTypeSummary[]),
      batchIds.length
        ? this.database.diplomaIssuanceBatch.findMany({
            where: { id: { in: batchIds }, institutionId },
            select: { id: true, code: true, name: true, graduationYear: true },
          })
        : Promise.resolve([] as IssuanceBatchSummary[]),
      importBatchIds.length
        ? this.database.importBatch.findMany({
            where: { id: { in: importBatchIds }, institutionId },
            select: {
              id: true,
              campus: { select: { name: true } },
              document: { select: { fileName: true } },
            },
          })
        : Promise.resolve([] as ImportBatchSummary[]),
      importRowIds.length
        ? this.database.importRow.findMany({
            where: { id: { in: importRowIds }, batch: { institutionId } },
            select: {
              id: true,
              rowNumber: true,
              sheetName: true,
              batch: { select: { document: { select: { fileName: true } } } },
            },
          })
        : Promise.resolve([] as ImportRowSummary[]),
      changeRequestIds.length
        ? this.database.diplomaChangeRequest.findMany({
            where: { id: { in: changeRequestIds }, diploma: { institutionId } },
            select: {
              id: true,
              status: true,
              diploma: {
                select: {
                  certificateNo: true,
                  graduation: {
                    select: {
                      student: {
                        select: { fullName: true, studentCode: true },
                      },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([] as ChangeRequestSummary[]),
    ])) as [
      DiplomaSummary[],
      StudentSummary[],
      ProgramSummary[],
      DiplomaTypeSummary[],
      IssuanceBatchSummary[],
      ImportBatchSummary[],
      ImportRowSummary[],
      ChangeRequestSummary[],
    ];
    const summaries = new Map<string, string>();
    const put = (kind: TargetKind, id: string, label: string) =>
      summaries.set(`${kind}:${id}`, label);
    diplomas.forEach((item) =>
      put(
        'diploma',
        item.id,
        `${item.graduation.student.fullName} (${item.graduation.student.studentCode}) — số hiệu ${item.certificateNo}`,
      ),
    );
    students.forEach((item) =>
      put('student', item.id, `${item.fullName} (${item.studentCode})`),
    );
    programs.forEach((item) =>
      put('program', item.id, `${item.name} (${item.code})`),
    );
    diplomaTypes.forEach((item) =>
      put('diploma-type', item.id, `${item.name} (${item.code})`),
    );
    batches.forEach((item) =>
      put(
        'issuance-batch',
        item.id,
        `${item.name} (${item.code}, ${item.graduationYear})`,
      ),
    );
    importBatches.forEach((item) =>
      put(
        'import-batch',
        item.id,
        `${item.document.fileName} — ${item.campus.name}`,
      ),
    );
    importRows.forEach((item) =>
      put(
        'import-row',
        item.id,
        `Dòng ${item.rowNumber} — ${item.sheetName} (${item.batch.document.fileName})`,
      ),
    );
    changeRequests.forEach((item) =>
      put(
        'change-request',
        item.id,
        `Yêu cầu chỉnh sửa ${item.diploma.graduation.student.fullName} — số hiệu ${item.diploma.certificateNo} (${item.status})`,
      ),
    );
    return entries.map((entry) => {
      const kind = this.targetKind(entry.action);
      return {
        ...entry,
        targetKind: kind,
        targetLabel:
          kind && entry.target
            ? summaries.get(`${kind}:${entry.target}`) || null
            : null,
        references: this.references(entry),
      };
    });
  }

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
      const requestId = currentRequestId();
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
            data.metadata === undefined && !requestId
              ? undefined
              : jsonData({
                  ...(data.metadata || {}),
                  ...(requestId ? { requestId } : {}),
                }),
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
    this.assertReader(actor);
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
    const [rawData, total] = await Promise.all([
      this.database.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.database.auditLog.count({ where }),
    ]);
    const data = await this.enrich(rawData, actor.institutionId);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findRelated(id: string, actor: AuthActor) {
    this.assertReader(actor);
    const current = await this.database.auditLog.findFirst({
      where: { id, institutionId: actor.institutionId },
    });
    if (!current)
      throw new NotFoundException('Không tìm thấy nhật ký trong phạm vi quyền');
    const references = this.references(current);
    const targets = Array.from(new Set(references.map((item) => item.value)));
    const windowStart = new Date(current.createdAt.getTime() - 180 * 86400000);
    const windowEnd = new Date(current.createdAt.getTime() + 180 * 86400000);
    const where: Prisma.AuditLogWhereInput = {
      institutionId: actor.institutionId,
      id: { not: current.id },
      createdAt: { gte: windowStart, lte: windowEnd },
      ...(targets.length
        ? { target: { in: targets } }
        : current.action === 'LOGIN'
          ? { action: 'LOGIN', actorEmail: current.actorEmail }
          : current.actorId
            ? { actorId: current.actorId, action: current.action }
            : { action: current.action }),
    };
    const rawData = await this.database.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    return {
      data: await this.enrich(rawData, actor.institutionId),
      total: rawData.length,
    };
  }

  async securitySummary(actor: AuthActor) {
    this.assertReader(actor);
    const since = new Date(Date.now() - SECURITY_LOOKBACK_MS);
    const attempts = await this.database.auditLog.findMany({
      where: {
        institutionId: actor.institutionId,
        action: { in: ['LOGIN', 'RATE_LIMITED'] },
        result: 'FAILED',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      take: 1000,
      select: {
        id: true,
        action: true,
        actorEmail: true,
        ip: true,
        createdAt: true,
      },
    });
    const failures = attempts.filter((item) => item.action === 'LOGIN');
    const rateLimited = attempts.filter(
      (item) => item.action === 'RATE_LIMITED',
    );
    const alerts: SecurityAlert[] = [];
    const addBursts = (
      records: typeof attempts,
      key: 'actorEmail' | 'ip',
      threshold: number,
      kind: SecurityAlert['kind'],
      severity: SecurityAlert['severity'],
    ) => {
      const groups = new Map<string, typeof attempts>();
      records.forEach((failure) => {
        const value = failure[key];
        if (!value) return;
        const group = groups.get(value) || [];
        group.push(failure);
        groups.set(value, group);
      });
      groups.forEach((group, subject) => {
        let start = 0;
        for (let end = 0; end < group.length; end++) {
          while (
            group[end].createdAt.getTime() - group[start].createdAt.getTime() >
            SECURITY_WINDOW_MS
          )
            start++;
          if (end - start + 1 < threshold) continue;
          const burst = group.slice(start, end + 1);
          alerts.push({
            id: securityAlertId(kind, subject),
            kind,
            severity,
            subjectType: key === 'ip' ? 'IP' : 'EMAIL',
            subject,
            count: burst.length,
            windowMinutes: 15,
            firstAt: burst[0].createdAt,
            lastAt: burst[burst.length - 1].createdAt,
            auditIds: burst.map((item) => item.id),
            status: 'OPEN',
            statusNote: null,
            statusChangedAt: null,
            statusChangedBy: null,
          });
          break;
        }
      });
    };
    addBursts(failures, 'actorEmail', 5, 'EMAIL_FAILURE_BURST', 'MEDIUM');
    addBursts(failures, 'ip', 10, 'IP_FAILURE_BURST', 'HIGH');
    addBursts(rateLimited, 'ip', 3, 'RATE_LIMIT_BURST', 'HIGH');
    const alertIds = alerts.map((alert) => alert.id);
    if (alertIds.length) {
      const statusLogs = await this.database.auditLog.findMany({
        where: {
          institutionId: actor.institutionId,
          action: 'SECURITY_ALERT_STATUS',
          target: { in: alertIds },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          target: true,
          actorEmail: true,
          metadata: true,
          createdAt: true,
        },
      });
      const latest = new Map<string, (typeof statusLogs)[number]>();
      statusLogs.forEach((entry) => {
        if (entry.target) latest.set(entry.target, entry);
      });
      alerts.forEach((alert) => {
        const status = latest.get(alert.id);
        const metadata =
          status && isRecord(status.metadata) ? status.metadata : null;
        const requestedStatus = metadata?.status;
        if (
          status &&
          (requestedStatus === 'OPEN' ||
            requestedStatus === 'ACKNOWLEDGED' ||
            requestedStatus === 'RESOLVED' ||
            requestedStatus === 'DISMISSED')
        ) {
          alert.status = requestedStatus;
          alert.statusNote =
            typeof metadata?.note === 'string' ? metadata.note : null;
          alert.statusChangedAt = status.createdAt;
          alert.statusChangedBy = status.actorEmail;
        }
      });
    }
    alerts.sort(
      (left, right) => right.lastAt.getTime() - left.lastAt.getTime(),
    );
    return {
      generatedAt: new Date(),
      lookbackHours: 24,
      failedLogins: failures.length,
      rateLimitedRequests: rateLimited.length,
      alerts: alerts.slice(0, 20),
    };
  }

  async updateSecurityAlertStatus(
    id: string,
    status: SecurityAlertStatus,
    note: string | undefined,
    actor: AuthActor,
    ip?: string,
  ) {
    this.assertReader(actor);
    if (!/^[0-9a-f]{64}$/i.test(id))
      throw new BadRequestException('Mã cảnh báo không hợp lệ');
    if (!['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'].includes(status))
      throw new BadRequestException('Trạng thái cảnh báo không hợp lệ');
    await this.log({
      userId: actor.id,
      institutionId: actor.institutionId,
      userEmail: actor.email,
      action: 'SECURITY_ALERT_STATUS',
      target: id,
      ip,
      metadata: {
        status,
        ...(note?.trim() ? { note: note.trim().slice(0, 1000) } : {}),
      },
    });
    return { success: true, id, status };
  }

  async findByUser(userId: string, actor: AuthActor) {
    return this.database.auditLog.findMany({
      where: { actorId: userId, institutionId: actor.institutionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

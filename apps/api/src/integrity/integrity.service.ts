import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { FabricService } from '../fabric/fabric.service';
import { Prisma } from '../generated/prisma/client';
import { diplomaInclude } from '../database/diploma-projection';
import { jsonData } from '../database/data-utils';
import {
  HASH_SCHEMA_VERSION,
  payloadHash,
  legacyHash,
} from '../database/diploma-hash';
import type { AuthActor } from '../auth/auth-actor';
import {
  aggregateRisk,
  ANOMALY_RULE_VERSION,
  findBurstWindow,
  makeCandidate,
  type AnomalyCandidate,
} from './anomaly-engine';

const ANOMALY_WINDOW_MS = 15 * 60 * 1000;
const ANCHOR_GRACE_MS = 24 * 60 * 60 * 1000;
const MAX_SCAN_LIMIT = 1000;
const MAX_ACTIVE_DUPLICATE_SCAN = 5000;
const MUTATION_AFTER_APPROVAL = new Set([
  'REOPENED',
  'REVIEWED_PRINT_DATA',
  'CORRECTION_REQUESTED',
  'REPLACEMENT_REQUESTED',
]);

type AnomalyDiploma = {
  id: string;
  status: string;
  workflowStatus: string;
  currentVersion: number;
  approvedAt: Date | null;
  updatedAt: Date;
  graduation: {
    studentId: string;
    student: { studentCode: string; fullName: string };
  };
  versions: Array<{
    version: number;
    schemaVersion: string;
    payload: unknown;
    payloadHash: string;
    anchors: Array<{
      eventType: string;
      status: string;
      payloadHash: string;
      committedAt: Date | null;
    }>;
  }>;
  events: Array<{
    eventType: string;
    actorId: string | null;
    createdAt: Date;
  }>;
};

type ActiveDiploma = {
  id: string;
  graduation: { studentId: string };
};

@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly fabric: FabricService,
  ) {}

  @Cron('0 2 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async runDailyCheck() {
    if (this.fabric.enabled) {
      let cursor: string | undefined;
      do {
        const result = await this.checkIncremental(0, 100, undefined, cursor);
        cursor = result.nextCursor;
      } while (cursor);
    }
    await this.runAnomalyScan(7, 500);
  }

  async debugCount() {
    return {
      total: await this.database.diploma.count(),
      onChain: await this.database.blockchainAnchor.count({
        where: { eventType: 'ISSUE', status: 'COMMITTED' },
      }),
    };
  }

  private assertActor(actor?: AuthActor) {
    if (actor && !['admin', 'university'].includes(actor.role))
      throw new ForbiddenException();
  }

  private scopeForActor(actor?: AuthActor): Prisma.DiplomaWhereInput {
    this.assertActor(actor);
    if (!actor) return {};
    return {
      institutionId: actor.institutionId,
      ...(actor.role === 'admin' ? {} : { campusId: actor.campusId }),
    };
  }

  private boundedDays(days: number, fallback: number) {
    return Number.isFinite(days) && days >= 0
      ? Math.min(90, Math.floor(days))
      : fallback;
  }

  private boundedLimit(limit: number) {
    return Number.isFinite(limit)
      ? Math.max(1, Math.min(MAX_SCAN_LIMIT, Math.floor(limit)))
      : 500;
  }

  private async persistCandidate(
    candidate: AnomalyCandidate,
    lastSeenAt = new Date(),
  ) {
    const existing = await this.database.integrityAlert.findFirst({
      where: {
        diplomaId: candidate.diplomaId,
        type: candidate.type,
        resolvedAt: null,
      },
    });
    const data = {
      riskScore: candidate.riskScore,
      severity: candidate.severity,
      ruleVersion: candidate.ruleVersion,
      source: candidate.source,
      evidence: jsonData(candidate.evidence),
      databaseHash: candidate.databaseHash ?? null,
      fabricHash: candidate.fabricHash ?? null,
      lastSeenAt,
    };
    if (existing) {
      return {
        record: await this.database.integrityAlert.update({
          where: { id: existing.id },
          data,
        }),
        created: false,
      };
    }
    return {
      record: await this.database.integrityAlert.create({
        data: { diplomaId: candidate.diplomaId, type: candidate.type, ...data },
      }),
      created: true,
    };
  }

  async checkIncremental(
    days = 1,
    limit = 50,
    actor?: AuthActor,
    cursor?: string,
  ) {
    const scope = this.scopeForActor(actor);
    const where: Prisma.DiplomaWhereInput = {
      ...scope,
      versions: {
        some: {
          anchors: { some: { eventType: 'ISSUE', status: 'COMMITTED' } },
        },
      },
      ...(days > 0
        ? { updatedAt: { gte: new Date(Date.now() - days * 86400000) } }
        : {}),
    };
    const take = Math.max(1, Math.min(500, limit));
    const diplomas = await this.database.diploma.findMany({
      where,
      include: diplomaInclude,
      orderBy: { id: 'asc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const alerts: unknown[] = [];
    let checked = 0;
    let unavailable = 0;
    for (const diploma of diplomas) {
      const version = diploma.versions[0];
      if (!version) continue;
      try {
        const chain = (
          await this.fabric.execute(
            'evaluate',
            version.schemaVersion === HASH_SCHEMA_VERSION
              ? 'QueryDiplomaAnchor'
              : 'QueryCertificate',
            diploma.id,
            ...(version.schemaVersion === HASH_SCHEMA_VERSION
              ? [String(version.version)]
              : []),
          )
        ).result;
        const hash =
          version.schemaVersion === HASH_SCHEMA_VERSION
            ? payloadHash(version.payload)
            : legacyHash(version.payload as Record<string, any>);
        const chainHash = chain.payloadHash || chain.certHash;
        const type =
          hash !== version.payloadHash || hash !== chainHash
            ? 'HASH_MISMATCH'
            : (diploma.status === 'REVOKED') !== !!chain.isRevoked
              ? 'REVOKED_MISMATCH'
              : null;
        checked++;
        if (type) {
          const candidate = makeCandidate({
            diplomaId: diploma.id,
            type,
            riskScore: 100,
            source: 'INTEGRITY',
            ruleVersion: 'integrity-v1',
            databaseHash: hash,
            fabricHash: chainHash,
            evidence: {
              databasePayloadHash: hash,
              storedPayloadHash: version.payloadHash,
              fabricPayloadHash: chainHash,
              chainRevoked: !!chain.isRevoked,
              databaseRevoked: diploma.status === 'REVOKED',
            },
          });
          alerts.push((await this.persistCandidate(candidate)).record);
        }
      } catch {
        unavailable++;
        this.logger.warn(
          'Khong truy van duoc Fabric cho mot ban ghi; khong danh dau gia mao',
        );
      }
    }
    return {
      checked,
      mismatches: alerts.length,
      unavailable,
      alerts,
      nextCursor:
        diplomas.length === take ? diplomas[diplomas.length - 1].id : undefined,
    };
  }

  async runAnomalyScan(days = 7, limit = 500, actor?: AuthActor) {
    const scope = this.scopeForActor(actor);
    const boundedDays = this.boundedDays(days, 7);
    const scanLimit = this.boundedLimit(limit);
    const now = new Date();
    const since = new Date(now.getTime() - boundedDays * 86400000);
    const diplomas = (await this.database.diploma.findMany({
      where: {
        ...scope,
        OR: [
          { updatedAt: { gte: since } },
          { status: 'ACTIVE' },
          { workflowStatus: 'APPROVED' },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: scanLimit,
      select: {
        id: true,
        status: true,
        workflowStatus: true,
        currentVersion: true,
        approvedAt: true,
        updatedAt: true,
        graduation: {
          select: {
            studentId: true,
            student: { select: { studentCode: true, fullName: true } },
          },
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 20,
          select: {
            version: true,
            schemaVersion: true,
            payload: true,
            payloadHash: true,
            anchors: {
              select: {
                eventType: true,
                status: true,
                payloadHash: true,
                committedAt: true,
              },
            },
          },
        },
        events: {
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'asc' },
          select: { eventType: true, actorId: true, createdAt: true },
        },
      },
    })) as AnomalyDiploma[];

    const activeDiplomas = (await this.database.diploma.findMany({
      where: { ...scope, status: 'ACTIVE' },
      take: MAX_ACTIVE_DUPLICATE_SCAN,
      select: {
        id: true,
        graduation: { select: { studentId: true } },
      },
    })) as ActiveDiploma[];

    const candidates: AnomalyCandidate[] = [];
    const add = (candidate: AnomalyCandidate) => candidates.push(candidate);

    const activeByStudent = new Map<string, ActiveDiploma[]>();
    for (const diploma of activeDiplomas) {
      const group = activeByStudent.get(diploma.graduation.studentId) || [];
      group.push(diploma);
      activeByStudent.set(diploma.graduation.studentId, group);
    }
    activeByStudent.forEach((group, studentId) => {
      if (group.length < 2) return;
      group.forEach((diploma) =>
        add(
          makeCandidate({
            diplomaId: diploma.id,
            type: 'MULTIPLE_ACTIVE_DIPLOMAS',
            riskScore: 70,
            source: 'AI_RULES',
            evidence: {
              studentId,
              activeDiplomaIds: group.map((item) => item.id),
              count: group.length,
            },
          }),
        ),
      );
    });

    const issueEventsByActor = new Map<
      string,
      Array<{
        id: string;
        diplomaId: string;
        actorId: string | null;
        createdAt: Date;
      }>
    >();
    for (const diploma of diplomas) {
      for (const event of diploma.events) {
        if (event.eventType !== 'ISSUE') continue;
        const actorKey = event.actorId || 'unknown';
        const group = issueEventsByActor.get(actorKey) || [];
        group.push({
          id: `${diploma.id}:${event.createdAt.toISOString()}`,
          diplomaId: diploma.id,
          actorId: event.actorId,
          createdAt: event.createdAt,
        });
        issueEventsByActor.set(actorKey, group);
      }
    }
    issueEventsByActor.forEach((events, actorId) => {
      const burst = findBurstWindow(events, 10, ANOMALY_WINDOW_MS);
      if (!burst) return;
      const diplomaIds = [...new Set(burst.map((event) => event.diplomaId))];
      diplomaIds.forEach((diplomaId) =>
        add(
          makeCandidate({
            diplomaId,
            type: 'ISSUE_BURST',
            riskScore: 35,
            source: 'AI_RULES',
            evidence: {
              actorId: actorId === 'unknown' ? null : actorId,
              eventCount: burst.length,
              windowMinutes: 15,
              firstAt: burst[0].createdAt.toISOString(),
              lastAt: burst[burst.length - 1].createdAt.toISOString(),
              diplomaIds,
            },
          }),
        ),
      );
    });

    for (const diploma of diplomas) {
      const version = diploma.versions[0];
      const issueAnchor = version?.anchors.find(
        (anchor) => anchor.eventType === 'ISSUE',
      );
      if (version) {
        const calculatedHash =
          version.schemaVersion === HASH_SCHEMA_VERSION
            ? payloadHash(version.payload)
            : legacyHash(version.payload as Record<string, any>);
        if (calculatedHash !== version.payloadHash) {
          add(
            makeCandidate({
              diplomaId: diploma.id,
              type: 'HASH_MISMATCH',
              riskScore: 100,
              source: 'AI_RULES',
              databaseHash: calculatedHash,
              evidence: {
                calculatedHash,
                storedPayloadHash: version.payloadHash,
                version: version.version,
              },
            }),
          );
        }
        const failedAnchors = version.anchors.filter(
          (anchor) => anchor.status === 'FAILED',
        );
        if (failedAnchors.length > 0) {
          add(
            makeCandidate({
              diplomaId: diploma.id,
              type: 'ANCHOR_FAILURE_PATTERN',
              riskScore: 45,
              source: 'AI_RULES',
              evidence: {
                version: version.version,
                failedAnchorCount: failedAnchors.length,
                eventTypes: failedAnchors.map((anchor) => anchor.eventType),
              },
            }),
          );
        }
      }

      if (
        ['ACTIVE', 'APPROVED'].includes(diploma.status) ||
        diploma.workflowStatus === 'APPROVED'
      ) {
        const approvedAt = diploma.approvedAt?.getTime() || 0;
        const pendingFor = approvedAt ? now.getTime() - approvedAt : 0;
        if (!issueAnchor || issueAnchor.status !== 'COMMITTED') {
          const delayed = pendingFor >= ANCHOR_GRACE_MS;
          add(
            makeCandidate({
              diplomaId: diploma.id,
              type: delayed
                ? 'ANCHOR_PENDING_TOO_LONG'
                : 'ANCHOR_NOT_COMMITTED',
              riskScore: delayed ? 60 : 30,
              source: 'AI_RULES',
              evidence: {
                workflowStatus: diploma.workflowStatus,
                diplomaStatus: diploma.status,
                approvedAt: diploma.approvedAt?.toISOString() || null,
                pendingHours: approvedAt
                  ? Math.round(pendingFor / 3600000)
                  : null,
                anchorStatus: issueAnchor?.status || null,
              },
            }),
          );
        }
      }

      if (diploma.currentVersion >= 3 || diploma.versions.length >= 3) {
        add(
          makeCandidate({
            diplomaId: diploma.id,
            type: 'VERSION_CHURN',
            riskScore: 25,
            source: 'AI_RULES',
            evidence: {
              currentVersion: diploma.currentVersion,
              versionsObserved: diploma.versions.length,
              scanDays: boundedDays,
            },
          }),
        );
      }

      const approvedAt = diploma.approvedAt?.getTime();
      const postApprovalEvents = diploma.events.filter(
        (event) =>
          approvedAt &&
          event.createdAt.getTime() > approvedAt &&
          MUTATION_AFTER_APPROVAL.has(event.eventType),
      );
      if (postApprovalEvents.length) {
        add(
          makeCandidate({
            diplomaId: diploma.id,
            type: 'POST_APPROVAL_MUTATION',
            riskScore: 50,
            source: 'AI_RULES',
            evidence: {
              approvedAt: diploma.approvedAt?.toISOString() || null,
              events: postApprovalEvents.map((event) => ({
                eventType: event.eventType,
                actorId: event.actorId,
                createdAt: event.createdAt.toISOString(),
              })),
            },
          }),
        );
      }
    }

    const signalsByDiploma = new Map<string, AnomalyCandidate[]>();
    candidates.forEach((candidate) => {
      const signals = signalsByDiploma.get(candidate.diplomaId) || [];
      signals.push(candidate);
      signalsByDiploma.set(candidate.diplomaId, signals);
    });
    signalsByDiploma.forEach((signals, diplomaId) => {
      const aggregate = aggregateRisk(diplomaId, signals);
      if (aggregate) candidates.push(aggregate);
    });

    const persisted: unknown[] = [];
    let created = 0;
    for (const candidate of candidates) {
      const result = await this.persistCandidate(candidate, now);
      persisted.push(result.record);
      if (result.created) created++;
    }
    return {
      scanned: diplomas.length,
      candidates: candidates.length,
      created,
      refreshed: candidates.length - created,
      alerts: persisted,
      ruleVersion: ANOMALY_RULE_VERSION,
      since: since.toISOString(),
      generatedAt: now.toISOString(),
    };
  }

  private alertScope(actor?: AuthActor): Prisma.IntegrityAlertWhereInput {
    const scope = this.scopeForActor(actor);
    return actor ? { diploma: scope } : {};
  }

  private alertInclude = {
    diploma: {
      select: {
        id: true,
        certificateNo: true,
        registryNo: true,
        status: true,
        workflowStatus: true,
        graduation: {
          select: {
            student: { select: { studentCode: true, fullName: true } },
          },
        },
      },
    },
  } satisfies Prisma.IntegrityAlertInclude;

  async getAlerts(
    resolved = false,
    actor?: AuthActor,
    options: { source?: string; severity?: string; limit?: number } = {},
  ) {
    const requestedLimit = options.limit;
    const take = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(200, Math.floor(requestedLimit as number)))
      : 100;
    return this.database.integrityAlert.findMany({
      where: {
        resolvedAt: resolved ? { not: null } : null,
        ...(options.source ? { source: options.source } : {}),
        ...(options.severity ? { severity: options.severity } : {}),
        ...this.alertScope(actor),
      },
      include: this.alertInclude,
      orderBy: [{ riskScore: 'desc' }, { lastSeenAt: 'desc' }],
      take,
    });
  }

  async getAnomalies(
    resolved = false,
    actor?: AuthActor,
    severity?: string,
    limit?: number,
  ) {
    const items = await this.getAlerts(resolved, actor, {
      source: 'AI_RULES',
      severity,
      limit,
    });
    return {
      items,
      summary: {
        total: items.length,
        critical: items.filter((item) => item.severity === 'CRITICAL').length,
        high: items.filter((item) => item.severity === 'HIGH').length,
        medium: items.filter((item) => item.severity === 'MEDIUM').length,
        low: items.filter((item) => item.severity === 'LOW').length,
      },
      ruleVersion: ANOMALY_RULE_VERSION,
      generatedAt: new Date().toISOString(),
    };
  }

  async resolveAlert(id: string, note: string, actor?: AuthActor) {
    const changed = await this.database.integrityAlert.updateMany({
      where: {
        id,
        resolvedAt: null,
        ...this.alertScope(actor),
      },
      data: { resolvedAt: new Date(), resolvedById: actor?.id, note },
    });
    if (!changed.count) throw new ForbiddenException();
    return { success: true };
  }

  async reopenAlert(id: string, note: string, actor?: AuthActor) {
    const changed = await this.database.integrityAlert.updateMany({
      where: {
        id,
        resolvedAt: { not: null },
        ...this.alertScope(actor),
      },
      data: { resolvedAt: null, resolvedById: null, note },
    });
    if (!changed.count) throw new ForbiddenException();
    return { success: true };
  }
}

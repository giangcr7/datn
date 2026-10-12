import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { FabricService } from '../fabric/fabric.service';
import { Prisma } from '../generated/prisma/client';
import { diplomaInclude } from '../database/diploma-projection';
import {
  HASH_SCHEMA_VERSION,
  payloadHash,
  legacyHash,
} from '../database/diploma-hash';
import type { AuthActor } from '../auth/auth-actor';

@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly fabric: FabricService,
  ) {}
  @Cron('0 2 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async runDailyCheck() {
    if (!this.fabric.enabled) return;
    let cursor: string | undefined;
    do {
      const result = await this.checkIncremental(0, 100, undefined, cursor);
      cursor = result.nextCursor;
    } while (cursor);
  }
  async debugCount() {
    return {
      total: await this.database.diploma.count(),
      onChain: await this.database.blockchainAnchor.count({
        where: { eventType: 'ISSUE', status: 'COMMITTED' },
      }),
    };
  }
  async checkIncremental(
    days = 1,
    limit = 50,
    actor?: AuthActor,
    cursor?: string,
  ) {
    if (actor && !['admin', 'university'].includes(actor.role))
      throw new ForbiddenException();
    const where: Prisma.DiplomaWhereInput = {
      versions: {
        some: {
          anchors: { some: { eventType: 'ISSUE', status: 'COMMITTED' } },
        },
      },
      ...(days > 0
        ? { updatedAt: { gte: new Date(Date.now() - days * 86400000) } }
        : {}),
      ...(actor
        ? {
            institutionId: actor.institutionId,
            ...(actor.role === 'admin' ? {} : { campusId: actor.campusId }),
          }
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
    let checked = 0,
      unavailable = 0;
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
          const existing = await this.database.integrityAlert.findFirst({
            where: { diplomaId: diploma.id, type, resolvedAt: null },
          });
          if (existing) alerts.push(existing);
          else
            alerts.push(
              await this.database.integrityAlert.create({
                data: {
                  diplomaId: diploma.id,
                  type,
                  databaseHash: hash,
                  fabricHash: chainHash,
                },
              }),
            );
        }
      } catch {
        unavailable++;
        this.logger.warn(
          'Không truy vấn được Fabric cho một bản ghi; không đánh dấu giả mạo',
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
  async getAlerts(resolved = false, actor?: AuthActor) {
    return this.database.integrityAlert.findMany({
      where: {
        resolvedAt: resolved ? { not: null } : null,
        ...(actor
          ? {
              diploma: {
                institutionId: actor.institutionId,
                ...(actor.role === 'admin' ? {} : { campusId: actor.campusId }),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async resolveAlert(id: string, note: string, actor?: AuthActor) {
    const changed = await this.database.integrityAlert.updateMany({
      where: {
        id,
        ...(actor
          ? {
              diploma: {
                institutionId: actor.institutionId,
                ...(actor.role === 'admin' ? {} : { campusId: actor.campusId }),
              },
            }
          : {}),
      },
      data: { resolvedAt: new Date(), resolvedById: actor?.id, note },
    });
    if (!changed.count) throw new ForbiddenException();
    return { success: true };
  }
}

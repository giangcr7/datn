import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { FabricService } from '../fabric/fabric.service';
import { OUTBOX_MAX_ATTEMPTS } from './outbox-policy';

@Injectable()
export class OutboxService {
  private busy = false;
  private readonly logger = new Logger(OutboxService.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly fabric: FabricService,
  ) {}
  @Interval(5000)
  async tick() {
    if (
      this.busy ||
      !this.fabric.enabled ||
      process.env.OUTBOX_ENABLED === 'false'
    )
      return;
    this.busy = true;
    try {
      for (let count = 0; count < 10; count++) {
        if (!(await this.processOne())) break;
      }
    } catch {
      this.logger.error('Outbox worker không truy cập được database');
    } finally {
      this.busy = false;
    }
  }
  async processOne() {
    const lockToken = randomUUID();
    const claimed = await this.database.$queryRaw<
      { id: string; status: string }[]
    >`
      WITH candidate AS (
        SELECT candidate_event.id FROM outbox_events candidate_event
        WHERE ((candidate_event.status = 'PENDING' AND candidate_event.available_at <= now()) OR (candidate_event.status = 'PROCESSING' AND candidate_event.locked_until < now()))
          AND (candidate_event.event_type <> 'REVOKE' OR EXISTS (SELECT 1 FROM blockchain_anchors issue_anchor
            WHERE issue_anchor.version_id = candidate_event.version_id AND issue_anchor.event_type = 'ISSUE' AND issue_anchor.status = 'COMMITTED'))
          AND (candidate_event.event_type <> 'ISSUE' OR NOT EXISTS (
            SELECT 1 FROM diploma_versions candidate_version JOIN diplomas replacement ON replacement.id = candidate_version.diploma_id
            WHERE candidate_version.id = candidate_event.version_id AND replacement.supersedes_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM diploma_versions previous_version
                JOIN outbox_events revoke_event ON revoke_event.version_id = previous_version.id
                JOIN blockchain_anchors revoke_anchor ON revoke_anchor.version_id = previous_version.id AND revoke_anchor.event_type = 'REVOKE'
                WHERE previous_version.diploma_id = replacement.supersedes_id
                  AND previous_version.version = (replacement.replacement_data->>'previousVersion')::integer
                  AND revoke_event.event_type = 'REVOKE' AND revoke_event.status = 'COMPLETED' AND revoke_anchor.status = 'COMMITTED')
          ))
        ORDER BY candidate_event.created_at FOR UPDATE OF candidate_event SKIP LOCKED LIMIT 1
      ), claimed AS (
        UPDATE outbox_events SET
          status = (CASE WHEN attempts >= ${OUTBOX_MAX_ATTEMPTS} THEN 'FAILED' ELSE 'PROCESSING' END)::"OutboxStatus",
          attempts = CASE WHEN attempts >= ${OUTBOX_MAX_ATTEMPTS} THEN attempts ELSE attempts + 1 END,
          locked_until = CASE WHEN attempts >= ${OUTBOX_MAX_ATTEMPTS} THEN NULL ELSE now() + interval '5 minutes' END,
          lock_token = CASE WHEN attempts >= ${OUTBOX_MAX_ATTEMPTS} THEN NULL ELSE ${lockToken}::uuid END,
          last_error = CASE WHEN attempts >= ${OUTBOX_MAX_ATTEMPTS}
            THEN 'Worker lease expired after the final allowed attempt; commit status unknown. Previous error: ' || COALESCE(last_error, 'none') ELSE last_error END
        WHERE id IN (SELECT id FROM candidate) RETURNING id, version_id, event_type, status, last_error
      ), exhausted_anchors AS (
        UPDATE blockchain_anchors anchor SET status = 'FAILED', last_error = claimed.last_error
        FROM claimed WHERE claimed.status = 'FAILED' AND anchor.version_id = claimed.version_id
          AND anchor.event_type = claimed.event_type AND anchor.status <> 'COMMITTED'
        RETURNING anchor.id
      ) SELECT id, status FROM claimed
    `;
    if (!claimed[0]) return false;
    if (claimed[0].status === 'FAILED') return true;
    const event = await this.database.outboxEvent.findUniqueOrThrow({
      where: { id: claimed[0].id },
      include: { version: true },
    });
    const payload = event.payload as {
      uuid: string;
      version: number;
      payloadHash: string;
      schemaVersion?: string;
      issuerMspId: string;
      reasonHash?: string;
    };
    try {
      const response = await this.fabric.executeForMsp(
        payload.issuerMspId,
        'submit',
        event.eventType === 'ISSUE' ? 'AnchorDiploma' : 'RevokeDiplomaAnchor',
        payload.uuid,
        String(payload.version),
        ...(event.eventType === 'ISSUE'
          ? [payload.schemaVersion!, payload.payloadHash, payload.issuerMspId]
          : [payload.reasonHash!]),
      );
      if (!response.payload) throw new Error('Fabric không trả payload');
      const result = JSON.parse(response.payload) as {
        success?: boolean;
        txId?: string;
        hash?: string;
        idempotent?: boolean;
      };
      if (
        result?.success !== true ||
        typeof result.txId !== 'string' ||
        !result.txId ||
        (event.eventType === 'ISSUE' &&
          result.hash !== event.version.payloadHash)
      )
        throw new Error('Fabric response does not match outbox');
      await this.database.$transaction(async (transaction) => {
        const locked = await transaction.outboxEvent.updateMany({
          where: { id: event.id, lockToken, status: 'PROCESSING' },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            lockedUntil: null,
            lockToken: null,
            lastError: null,
          },
        });
        if (!locked.count) return;
        const anchor = await transaction.blockchainAnchor.update({
          where: {
            versionId_eventType: {
              versionId: event.versionId,
              eventType: event.eventType,
            },
          },
          data: {
            status: 'COMMITTED',
            transactionId: result.txId,
            blockNumber:
              result.idempotent === true || !response.blockNumber
                ? null
                : BigInt(response.blockNumber),
            committedAt: new Date(),
            lastError: null,
          },
        });
        await transaction.diplomaEvent.create({
          data: {
            diplomaId: event.version.diplomaId,
            eventType: 'ANCHOR_COMMITTED',
            metadata: {
              anchorId: anchor.id,
              transactionId: result.txId,
              action: event.eventType,
            },
          },
        });
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 1500)
          : 'Unknown blockchain error';
      await this.database.$transaction(async (transaction) => {
        const changed = await transaction.outboxEvent.updateMany({
          where: { id: event.id, lockToken, status: 'PROCESSING' },
          data: {
            status:
              event.attempts >= OUTBOX_MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
            availableAt: new Date(
              Date.now() +
                Math.min(3600000, 10000 * 2 ** Math.min(event.attempts, 10)),
            ),
            lockedUntil: null,
            lockToken: null,
            lastError: message,
          },
        });
        if (changed.count)
          await transaction.blockchainAnchor.update({
            where: {
              versionId_eventType: {
                versionId: event.versionId,
                eventType: event.eventType,
              },
            },
            data: { status: 'FAILED', lastError: message },
          });
      });
      this.logger.warn(
        'Anchor chưa đồng bộ; đã lưu retry/dead-letter vào outbox',
      );
    }
    return true;
  }
}

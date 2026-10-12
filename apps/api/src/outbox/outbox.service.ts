import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { FabricService } from '../fabric/fabric.service';
import { OutboxEvent } from '../generated/prisma/client';

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
    const claimed = await this.database.$queryRaw<{ id: string }[]>`
      WITH candidate AS (
        SELECT id FROM outbox_events
        WHERE (status = 'PENDING' AND available_at <= now()) OR (status = 'PROCESSING' AND locked_until < now())
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE outbox_events SET status = 'PROCESSING', attempts = attempts + 1, locked_until = now() + interval '5 minutes', lock_token = ${lockToken}::uuid
      WHERE id IN (SELECT id FROM candidate) RETURNING id
    `;
    if (!claimed[0]) return false;
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
      const result = JSON.parse(response.payload);
      if (
        !result.success ||
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
              result.idempotent || !response.blockNumber
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
            status: event.attempts >= 10 ? 'FAILED' : 'PENDING',
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

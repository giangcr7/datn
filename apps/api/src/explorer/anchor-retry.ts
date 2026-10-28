import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import { jsonData } from '../database/data-utils';
import { DatabaseService } from '../database/database.service';
import { HASH_SCHEMA_VERSION, payloadHash } from '../database/diploma-hash';
import { FabricService } from '../fabric/fabric.service';
import type { Prisma } from '../generated/prisma/client';
import { OUTBOX_MAX_ATTEMPTS } from '../outbox/outbox-policy';
import { anchorInclude, anchorProjection } from './anchor-data';
import { AnchorRetryDto } from './anchor-retry.dto';
import { exhaustedOutbox, outboxRetryToken } from './anchor-retry-state';

export async function retryExhaustedAnchor(
  database: DatabaseService,
  fabric: FabricService,
  scope: Prisma.BlockchainAnchorWhereInput,
  id: string,
  body: AnchorRetryDto,
  actor: AuthActor,
  ip?: string,
) {
  const reason = body.reason?.trim();
  if (!reason || reason.length < 10 || reason.length > 2000)
    throw new BadRequestException('Nhập lý do xử lý từ 10 đến 2000 ký tự');
  return database.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT recovery_event.id FROM outbox_events recovery_event
      JOIN blockchain_anchors recovery_anchor ON recovery_anchor.version_id = recovery_event.version_id
        AND recovery_anchor.event_type = recovery_event.event_type
      JOIN diploma_versions recovery_version ON recovery_version.id = recovery_event.version_id
      JOIN diplomas recovery_diploma ON recovery_diploma.id = recovery_version.diploma_id
      WHERE recovery_anchor.id = ${id}::uuid AND recovery_diploma.institution_id = ${actor.institutionId}::uuid
      FOR UPDATE OF recovery_event, recovery_anchor
    `;
    const anchor = await transaction.blockchainAnchor.findFirst({
      where: { AND: [scope, { id, eventType: { in: ['ISSUE', 'REVOKE'] } }] },
      include: anchorInclude,
    });
    if (!anchor)
      throw new NotFoundException(
        'Không tìm thấy giao dịch trong phạm vi nhà trường',
      );
    const version = anchor.version;
    const diploma = version.diploma;
    const event = version.outboxEvents.find(
      (item) => item.eventType === anchor.eventType,
    );
    if (
      !event ||
      !exhaustedOutbox(event) ||
      anchor.status !== 'FAILED' ||
      anchor.transactionId ||
      anchor.committedAt ||
      anchor.blockNumber !== null ||
      event.completedAt ||
      event.lockToken ||
      event.lockedUntil ||
      outboxRetryToken(event) !== body.expectedRetryToken
    )
      throw new ConflictException(
        'Giao dịch đã thay đổi hoặc chưa hết lượt thử lại. Hãy tải lại danh sách',
      );
    if (!fabric.enabled || process.env.OUTBOX_ENABLED === 'false')
      throw new ServiceUnavailableException(
        'Cần bật kết nối Fabric và tiến trình đồng bộ trước khi thử lại',
      );
    if (
      anchor.channel !== fabric.channel ||
      anchor.chaincode !== fabric.chaincode
    )
      throw new ConflictException(
        'Kênh hoặc hợp đồng không khớp cấu hình. Cần xử lý cấu hình trước khi thử lại',
      );
    const payload = (event.payload || {}) as Record<string, unknown>;
    const snapshot = (version.payload || {}) as Record<string, unknown>;
    if (
      version.schemaVersion !== HASH_SCHEMA_VERSION ||
      diploma.workflowStatus !== 'APPROVED' ||
      !['ACTIVE', 'REVOKED', 'SUPERSEDED'].includes(diploma.status) ||
      diploma.currentVersion !== version.version ||
      payloadHash(version.payload) !== version.payloadHash ||
      anchor.payloadHash !== version.payloadHash ||
      payload.payloadHash !== version.payloadHash ||
      payload.uuid !== diploma.id ||
      payload.version !== version.version ||
      snapshot.uuid !== diploma.id ||
      snapshot.version !== version.version ||
      snapshot.institutionId !== actor.institutionId ||
      snapshot.schemaVersion !== version.schemaVersion ||
      !anchor.issuerMspId ||
      payload.issuerMspId !== anchor.issuerMspId ||
      (anchor.eventType === 'ISSUE' &&
        payload.schemaVersion !== version.schemaVersion)
    )
      throw new ConflictException(
        'Dữ liệu tác vụ không khớp bản phát hành đã duyệt; không được gửi lại',
      );
    if (anchor.eventType === 'REVOKE') {
      const issue = version.anchors.find((item) => item.eventType === 'ISSUE');
      if (
        !['REVOKED', 'SUPERSEDED'].includes(diploma.status) ||
        !diploma.revokedReason ||
        payload.reasonHash !== payloadHash({ reason: diploma.revokedReason }) ||
        issue?.status !== 'COMMITTED' ||
        issue.issuerMspId !== anchor.issuerMspId
      )
        throw new ConflictException(
          'Căn cứ thu hồi hoặc giao dịch phát hành chưa đủ điều kiện gửi lại',
        );
    }
    if (anchor.eventType === 'ISSUE' && diploma.supersedesId) {
      const previousVersion = (
        diploma.replacementData as Record<string, unknown> | null
      )?.previousVersion;
      const dependency =
        typeof previousVersion === 'number' &&
        (await transaction.outboxEvent.findFirst({
          where: {
            eventType: 'REVOKE',
            status: 'COMPLETED',
            version: {
              diplomaId: diploma.supersedesId,
              version: previousVersion,
              diploma: { institutionId: actor.institutionId },
              anchors: { some: { eventType: 'REVOKE', status: 'COMMITTED' } },
            },
          },
          select: { id: true },
        }));
      if (!dependency)
        throw new ConflictException(
          'Cần hoàn tất giao dịch thu hồi văn bằng cũ trước khi thử lại phát hành thay thế',
        );
    }
    const metadata = jsonData({
      anchorId: id,
      outboxId: event.id,
      eventType: anchor.eventType,
      version: version.version,
      actorEmail: actor.email,
      reason,
      previousAttempts: event.attempts,
      previousError: event.lastError || anchor.lastError,
      previousAvailableAt: event.availableAt.toISOString(),
      previousRetryToken: body.expectedRetryToken,
      maxAttempts: OUTBOX_MAX_ATTEMPTS,
    });
    await transaction.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        lastError: null,
      },
    });
    const updated = await transaction.blockchainAnchor.update({
      where: { id },
      data: { status: 'QUEUED', lastError: null },
      include: anchorInclude,
    });
    const history = await transaction.diplomaEvent.create({
      data: {
        diplomaId: diploma.id,
        actorId: actor.id,
        eventType: 'ANCHOR_RETRY_REQUESTED',
        reason,
        metadata,
      },
      select: { id: true, reason: true, metadata: true, createdAt: true },
    });
    updated.version.diploma.events.unshift(history);
    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email,
        institutionId: actor.institutionId,
        action: 'RETRY_BLOCKCHAIN',
        target: diploma.id,
        result: 'SUCCESS',
        ip,
        metadata,
      },
    });
    return {
      message:
        'Đã đưa giao dịch gốc vào hàng đợi với tối đa 10 lượt thử mới; chưa xác nhận ghi nhận trên blockchain.',
      anchor: anchorProjection(updated),
    };
  });
}

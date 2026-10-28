import { Prisma } from '../generated/prisma/client';
import { exhaustedOutbox, outboxRetryToken } from './anchor-retry-state';

export const anchorInclude = {
  version: {
    include: {
      anchors: true,
      outboxEvents: true,
      diploma: {
        select: {
          id: true,
          institutionId: true,
          status: true,
          workflowStatus: true,
          supersedesId: true,
          replacementData: true,
          revokedReason: true,
          currentVersion: true,
          certificateNo: true,
          registryNo: true,
          events: {
            where: { eventType: 'ANCHOR_RETRY_REQUESTED' },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 20,
            select: { id: true, reason: true, metadata: true, createdAt: true },
          },
          graduation: {
            select: {
              student: { select: { fullName: true, studentCode: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.BlockchainAnchorInclude;

export type AnchorWithRelations = Prisma.BlockchainAnchorGetPayload<{
  include: typeof anchorInclude;
}>;

export function anchorProjection(anchor: AnchorWithRelations) {
  const version = anchor.version;
  const diploma = version.diploma;
  const payload = version.payload as Record<string, unknown>;
  const field = (key: string, fallback: string) =>
    Object.hasOwn(payload, key)
      ? typeof payload[key] === 'string'
        ? payload[key]
        : null
      : fallback;
  const outbox = version.outboxEvents.find(
    (event) => event.eventType === anchor.eventType,
  );
  return {
    id: anchor.id,
    diplomaId: diploma.id,
    fullName: field('fullName', diploma.graduation.student.fullName),
    mssv: field('mssv', diploma.graduation.student.studentCode),
    certificateNo: field('soHieu', diploma.certificateNo),
    registryNo: field('soVaoSo', diploma.registryNo),
    documentStatus: diploma.status,
    version: version.version,
    eventType: anchor.eventType,
    status: anchor.status,
    transactionId: anchor.transactionId,
    blockNumber: anchor.blockNumber?.toString() ?? null,
    payloadHash: anchor.payloadHash,
    channel: anchor.channel,
    chaincode: anchor.chaincode,
    committedAt: anchor.committedAt,
    createdAt: anchor.createdAt,
    lastError: anchor.lastError || outbox?.lastError || null,
    retryHistory: (diploma.events || []).flatMap((event) => {
      const metadata = event.metadata as Record<string, unknown> | null;
      return metadata?.anchorId === anchor.id
        ? [
            {
              id: event.id,
              reason: event.reason,
              createdAt: event.createdAt,
              actorEmail: metadata.actorEmail,
              previousAttempts: metadata.previousAttempts,
              previousError: metadata.previousError,
            },
          ]
        : [];
    }),
    outbox: outbox
      ? {
          id: outbox.id,
          exhausted: exhaustedOutbox(outbox),
          retryToken: outboxRetryToken(outbox),
          status: outbox.status,
          attempts: outbox.attempts,
          availableAt: outbox.availableAt,
          lockedUntil: outbox.lockedUntil,
          completedAt: outbox.completedAt,
        }
      : null,
  };
}

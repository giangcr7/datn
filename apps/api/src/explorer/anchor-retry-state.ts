import { payloadHash } from '../database/diploma-hash';
import type { OutboxEvent } from '../generated/prisma/client';
import { OUTBOX_MAX_ATTEMPTS } from '../outbox/outbox-policy';

export function exhaustedOutbox(event: OutboxEvent | undefined) {
  return (
    !!event &&
    event.status === 'FAILED' &&
    event.attempts >= OUTBOX_MAX_ATTEMPTS
  );
}

export function outboxRetryToken(event: OutboxEvent) {
  return payloadHash({
    id: event.id,
    status: event.status,
    attempts: event.attempts,
    availableAt: event.availableAt.toISOString(),
    lockedUntil: event.lockedUntil?.toISOString() ?? null,
    lockToken: event.lockToken,
    completedAt: event.completedAt?.toISOString() ?? null,
    lastError: event.lastError,
    payload: event.payload,
  });
}

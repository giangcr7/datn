import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import type { FabricService } from '../fabric/fabric.service';
import type { OutboxEvent } from '../generated/prisma/client';
import type { AnchorWithRelations } from './anchor-data';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { payloadHash } from '../database/diploma-hash';
import { AnchorRetryDto } from './anchor-retry.dto';
import { outboxRetryToken } from './anchor-retry-state';
import { ExplorerService } from './explorer.service';

function matching(value: object): unknown {
  return expect.objectContaining(value) as unknown;
}

function fixture() {
  const actor = {
    id: 'officer',
    email: 'officer@example.test',
    role: 'university',
    institutionId: 'school',
    isHeadquarters: true,
    canApproveDiplomas: true,
  } as AuthActor;
  const snapshot = {
    uuid: 'diploma',
    version: 1,
    institutionId: 'school',
    schemaVersion: 'diploma-v1',
  };
  const hash = payloadHash(snapshot);
  const submission: Record<string, string | number> = {
    uuid: 'diploma',
    version: 1,
    payloadHash: hash,
    schemaVersion: 'diploma-v1',
    issuerMspId: 'Org1MSP',
  };
  const event: OutboxEvent = {
    id: 'event',
    versionId: 'version',
    eventType: 'ISSUE',
    status: 'FAILED',
    attempts: 10,
    availableAt: new Date('2026-10-28T01:00:00Z'),
    lockedUntil: null,
    lockToken: null,
    completedAt: null,
    lastError: 'Commit response lost',
    payload: submission,
    createdAt: new Date(),
  };
  const anchor = {
    id: 'anchor',
    versionId: 'version',
    eventType: 'ISSUE',
    status: 'FAILED',
    transactionId: null,
    committedAt: null,
    blockNumber: null,
    lastError: event.lastError,
    channel: 'channel',
    chaincode: 'educert',
    issuerMspId: 'Org1MSP',
    payloadHash: hash,
    version: {
      payload: snapshot,
      payloadHash: hash,
      schemaVersion: 'diploma-v1',
      version: 1,
      outboxEvents: [event],
      anchors: [],
      diploma: {
        id: 'diploma',
        workflowStatus: 'APPROVED',
        currentVersion: 1,
        status: 'ACTIVE',
        supersedesId: null as string | null,
        replacementData: null,
        revokedReason: null as string | null,
        events: [],
        graduation: { student: { fullName: 'Nguyễn An', studentCode: '001' } },
      },
    },
  } as unknown as AnchorWithRelations;
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: event.id }]),
    blockchainAnchor: {
      findFirst: jest.fn().mockResolvedValue(anchor),
      update: jest.fn(
        ({ data }: { data: { status: 'QUEUED'; lastError: null } }) =>
          Promise.resolve({ ...anchor, ...data }),
      ),
    },
    outboxEvent: {
      update: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    diplomaEvent: {
      create: jest.fn().mockResolvedValue({
        id: 'history',
        reason: 'Đã khôi phục kết nối',
        metadata: { anchorId: 'anchor' },
      }),
    },
    auditLog: { create: jest.fn() },
  };
  const database = {
    $transaction: jest.fn(
      (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const fabric = {
    enabled: true,
    channel: 'channel',
    chaincode: 'educert',
    execute: jest.fn(),
    executeForMsp: jest.fn(),
  };
  const body = {
    reason: 'Đã khôi phục kết nối',
    expectedRetryToken: outboxRetryToken(event),
  };
  const service = new ExplorerService(
    database as unknown as DatabaseService,
    fabric as unknown as FabricService,
  );
  const run = () =>
    Promise.resolve().then(() => service.retryAnchor(anchor.id, body, actor));
  return {
    actor,
    snapshot,
    submission,
    event,
    anchor,
    transaction,
    database,
    fabric,
    body,
    run,
  };
}

describe('exhausted blockchain recovery', () => {
  it('requeues the same task atomically with a reason and the previous error/attempts in both histories', async () => {
    const test = fixture();
    const payload = JSON.stringify(test.event.payload);
    const result = await test.run();
    expect(result.anchor.status).toBe('QUEUED');
    expect(test.transaction.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'event' },
      data: {
        status: 'PENDING',
        attempts: 0,
        availableAt: expect.any(Date) as unknown,
        lastError: null,
      },
    });
    expect(test.transaction.auditLog.create).toHaveBeenCalledWith({
      data: matching({
        action: 'RETRY_BLOCKCHAIN',
        actorId: 'officer',
        institutionId: 'school',
        metadata: matching({
          previousAttempts: 10,
          previousError: 'Commit response lost',
          reason: test.body.reason,
        }),
      }),
    });
    expect(test.transaction.diplomaEvent.create).toHaveBeenCalled();
    expect(JSON.stringify(test.event.payload)).toBe(payload);
    expect(test.fabric.executeForMsp).not.toHaveBeenCalled();
    expect(test.fabric.execute).not.toHaveBeenCalled();
  });

  it.each([
    [
      'pending',
      (test: ReturnType<typeof fixture>) => {
        test.event.status = 'PENDING';
      },
    ],
    [
      'processing',
      (test: ReturnType<typeof fixture>) => {
        test.event.status = 'PROCESSING';
      },
    ],
    [
      'completed',
      (test: ReturnType<typeof fixture>) => {
        test.event.status = 'COMPLETED';
      },
    ],
    [
      'not exhausted',
      (test: ReturnType<typeof fixture>) => {
        test.event.attempts = 9;
      },
    ],
    [
      'lease',
      (test: ReturnType<typeof fixture>) => {
        test.event.lockedUntil = new Date();
      },
    ],
    [
      'lock',
      (test: ReturnType<typeof fixture>) => {
        test.event.lockToken = 'another-worker';
      },
    ],
    [
      'completion',
      (test: ReturnType<typeof fixture>) => {
        test.event.completedAt = new Date();
      },
    ],
    [
      'committed',
      (test: ReturnType<typeof fixture>) => {
        test.anchor.status = 'COMMITTED';
      },
    ],
    [
      'transaction evidence',
      (test: ReturnType<typeof fixture>) => {
        test.anchor.transactionId = 'tx';
      },
    ],
    [
      'commit evidence',
      (test: ReturnType<typeof fixture>) => {
        test.anchor.committedAt = new Date();
      },
    ],
    [
      'block evidence',
      (test: ReturnType<typeof fixture>) => {
        test.anchor.blockNumber = 0n;
      },
    ],
    [
      'stale token',
      (test: ReturnType<typeof fixture>) => {
        test.body.expectedRetryToken = '0'.repeat(64);
      },
    ],
    [
      'changed snapshot',
      (test: ReturnType<typeof fixture>) => {
        test.snapshot.version = 2;
      },
    ],
    [
      'changed payload',
      (test: ReturnType<typeof fixture>) => {
        test.submission.uuid = 'other';
      },
    ],
    [
      'issuer',
      (test: ReturnType<typeof fixture>) => {
        test.submission.issuerMspId = 'Org2MSP';
      },
    ],
    [
      'legacy schema',
      (test: ReturnType<typeof fixture>) => {
        test.anchor.version.schemaVersion = 'legacy';
      },
    ],
    [
      'not approved',
      (test: ReturnType<typeof fixture>) => {
        test.anchor.version.diploma.workflowStatus = 'REQUESTED';
      },
    ],
    [
      'old version',
      (test: ReturnType<typeof fixture>) => {
        test.anchor.version.diploma.currentVersion = 2;
      },
    ],
    [
      'channel',
      (test: ReturnType<typeof fixture>) => {
        test.fabric.channel = 'other';
      },
    ],
    [
      'chaincode',
      (test: ReturnType<typeof fixture>) => {
        test.fabric.chaincode = 'other';
      },
    ],
  ])('rejects %s without modifying the queue', async (_label, mutate) => {
    const test = fixture();
    mutate(test);
    if (_label !== 'stale token')
      test.body.expectedRetryToken = outboxRetryToken(test.event);
    await expect(test.run()).rejects.toMatchObject({ status: 409 });
    expect(test.transaction.outboxEvent.update).not.toHaveBeenCalled();
  });

  it.each(['student', 'employer'])(
    'denies role %s before taking any locks',
    async (role) => {
      const test = fixture();
      test.actor.role = role as 'student' | 'employer';
      await expect(test.run()).rejects.toMatchObject({ status: 403 });
      expect(test.database.$transaction).not.toHaveBeenCalled();
    },
  );

  it('allows technical admin recovery but does not change approval, signatures or business status', async () => {
    const test = fixture();
    test.actor.role = 'admin';
    test.actor.canApproveDiplomas = false;
    const before = { ...test.anchor.version.diploma };
    await test.run();
    expect(test.anchor.version.diploma.status).toBe(before.status);
    expect(test.anchor.version.diploma.workflowStatus).toBe(
      before.workflowStatus,
    );
  });

  it('denies a non-approver university officer', async () => {
    const test = fixture();
    test.actor.canApproveDiplomas = false;
    await expect(test.run()).rejects.toMatchObject({ status: 403 });
  });

  it('does not disclose cross-school or missing anchors', async () => {
    const test = fixture();
    test.transaction.blockchainAnchor.findFirst.mockResolvedValue(null);
    await expect(test.run()).rejects.toMatchObject({ status: 404 });
  });

  it('keeps failures untouched while Fabric is disabled', async () => {
    const test = fixture();
    test.fabric.enabled = false;
    await expect(test.run()).rejects.toMatchObject({ status: 503 });
    expect(test.transaction.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('preserves the worker disabled flag', async () => {
    const previous = process.env.OUTBOX_ENABLED;
    process.env.OUTBOX_ENABLED = 'false';
    try {
      await expect(fixture().run()).rejects.toMatchObject({ status: 503 });
    } finally {
      if (previous === undefined) delete process.env.OUTBOX_ENABLED;
      else process.env.OUTBOX_ENABLED = previous;
    }
  });

  it('requires the exact predecessor revocation for a replacement ISSUE', async () => {
    const test = fixture();
    test.anchor.version.diploma.supersedesId = 'previous';
    test.anchor.version.diploma.replacementData = { previousVersion: 3 };
    await expect(test.run()).rejects.toMatchObject({ status: 409 });
    expect(test.transaction.outboxEvent.findFirst).toHaveBeenCalledWith(
      matching({
        where: matching({
          eventType: 'REVOKE',
          status: 'COMPLETED',
          version: matching({
            diplomaId: 'previous',
            version: 3,
          }),
        }),
      }),
    );
    test.transaction.outboxEvent.findFirst.mockResolvedValue({
      id: 'revoke',
    });
    await expect(test.run()).resolves.toMatchObject({
      anchor: { status: 'QUEUED' },
    });
  });

  it('recovers REVOKE only with matching reason and committed original ISSUE', async () => {
    const test = fixture();
    test.event.eventType = test.anchor.eventType = 'REVOKE';
    test.anchor.version.diploma.status = 'SUPERSEDED';
    test.anchor.version.diploma.revokedReason = 'Thay thế do sửa sai';
    test.submission.reasonHash = payloadHash({
      reason: 'Thay thế do sửa sai',
    });
    test.anchor.version.anchors = [
      {
        ...test.anchor,
        eventType: 'ISSUE',
        status: 'COMMITTED',
        issuerMspId: 'Org1MSP',
      },
    ];
    test.body.expectedRetryToken = outboxRetryToken(test.event);
    await expect(test.run()).resolves.toMatchObject({
      anchor: { eventType: 'REVOKE' },
    });
    test.anchor.version.anchors[0].status = 'FAILED';
    await expect(test.run()).rejects.toMatchObject({ status: 409 });
  });

  it('does not report success if mandatory audit persistence fails', async () => {
    const test = fixture();
    test.transaction.auditLog.create.mockRejectedValue(
      new Error('audit unavailable'),
    );
    await expect(test.run()).rejects.toThrow('audit unavailable');
  });

  it('trims and validates reasons and concurrency tokens', async () => {
    expect(
      await validate(
        plainToInstance(AnchorRetryDto, {
          reason: '    ',
          expectedRetryToken: 'bad',
        }),
      ),
    ).toHaveLength(2);
    const valid = plainToInstance(AnchorRetryDto, {
      reason: '  Đã khôi phục kết nối  ',
      expectedRetryToken: 'a'.repeat(64),
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.reason).toBe('Đã khôi phục kết nối');
  });
});

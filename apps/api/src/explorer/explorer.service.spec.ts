import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import type { FabricService } from '../fabric/fabric.service';
import { payloadHash } from '../database/diploma-hash';
import { ExplorerService } from './explorer.service';
import { AnchorQueryDto } from './anchor-query.dto';
import type { Prisma } from '../generated/prisma/client';

const actor = {
  id: 'officer1',
  email: 'officer@example.test',
  role: 'university',
  institutionId: 'institution1',
  isHeadquarters: true,
  canApproveDiplomas: true,
} as AuthActor;

function setup() {
  const payload = { uuid: 'diploma1', version: 1 };
  const hash = payloadHash(payload);
  const entry = {
    id: 'anchor1',
    status: 'COMMITTED',
    eventType: 'ISSUE',
    channel: 'test',
    chaincode: 'educert',
    transactionId: 'tx1',
    issuerMspId: 'Org1MSP',
    payloadHash: hash,
    version: {
      diplomaId: 'diploma1',
      version: 1,
      schemaVersion: 'diploma-v1',
      payload,
      payloadHash: hash,
      anchors: [],
      outboxEvents: [],
      diploma: { status: 'ACTIVE', currentVersion: 1 },
    },
  };
  const database = {
    blockchainAnchor: {
      findFirst: jest
        .fn<
          Promise<typeof entry | null>,
          [Prisma.BlockchainAnchorFindFirstArgs]
        >()
        .mockResolvedValue(entry),
      findMany: jest
        .fn<Promise<unknown[]>, [Prisma.BlockchainAnchorFindManyArgs]>()
        .mockResolvedValue([]),
      count: jest
        .fn<Promise<number>, [Prisma.BlockchainAnchorCountArgs]>()
        .mockResolvedValue(0),
    },
    auditLog: {
      create: jest
        .fn<Promise<unknown>, [Prisma.AuditLogCreateArgs]>()
        .mockResolvedValue({}),
    },
  };
  const fabric = {
    enabled: true,
    channel: 'test',
    chaincode: 'educert',
    checkConnection: jest
      .fn<Promise<{ connected: boolean; disabled?: boolean }>, []>()
      .mockResolvedValue({ connected: true }),
    execute: jest
      .fn<Promise<{ result: unknown }>, [string, string, ...string[]]>()
      .mockResolvedValue({
        result: {
          uuid: 'diploma1',
          version: 1,
          schemaVersion: 'diploma-v1',
          payloadHash: hash,
          issuerMspId: 'Org1MSP',
          issueTxId: 'tx1',
          isRevoked: false,
        },
      }),
  };
  const service = new ExplorerService(
    database as unknown as DatabaseService,
    fabric as unknown as FabricService,
  );
  return { service, database, fabric, entry };
}

describe('institutional blockchain explorer', () => {
  it.each([
    { role: 'student' },
    { role: 'employer' },
    { isHeadquarters: false },
    { canApproveDiplomas: false },
    { institutionId: undefined },
  ])('denies unauthorized actor %p before any read', async (flags) => {
    const { service, database, fabric } = setup();
    const reader = { ...actor, ...flags } as AuthActor;
    await expect(service.getOverview(reader)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.getAnchors(new AnchorQueryDto(), reader),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getTransactionDetails('tx', reader),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.checkAnchor('anchor', reader)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(database.blockchainAnchor.findFirst).not.toHaveBeenCalled();
    expect(fabric.execute).not.toHaveBeenCalled();
  });

  it('scopes totals and reports disabled Fabric without false network health', async () => {
    const { service, database, fabric } = setup();
    fabric.checkConnection.mockResolvedValue({
      connected: false,
      disabled: true,
    });
    const overview = await service.getOverview(actor);
    expect(overview.networkStatus).toBe('DISABLED');
    expect(overview.blockHeight).toBeNull();
    for (const [query] of database.blockchainAnchor.count.mock.calls)
      expect(JSON.stringify(query)).toContain(actor.institutionId);
  });

  it('uses the same institution and business filters for pagination and count', async () => {
    const { service, database } = setup();
    await service.getAnchors(
      Object.assign(new AnchorQueryDto(), {
        page: 2,
        limit: 10,
        search: 'An',
        eventType: 'REVOKE',
        status: 'FAILED',
      }),
      actor,
    );
    const query = database.blockchainAnchor.findMany.mock.calls[0][0];
    expect(query).toMatchObject({
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(JSON.stringify(query.where)).toContain(actor.institutionId);
    expect(JSON.stringify(query.where)).toContain('REVOKE');
    expect(JSON.stringify(query.where)).toContain('FAILED');
    expect(database.blockchainAnchor.count).toHaveBeenCalledWith({
      where: query.where,
    });
  });

  it('only evaluates Fabric and saves the actual outcome in the activity log', async () => {
    const { service, database, fabric } = setup();
    expect((await service.checkAnchor('anchor1', actor)).status).toBe('MATCH');
    expect(fabric.execute).toHaveBeenCalledWith(
      'evaluate',
      'QueryDiplomaAnchor',
      'diploma1',
      '1',
    );
    expect(database.auditLog.create.mock.calls[0][0].data).toMatchObject({
      institutionId: actor.institutionId,
      action: 'CHECK_BLOCKCHAIN',
      target: 'diploma1',
      result: 'SUCCESS',
      metadata: { status: 'MATCH' },
    });
  });

  it.each(['offline', 'disabled', 'wrong-channel', 'malformed'])(
    'does not report a mismatch or successful check when unavailable: %s',
    async (failure) => {
      const { service, fabric, entry, database } = setup();
      if (failure === 'offline')
        fabric.execute.mockRejectedValue(new Error('gateway down'));
      if (failure === 'disabled') fabric.enabled = false;
      if (failure === 'wrong-channel') entry.channel = 'other';
      if (failure === 'malformed')
        fabric.execute.mockResolvedValue({ result: null });
      const result = await service.checkAnchor('anchor1', actor);
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.checks).toEqual([]);
      expect(database.auditLog.create.mock.calls[0][0].data.result).toBe(
        'FAILED',
      );
      if (failure === 'disabled' || failure === 'wrong-channel')
        expect(fabric.execute).not.toHaveBeenCalled();
    },
  );

  it("does not query Fabric or log another institution's record", async () => {
    const { service, database, fabric } = setup();
    database.blockchainAnchor.findFirst.mockResolvedValue(null);
    await expect(service.checkAnchor('foreign', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fabric.execute).not.toHaveBeenCalled();
    expect(database.auditLog.create).not.toHaveBeenCalled();
  });

  it('preserves admin read/check access without allowing issuance', async () => {
    const { service } = setup();
    await expect(
      service.checkAnchor('anchor1', { ...actor, role: 'admin' }),
    ).resolves.toMatchObject({ status: 'MATCH' });
  });
});

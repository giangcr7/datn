import { OutboxService } from './outbox.service';

describe('outbox commit handling', () => {
  function fixture(response: any, fail = false) {
    const transaction = {
      outboxEvent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      blockchainAnchor: {
        update: jest.fn().mockResolvedValue({ id: 'anchor-id' }),
      },
      diplomaEvent: { create: jest.fn() },
    };
    const event = {
      id: 'event-id',
      versionId: 'version-id',
      eventType: 'ISSUE',
      attempts: 1,
      payload: {
        uuid: 'diploma-id',
        version: 1,
        schemaVersion: 'diploma-v1',
        payloadHash: 'a'.repeat(64),
        issuerMspId: 'Org1MSP',
      },
      version: { diplomaId: 'diploma-id', payloadHash: 'a'.repeat(64) },
    };
    const database = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'event-id' }]),
      outboxEvent: { findUniqueOrThrow: jest.fn().mockResolvedValue(event) },
      $transaction: jest.fn((fn) => fn(transaction)),
    };
    const fabric = {
      enabled: true,
      executeForMsp: fail
        ? jest.fn().mockRejectedValue(new Error('commit status unavailable'))
        : jest.fn().mockResolvedValue(response),
    };
    return {
      service: new OutboxService(database as any, fabric as any),
      database,
      transaction,
      fabric,
      event,
    };
  }
  it('marks COMMITTED only after a matching successful commit response', async () => {
    const test = fixture({
      txId: 'tx-1',
      blockNumber: '7',
      payload: JSON.stringify({
        success: true,
        txId: 'tx-1',
        hash: 'a'.repeat(64),
      }),
    });
    await test.service.processOne();
    expect(test.fabric.executeForMsp).toHaveBeenCalledWith('Org1MSP', 'submit', 'AnchorDiploma', 'diploma-id', '1', 'diploma-v1', 'a'.repeat(64), 'Org1MSP');
    expect(test.transaction.blockchainAnchor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMMITTED',
          transactionId: 'tx-1',
          blockNumber: 7n,
        }),
      }),
    );
  });
  it('reuses the original transaction id without fabricating its block number', async () => {
    const test = fixture({
      txId: 'retry-tx',
      blockNumber: '8',
      payload: JSON.stringify({
        success: true,
        txId: 'original-tx',
        hash: 'a'.repeat(64),
        idempotent: true,
      }),
    });
    await test.service.processOne();
    expect(test.transaction.blockchainAnchor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: 'original-tx',
          blockNumber: null,
        }),
      }),
    );
  });
  it('keeps failed/unknown commits retryable instead of claiming ON_CHAIN', async () => {
    const test = fixture(null, true);
    await test.service.processOne();
    expect(test.transaction.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
    expect(test.transaction.blockchainAnchor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
  it('does not claim jobs while Fabric is disabled', async () => {
    const test = fixture(null);
    test.fabric.enabled = false;
    await test.service.tick();
    expect(test.database.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not submit a lease-expired task after its final allowed attempt', async () => {
    const test = fixture(null);
    test.database.$queryRaw.mockResolvedValue([{ id: 'event-id', status: 'FAILED' }] as any);
    await expect(test.service.processOne()).resolves.toBe(true);
    expect(test.fabric.executeForMsp).not.toHaveBeenCalled();
    expect(test.database.outboxEvent.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { success: 1, txId: 'tx', hash: 'a'.repeat(64) },
    { success: true, txId: 123, hash: 'a'.repeat(64) },
    { success: true, txId: '', hash: 'a'.repeat(64) },
    { success: true, txId: 'tx', hash: 'b'.repeat(64) },
  ])('never completes a recovered task with invalid Fabric evidence %p', async (payload) => {
    const test = fixture({ payload: JSON.stringify(payload) });
    await test.service.processOne();
    expect(test.transaction.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
    );
    expect(test.transaction.diplomaEvent.create).not.toHaveBeenCalled();
  });
});

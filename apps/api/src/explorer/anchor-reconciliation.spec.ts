import { payloadHash, legacyHash } from '../database/diploma-hash';
import type { AnchorWithRelations } from './anchor-data';
import { compareAnchor } from './anchor-reconciliation';

function fixture() {
  const payload = { uuid: 'diploma1', fullName: 'Nguyễn Văn An', version: 1 };
  const hash = payloadHash(payload);
  const anchor = {
    id: 'anchor1',
    eventType: 'ISSUE',
    status: 'COMMITTED',
    issuerMspId: 'Org1MSP',
    transactionId: 'issue-tx',
    payloadHash: hash,
    version: {
      diplomaId: 'diploma1',
      version: 1,
      schemaVersion: 'diploma-v1',
      payload,
      payloadHash: hash,
      diploma: { status: 'ACTIVE', currentVersion: 1 },
      anchors: [],
      outboxEvents: [],
    },
  } as unknown as AnchorWithRelations;
  const chain: Record<string, unknown> = {
    uuid: 'diploma1',
    version: 1,
    schemaVersion: 'diploma-v1',
    payloadHash: hash,
    issuerMspId: 'Org1MSP',
    issueTxId: 'issue-tx',
    isRevoked: false,
  };
  return { anchor, chain };
}

describe('direct blockchain reconciliation', () => {
  it('matches identity, hash, issuer, transaction and revocation', () => {
    const { anchor, chain } = fixture();
    expect(compareAnchor(anchor, chain).status).toBe('MATCH');
  });

  it.each([
    { uuid: 'other' },
    { version: 2 },
    { payloadHash: 'b'.repeat(64) },
    { issuerMspId: 'Org2MSP' },
    { schemaVersion: 'other' },
    { issueTxId: 'different-tx' },
    { isRevoked: true },
  ])('detects contradictory ledger information %p', (flags) => {
    const { anchor, chain } = fixture();
    expect(compareAnchor(anchor, { ...chain, ...flags }).status).toBe(
      'MISMATCH',
    );
  });

  it.each([
    'issueTxId',
    'isRevoked',
    'uuid',
    'version',
    'issuerMspId',
    'schemaVersion',
  ])('does not pass incomplete evidence %s', (field) => {
    const { anchor, chain } = fixture();
    delete chain[field];
    expect(compareAnchor(anchor, chain).status).toBe('INCOMPLETE');
  });

  it('detects a modified snapshot or anchor index hash', () => {
    const { anchor, chain } = fixture();
    anchor.version.payload = {
      ...(anchor.version.payload as object),
      fullName: 'Modified',
    };
    expect(compareAnchor(anchor, chain).status).toBe('MISMATCH');
    anchor.version.payload = {
      uuid: 'diploma1',
      fullName: 'Nguyễn Văn An',
      version: 1,
    };
    anchor.payloadHash = 'b'.repeat(64);
    expect(compareAnchor(anchor, chain).status).toBe('MISMATCH');
  });

  it('does not pass an uncommitted index even if Fabric already has the anchor', () => {
    const { anchor, chain } = fixture();
    anchor.status = 'QUEUED';
    expect(compareAnchor(anchor, chain).status).toBe('PENDING');
  });

  it.each([false, true])(
    'keeps pending revocations separate from confirmed reconciliation (%s)',
    (isRevoked) => {
      const { anchor, chain } = fixture();
      anchor.version.diploma.status = 'REVOKED';
      anchor.version.anchors = [
        { eventType: 'REVOKE', status: 'QUEUED' },
      ] as never;
      expect(compareAnchor(anchor, { ...chain, isRevoked }).status).toBe(
        'PENDING',
      );
      expect(
        compareAnchor(anchor, {
          ...chain,
          isRevoked,
          payloadHash: 'b'.repeat(64),
        }).status,
      ).toBe('MISMATCH');
    },
  );

  it('requires revocation index evidence instead of assuming synchronization', () => {
    const { anchor, chain } = fixture();
    anchor.version.diploma.status = 'REVOKED';
    expect(compareAnchor(anchor, { ...chain, isRevoked: true }).status).toBe(
      'INCOMPLETE',
    );
    expect(compareAnchor(anchor, chain).status).toBe('MISMATCH');
  });

  it('compares the correct historical version independently of current revocation', () => {
    const { anchor, chain } = fixture();
    anchor.version.diploma.status = 'REVOKED';
    anchor.version.diploma.currentVersion = 2;
    expect(compareAnchor(anchor, chain).status).toBe('MATCH');
  });

  it('verifies revocation transaction and reason hash', () => {
    const { anchor, chain } = fixture();
    anchor.eventType = 'REVOKE';
    anchor.transactionId = 'revoke-tx';
    anchor.version.diploma.status = 'REVOKED';
    anchor.version.anchors = [
      { eventType: 'REVOKE', status: 'COMMITTED' },
    ] as never;
    anchor.version.outboxEvents = [
      { eventType: 'REVOKE', payload: { reasonHash: 'a'.repeat(64) } },
    ] as never;
    const revoked = {
      ...chain,
      isRevoked: true,
      revokeTxId: 'revoke-tx',
      reasonHash: 'a'.repeat(64),
    };
    expect(compareAnchor(anchor, revoked).status).toBe('MATCH');
    expect(
      compareAnchor(anchor, { ...revoked, reasonHash: 'b'.repeat(64) }).status,
    ).toBe('MISMATCH');
    expect(compareAnchor(anchor, { ...revoked, reasonHash: null }).status).toBe(
      'INCOMPLETE',
    );
  });

  it('keeps legacy hashes compatible without inventing missing transaction evidence', () => {
    const { anchor } = fixture();
    anchor.version.schemaVersion = 'legacy';
    anchor.version.payload = {
      uuid: 'diploma1',
      fullName: 'Nguyễn An',
      gpa: 3.2,
    };
    const hash = legacyHash(anchor.version.payload);
    anchor.version.payloadHash = hash;
    anchor.payloadHash = hash;
    const chain = { uuid: 'diploma1', certHash: hash, isRevoked: false };
    expect(compareAnchor(anchor, chain).status).toBe('INCOMPLETE');
    expect(compareAnchor(anchor, { ...chain, txId: 'issue-tx' }).status).toBe(
      'MATCH',
    );
  });
});

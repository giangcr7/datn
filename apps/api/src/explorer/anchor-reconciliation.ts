import {
  HASH_SCHEMA_VERSION,
  legacyHash,
  payloadHash,
} from '../database/diploma-hash';
import type { AnchorWithRelations } from './anchor-data';

export type ReconciliationStatus =
  | 'MATCH'
  | 'MISMATCH'
  | 'PENDING'
  | 'INCOMPLETE'
  | 'UNAVAILABLE';
export interface ReconciliationCheck {
  key: string;
  label: string;
  matched: boolean | null;
}

export interface AnchorComparison {
  status: ReconciliationStatus;
  checks: ReconciliationCheck[];
  computedHash: string;
  storedHash: string;
  chainHash: string | null;
  chainTransactionId: string | null;
}

export function compareAnchor(
  anchor: AnchorWithRelations,
  chain: Record<string, unknown>,
): AnchorComparison {
  const version = anchor.version;
  const modern = version.schemaVersion === HASH_SCHEMA_VERSION;
  const computedHash = modern
    ? payloadHash(version.payload)
    : legacyHash(version.payload as Record<string, unknown>);
  const chainHash = modern ? chain.payloadHash : chain.certHash;
  const chainTransactionId = modern
    ? anchor.eventType === 'REVOKE'
      ? chain.revokeTxId
      : chain.issueTxId
    : anchor.eventType === 'REVOKE'
      ? chain.revokeTxId
      : chain.txId;
  const revocation = version.anchors.find(
    (item) => item.eventType === 'REVOKE',
  );
  const expectedRevoked =
    !!revocation ||
    (version.diploma.status === 'REVOKED' &&
      version.diploma.currentVersion === version.version);
  const pendingRevocation = !!revocation && revocation.status !== 'COMMITTED';
  const checks: ReconciliationCheck[] = [
    {
      key: 'snapshot',
      label: 'Dữ liệu lưu trữ khớp mã kiểm tra của giao dịch',
      matched:
        computedHash === version.payloadHash &&
        computedHash === anchor.payloadHash,
    },
    {
      key: 'identity',
      label: modern ? 'Đúng văn bằng và phiên bản' : 'Đúng văn bằng lịch sử',
      matched:
        typeof chain.uuid === 'string' &&
        (!modern || typeof chain.version === 'number')
          ? chain.uuid === version.diplomaId &&
            (!modern || chain.version === version.version)
          : null,
    },
    {
      key: 'hash',
      label: 'Dữ liệu khớp blockchain',
      matched:
        typeof chainHash === 'string' ? computedHash === chainHash : null,
    },
    {
      key: 'issuer',
      label: 'Đúng đơn vị phát hành',
      matched:
        modern &&
        anchor.issuerMspId &&
        typeof chain.issuerMspId === 'string' &&
        typeof chain.schemaVersion === 'string'
          ? chain.issuerMspId === anchor.issuerMspId &&
            chain.schemaVersion === version.schemaVersion
          : null,
    },
    {
      key: 'transaction',
      label: 'Đúng mã giao dịch đã ghi nhận',
      matched:
        anchor.transactionId && typeof chainTransactionId === 'string'
          ? anchor.transactionId === chainTransactionId
          : null,
    },
    {
      key: 'revocation',
      label: 'Trạng thái thu hồi khớp blockchain',
      matched:
        typeof chain.isRevoked === 'boolean'
          ? expectedRevoked === chain.isRevoked
          : null,
    },
  ];
  if (!modern)
    checks.splice(
      checks.findIndex((check) => check.key === 'issuer'),
      1,
    );
  if (modern && expectedRevoked)
    checks.push({
      key: 'revocationIndex',
      label: 'Có giao dịch thu hồi đã xác nhận trong hệ thống',
      matched: revocation?.status === 'COMMITTED' ? true : null,
    });
  if (anchor.eventType === 'REVOKE') {
    const event = version.outboxEvents.find(
      (item) => item.eventType === 'REVOKE',
    );
    const reasonHash = (event?.payload as Record<string, unknown> | undefined)
      ?.reasonHash;
    checks.push({
      key: 'reason',
      label: 'Căn cứ thu hồi khớp blockchain',
      matched:
        typeof reasonHash === 'string' && typeof chain.reasonHash === 'string'
          ? reasonHash === chain.reasonHash
          : null,
    });
  }
  const mismatches = checks.filter(
    (check) =>
      check.matched === false &&
      !(check.key === 'revocation' && pendingRevocation),
  );
  let status: ReconciliationStatus;
  if (mismatches.length) status = 'MISMATCH';
  else if (anchor.status !== 'COMMITTED' || pendingRevocation)
    status = 'PENDING';
  else if (checks.some((check) => check.matched === null))
    status = 'INCOMPLETE';
  else status = 'MATCH';
  return {
    status,
    checks,
    computedHash,
    storedHash: version.payloadHash,
    chainHash: typeof chainHash === 'string' ? chainHash : null,
    chainTransactionId:
      typeof chainTransactionId === 'string' ? chainTransactionId : null,
  };
}

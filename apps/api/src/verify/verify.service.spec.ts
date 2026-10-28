import { HASH_SCHEMA_VERSION, payloadHash } from '../database/diploma-hash';
import { VerifyService } from './verify.service';

jest.mock('../database/diploma-projection', () => ({
  diplomaInclude: {},
  diplomaProjection: jest.fn(() => ({})),
}));

describe('verification messages', () => {
  function fixture(signingMode = 'demo', valid = true, pkiStatus = 'VALID') {
    const uuid = 'cc420763-b732-4433-be64-b0417d5a3d80';
    const payload = { uuid, signedPdfHash: '1'.repeat(64) };
    const hash = payloadHash(payload);
    const version = {
      id: 'version-1',
      version: 1,
      schemaVersion: HASH_SCHEMA_VERSION,
      payload,
      payloadHash: hash,
      anchors: [
        {
          eventType: 'ISSUE',
          status: 'COMMITTED',
          issuerMspId: 'Org1MSP',
          payloadHash: hash,
          transactionId: 'tx-1',
        },
      ],
    };
    const diploma = {
      id: uuid,
      status: 'ACTIVE',
      workflowStatus: 'APPROVED',
      versions: [version],
      signedDocuments: [{ versionId: version.id }],
    };
    const database = {
      diploma: { findUnique: jest.fn().mockResolvedValue(diploma) },
    };
    const chain = {
      payloadHash: hash,
      issuerMspId: 'Org1MSP',
      isRevoked: false,
    };
    const fabric = {
      execute: jest.fn().mockResolvedValue({ result: chain }),
    };
    const pdfVerification = {
      valid,
      signingMode,
      signedPdfHash: payload.signedPdfHash,
      pkiStatus,
      signatures: [],
    };
    const pdfSignatures = {
      verifyStored: jest.fn().mockResolvedValue(pdfVerification),
    };
    return {
      service: new VerifyService(
        fabric as never,
        database as never,
        pdfSignatures as never,
      ),
      uuid,
      chain,
      pdfVerification,
    };
  }

  it.each([
    ['demo', 'VERIFIED_DEMO'],
    ['certificate', 'VERIFIED'],
  ])(
    'uses neutral success wording for %s without changing its status',
    async (signingMode, verificationStatus) => {
      const test = fixture(signingMode);

      const result = await test.service.verify({ uuid: test.uuid });

      expect(result.isValid).toBe(true);
      expect(result.verificationStatus).toBe(verificationStatus);
      expect(result.message).toBe(
        'Chữ ký số và hash PDF khớp blockchain. Đã xác minh chuỗi CA, dấu thời gian TSA và trạng thái OCSP/CRL.',
      );
      expect(result.message).not.toMatch(/demo|thử nghiệm/i);
      expect(result.details?.pdfVerification).toEqual(test.pdfVerification);
    },
  );

  it.each([
    ['UNAVAILABLE', 'PKI_UNAVAILABLE'],
    ['REVOKED', 'CERTIFICATE_REVOKED'],
    ['STALE', 'PKI_EVIDENCE_STALE'],
  ])('keeps %s PKI results invalid', async (pkiStatus, verificationStatus) => {
    const test = fixture('demo', false, pkiStatus);

    const result = await test.service.verify({ uuid: test.uuid });

    expect(result.isValid).toBe(false);
    expect(result.verificationStatus).toBe(verificationStatus);
    expect(result.message).not.toContain('Chữ ký số và hash PDF khớp');
  });

  it('does not report a successful match when the blockchain hash differs', async () => {
    const test = fixture();
    test.chain.payloadHash = '2'.repeat(64);

    const result = await test.service.verify({ uuid: test.uuid });

    expect(result.isValid).toBe(false);
    expect(result.verificationStatus).toBe('HASH_MISMATCH');
    expect(result.message).not.toContain('Chữ ký số và hash PDF khớp');
  });

  it('does not claim PKI checks for a legacy signature policy', async () => {
    const test = fixture('demo', true, 'NOT_CHECKED');

    const result = await test.service.verify({ uuid: test.uuid });

    expect(result.isValid).toBe(true);
    expect(result.message).toBe(
      'Chữ ký số và hash PDF khớp blockchain. Hồ sơ cũ chưa có TSA và kiểm tra thu hồi chứng thư.',
    );
  });
});

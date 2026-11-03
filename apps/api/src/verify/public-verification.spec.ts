import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { publicVerification } from './public-verification';
import { VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';

function fixture() {
  return {
    success: true,
    isValid: true,
    verificationStatus: 'VERIFIED',
    message: 'Internal verification message',
    details: {
      studentName: 'Public fixture',
      major: 'Fixture program',
      grade: 'Khá',
      issueDate: '2026-01-01',
      degreeType: 'BACHELOR',
      soVaoSo: 'FIXTURE/1',
      soHieu: 'FIXTURE-1',
      namTotNghiep: 2026,
      printedDiploma: {
        issuePlace: 'TP. Hồ Chí Minh',
        diplomaSignerName: 'Internal signer',
        arbitrary: 'private',
      },
      mssv: 'PRIVATE-CODE',
      dob: '2000-01-01',
      gpa: 3.75,
      dbHash: 'private-hash',
      signedPdfHash: 'private-pdf-hash',
      revokedReason: 'private-reason',
      txId: 'private-tx',
      pdfVerification: { signatures: ['internal-evidence'] },
    },
  };
}

describe('public verification allowlist', () => {
  it('returns only approved public fields and does not mutate internal evidence', () => {
    const internal = fixture();
    const publicResult = publicVerification(internal);
    expect(Object.keys(publicResult.details!).sort()).toEqual(
      [
        'studentName',
        'major',
        'grade',
        'issueDate',
        'degreeType',
        'soVaoSo',
        'soHieu',
        'namTotNghiep',
        'printedDiploma',
      ].sort(),
    );
    expect(publicResult.details?.printedDiploma).toEqual({
      issuePlace: 'TP. Hồ Chí Minh',
    });
    expect(JSON.stringify(publicResult)).not.toMatch(
      /PRIVATE-CODE|private-|internal-evidence|Internal signer/,
    );
    expect(internal.details.signedPdfHash).toBe('private-pdf-hash');
  });
  it.each([
    'HASH_MISMATCH',
    'REVOKED',
    'PKI_UNAVAILABLE',
    'PDF_SIGNATURE_INVALID',
    'REPLACEMENT_PENDING',
  ])('does not return personal data for %s', (status) => {
    const result = publicVerification({
      ...fixture(),
      isValid: false,
      verificationStatus: status,
    });
    expect(result.details).toBeUndefined();
    expect(result.fileVerification).toBeUndefined();
  });
  it('preserves only the public replacement link for a committed supersession', () => {
    const replacementUuid = 'cc420763-b732-4433-be64-b0417d5a3d80';
    const internal = fixture();
    const result = publicVerification({
      ...internal,
      isValid: false,
      verificationStatus: 'SUPERSEDED',
      details: { ...internal.details, replacementUuid },
    });
    expect(result.details).toEqual({ replacementUuid });
  });
  it('does not let untyped objects escape through a public field', () => {
    const result = publicVerification({
      ...fixture(),
      details: { studentName: { private: 'secret' }, gpa: 3.75 },
    });
    expect(result.details).toEqual({});
  });
  it('preserves exact PDF match status only on a valid result', () => {
    expect(
      publicVerification({
        ...fixture(),
        fileVerification: 'EXACT_SIGNED_FILE_MATCH',
      }).fileVerification,
    ).toBe('EXACT_SIGNED_FILE_MATCH');
    expect(
      publicVerification({
        ...fixture(),
        isValid: false,
        fileVerification: 'EXACT_SIGNED_FILE_MATCH',
      }).fileVerification,
    ).toBeUndefined();
  });
});

describe('HTTP public verification privacy', () => {
  let app: INestApplication<Server>;
  const service = { verify: jest.fn(), verifyPdf: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VerifyController],
      providers: [{ provide: VerifyService, useValue: service }],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('sanitizes JSON verification even when the internal service returns full evidence', async () => {
    service.verify.mockResolvedValue(fixture());
    const response = await request(app.getHttpServer())
      .post('/api/verify')
      .send({ uuid: 'fixture' })
      .expect(201);
    const body = response.body as ReturnType<typeof publicVerification>;
    expect(body.details).toHaveProperty('studentName');
    expect(JSON.stringify(response.body)).not.toMatch(
      /PRIVATE-CODE|private-|internal-evidence/,
    );
  });
  it('sanitizes PDF verification without removing exact-file match confirmation', async () => {
    service.verifyPdf.mockResolvedValue({
      ...fixture(),
      fileVerification: 'EXACT_SIGNED_FILE_MATCH',
    });
    const response = await request(app.getHttpServer())
      .post('/api/verify/pdf')
      .attach('file', Buffer.from('%PDF-fixture'), 'fixture.pdf')
      .expect(201);
    const body = response.body as ReturnType<typeof publicVerification>;
    expect(body.fileVerification).toBe('EXACT_SIGNED_FILE_MATCH');
    expect(JSON.stringify(response.body)).not.toMatch(
      /PRIVATE-CODE|private-|internal-evidence/,
    );
  });
});
import type { Server } from 'node:http';

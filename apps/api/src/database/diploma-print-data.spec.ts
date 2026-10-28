import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CertService } from '../cert/cert.service';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from './database.service';
import {
  DIPLOMA_PRINT_TEMPLATE,
  CLASSIFICATION_ENGLISH,
  DEGREE_TITLES,
  diplomaPrintWarnings,
  latinName,
} from './diploma-print-data';
import { diplomaPayload, payloadHash } from './diploma-hash';
import {
  diplomaProjection,
  type DiplomaWithRelations,
} from './diploma-projection';
import { diplomaDate } from '../signatures/diploma-pdf-template';
import { reviewedDiplomaErrors } from '../cert/reviewed-diploma';

const actor = {
  id: randomUUID(),
  email: 'branch@example.test',
  role: 'university',
  institutionId: randomUUID(),
  campusId: randomUUID(),
  org: 'ORG2',
  isHeadquarters: true,
  canApproveDiplomas: true,
} as AuthActor;
function record() {
  return {
    id: randomUUID(),
    institutionId: actor.institutionId,
    campusId: actor.campusId,
    graduationId: randomUUID(),
    currentVersion: 1,
    institution: {
      name: 'Trường Đại học Thủy lợi',
      nameEn: 'Thuyloi University',
    },
    campus: { code: 'ORG2', name: 'HCM' },
    issuedOn: new Date('2026-09-27T00:00:00Z'),
    status: 'DRAFT',
    workflowStatus: 'DRAFT',
    certificateNo: 'TLU 03.008435.2026',
    registryNo: '4562.3280.S25-64CNTT.2026',
    printTemplate: DIPLOMA_PRINT_TEMPLATE,
    fullNameLatin: null,
    majorNameEn: null,
    issuePlace: 'Hà Nội',
    diplomaSignerName: 'Người ký bằng',
    diplomaSignerTitle: 'HIỆU TRƯỞNG',
    signedDocuments: [],
    versions: [],
    graduation: {
      student: {
        studentCode: '0012345678',
        fullName: 'Dương Hữu Tín',
        dateOfBirth: new Date('2004-06-13T00:00:00Z'),
      },
      program: {
        name: 'Công nghệ thông tin',
        nameEn: 'Information Technology',
      },
      programId: randomUUID(),
      graduationYear: 2026,
      classification: 'VERY_GOOD',
      degreeType: 'BACHELOR',
      gpa: null,
      gpaScale: 4,
      sourceRow: null,
      decision: { signerName: 'Người ký quyết định' },
      enrollment: null,
    },
  } as unknown as DiplomaWithRelations;
}
function setup(diploma = record()) {
  const transaction = {
    $queryRaw: jest.fn(),
    diploma: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(diploma)
        .mockResolvedValue(null),
      update: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ ...diploma, ...data })),
    },
    graduationRecord: { update: jest.fn() },
    diplomaEvent: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const database = {
    $transaction: jest
      .fn()
      .mockImplementation(async (callback) => callback(transaction)),
  };
  return {
    transaction,
    database,
    service: new CertService(database as unknown as DatabaseService),
    diploma,
  };
}

describe('Real diploma fields and print data', () => {
  it('maps the specimen classification and keeps degree type independent of major', () => {
    expect(CLASSIFICATION_ENGLISH['Giỏi']).toBe('Very good');
    expect(DEGREE_TITLES.BACHELOR.vi).toBe('BẰNG CỬ NHÂN');
    expect(DEGREE_TITLES.ENGINEER.vi).toBe('BẰNG KỸ SƯ');
    expect(latinName('  Dương   Hữu Tín ')).toBe('Duong Huu Tin');
    expect(latinName('Đặng Thị Ánh')).toBe('Dang Thi Anh');
  });
  it('formats the specimen birthday independently in both languages', () => {
    expect(diplomaDate('2004-06-13')).toBe('13/06/2004');
    expect(diplomaDate('2004-06-13', true)).toBe('June 13, 2004');
    expect(diplomaDate('2026-02-31')).toBe('-');
    expect(diplomaDate(null, true)).toBe('-');
  });
  it('never uses the graduation decision signer as the diploma signer', () => {
    const payload = diplomaPayload(record());
    expect(payload.printedDiploma?.diplomaSignerName).toBe('Người ký bằng');
    expect(payload.signerName).toBe('Người ký quyết định');
    expect(payload.printedDiploma?.fullNameLatin).toBe('Duong Huu Tin');
    expect(payload.printedDiploma?.majorNameEn).toBe('Information Technology');
    expect(diplomaProjection(record()).printWarnings).toEqual([]);
  });
  it('cryptographically binds printable fields rather than reading mutable settings at print time', () => {
    const diploma = record();
    const originalHash = payloadHash(diplomaPayload(diploma));
    diploma.diplomaSignerName = 'Different printed signer';
    expect(payloadHash(diplomaPayload(diploma))).not.toBe(originalHash);
  });
  it('retains dated legacy payload shape without adding a template retroactively', () => {
    const diploma = record();
    diploma.printTemplate = null;
    expect(diplomaPayload(diploma)).not.toHaveProperty('printedDiploma');
  });
  it('does not manufacture missing degree, English major, issue place or signer', () => {
    const missing = diplomaPrintWarnings(null, null);
    expect(missing).toHaveLength(7);
    const diploma = record();
    diploma.graduation.degreeType = null;
    diploma.diplomaSignerName = null;
    expect(diplomaPayload(diploma).printedDiploma).toMatchObject({
      degreeType: null,
      diplomaSignerName: null,
    });
  });
  it('does not confuse new issuance with digitization just because graduation came from import', () => {
    const diploma = record();
    diploma.originType = 'ISSUANCE';
    diploma.issuedOn = null;
    diploma.graduation.sourceRow = {
      id: randomUUID(),
      batchId: randomUUID(),
      sheetName: '2024',
      rowNumber: 12,
      batch: {
        document: { fileName: 'registry.xlsx', sha256: 'a'.repeat(64) },
      },
      status: 'IMPORTED',
      normalizedData: { issuedOn: null },
      overrides: null,
    } as never;
    expect(diplomaProjection(diploma).requestType).toBe('ISSUANCE');
    expect(diplomaProjection(diploma).issueDateStatus).toBe('UNCONFIRMED');
    expect(reviewedDiplomaErrors(diploma)).toContain(
      'Cần xác nhận ngày cấp trước khi gửi yêu cầu',
    );
  });
  it('updates draft-only print data with a note and separate audit trail', async () => {
    const { service, transaction, diploma } = setup();
    await expect(
      service.updatePrintData(
        diploma.id,
        {
          issuePlace: ' Hà Nội ',
          degreeType: 'BACHELOR',
          note: 'Đối chiếu bản gốc',
        },
        actor,
      ),
    ).resolves.toMatchObject({ success: true });
    expect(transaction.diploma.findFirst.mock.calls[0][0].where).toMatchObject({
      campusId: actor.campusId,
      institutionId: actor.institutionId,
      workflowStatus: 'DRAFT',
      status: 'DRAFT',
    });
    expect(transaction.diploma.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { issuePlace: 'Hà Nội', printTemplate: DIPLOMA_PRINT_TEMPLATE },
      }),
    );
    expect(transaction.graduationRecord.update).toHaveBeenCalledWith({
      where: { id: diploma.graduationId },
      data: { degreeType: 'BACHELOR' },
    });
    expect(transaction.diplomaEvent.create).toHaveBeenCalled();
    expect(transaction.auditLog.create).toHaveBeenCalled();
  });
  it('confirms an issue date without changing the source row and records its previous value', async () => {
    const { service, transaction, diploma } = setup();
    diploma.issuedOn = null;
    await service.updatePrintData(
      diploma.id,
      {
        issueDate: '2026-09-27',
        note: 'School confirmed date',
      },
      actor,
    );
    expect(transaction.diploma.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          issuedOn: new Date('2026-09-27'),
          printTemplate: DIPLOMA_PRINT_TEMPLATE,
        },
      }),
    );
    expect(transaction.diplomaEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            issueDate: '2026-09-27',
            previousIssueDate: null,
          }),
        }),
      }),
    );
    expect(transaction.graduationRecord.update).not.toHaveBeenCalled();
  });
  it.each(['2026-02-31', '2099-01-01', '', '2000-01-01', '2025-12-31'])(
    'refuses invalid or inconsistent confirmed dates: %s',
    async (issueDate) => {
      const { service, transaction, diploma } = setup();
      await expect(
        service.updatePrintData(
          diploma.id,
          {
            issueDate,
            note: 'School confirmed date',
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction.diploma.update).not.toHaveBeenCalled();
    },
  );
  it('refuses editing a signed draft', async () => {
    const fixture = record();
    fixture.signedDocuments = [{ id: randomUUID() }] as never;
    const { service, transaction } = setup(fixture);
    await expect(
      service.updatePrintData(
        fixture.id,
        { issuePlace: 'Hà Nội', note: 'Test' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.diploma.update).not.toHaveBeenCalled();
  });
  it('refuses changing a degree used in a signed sibling diploma', async () => {
    const { service, transaction, diploma } = setup();
    transaction.diploma.findFirst.mockResolvedValueOnce({
      id: 'signed-sibling',
    } as never);
    await expect(
      service.updatePrintData(
        diploma.id,
        { degreeType: 'ENGINEER', note: 'Test' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.graduationRecord.update).not.toHaveBeenCalled();
  });
  it('requires an actual change and source note', async () => {
    const { service, database, diploma } = setup();
    await expect(
      service.updatePrintData(diploma.id, { note: ' ' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updatePrintData(diploma.id, { note: 'Test' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
  it('does not give unprivileged staff or administrators editing authority', async () => {
    const { service, database, diploma } = setup();
    await expect(
      service.updatePrintData(
        diploma.id,
        { issuePlace: 'Hà Nội', note: 'Test' },
        { ...actor, isHeadquarters: true, canApproveDiplomas: false },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.updatePrintData(
        diploma.id,
        { issuePlace: 'Hà Nội', note: 'Test' },
        { ...actor, role: 'admin' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});

import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import type { CertService } from './cert.service';
import { ReplacementService } from './replacement.service';
import { CreateReplacementDto, ReplacementQueryDto } from './replacement.dto';
import {
  diplomaProjection,
  type DiplomaWithRelations,
} from '../database/diploma-projection';
import { diplomaPayload } from '../database/diploma-hash';
import { jsonData } from '../database/data-utils';
import { replacementErrors } from './replacement-state';

const actor = {
  id: randomUUID(),
  institutionId: randomUUID(),
  campusId: randomUUID(),
  role: 'university',
  isHeadquarters: true,
  canApproveDiplomas: true,
} as AuthActor;
const body = {
  note: 'Đối chiếu',
  expectedUpdatedAt: new Date().toISOString(),
  basis: 'Quyết định 01',
  soHieu: '000NEW',
  soVaoSo: '000VS',
  issueDate: '2026-10-01',
};
function draft() {
  return {
    id: randomUUID(),
    supersedesId: randomUUID(),
    currentVersion: 1,
    status: 'DRAFT',
    workflowStatus: 'DRAFT',
    certificateNo: '000NEW',
    registryNo: '000NEWS',
    issuedOn: new Date('2026-10-01'),
    printTemplate: 'tlu-bilingual-v1',
    majorNameEn: 'Information Technology',
    issuePlace: 'TP. Hồ Chí Minh',
    diplomaSignerName: 'Cán bộ',
    diplomaSignerTitle: 'HIỆU TRƯỞNG',
    institution: { name: 'Trường', nameEn: 'University' },
    campus: { name: 'Cơ sở chính' },
    versions: [],
    signedDocuments: [],
    graduation: {
      student: {
        studentCode: '001',
        fullName: 'Tên nguồn',
        dateOfBirth: new Date('2000-01-01'),
      },
      program: { name: 'Ngành nguồn', nameEn: 'Old major' },
      programId: actor.id,
      gpa: 2.5,
      gpaScale: 4,
      classification: 'GOOD',
      degreeType: 'ENGINEER',
      graduationYear: 2024,
    },
    replacementData: {
      previousUuid: actor.id,
      previousVersion: 1,
      previousPayloadHash: 'a'.repeat(64),
      reason: 'Sửa tên',
      basis: 'Quyết định',
      mssv: '001',
      decisionNo: null,
      decisionDate: null,
      signerName: null,
      fullName: 'Tên đúng',
      dob: '2000-02-02',
      programId: actor.id,
      major: 'Ngành đúng',
      gpa: 3.7,
      gpaScale: 4,
      grade: 'Giỏi',
      degreeType: 'BACHELOR',
      className: null,
      namTotNghiep: 2024,
    },
  } as unknown as DiplomaWithRelations;
}

describe('replacement diploma safeguards', () => {
  it.each([
    { role: 'admin' },
    { role: 'student' },
    { isHeadquarters: false },
    { canApproveDiplomas: false },
    { campusId: undefined },
    { institutionId: undefined },
  ])('denies all mutations and listing before access for %p', async (flags) => {
    const transaction = jest.fn();
    const service = new ReplacementService(
      { $transaction: transaction } as unknown as DatabaseService,
      {} as CertService,
    );
    const unauthorized = { ...actor, ...flags } as AuthActor;
    await expect(
      service.list(new ReplacementQueryDto(), unauthorized),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create(actor.id, body, unauthorized),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.transition(actor.id, body, unauthorized, 'submit'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(() => service.approve(actor.id, body, unauthorized)).toThrow(
      ForbiddenException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });
  it('uses isolated correction data without mutating shared source relations', () => {
    const record = draft();
    const before = JSON.stringify(record.graduation);
    const view = diplomaProjection(record);
    expect(view.fullName).toBe('Tên đúng');
    expect(view.dob).toBe('2000-02-02');
    expect(view.gpa).toBe(3.7);
    expect(view.printedDiploma?.degreeType).toBe('BACHELOR');
    expect(view.printedDiploma?.fullNameLatin).toBe('Ten dung');
    expect(JSON.stringify(record.graduation)).toBe(before);
    expect(replacementErrors(record)).toEqual([]);
  });
  it('hashes the corrected identity, degree and immutable predecessor reference', () => {
    const payload = diplomaPayload(draft());
    expect(payload.fullName).toBe('Tên đúng');
    expect(payload.degreeType).toBe('BACHELOR');
    expect(payload.replacement?.payloadHash).toBe('a'.repeat(64));
  });
  it('does not apply replacement overrides to an ordinary diploma', () => {
    const record = draft();
    record.supersedesId = null;
    expect(diplomaProjection(record).fullName).toBe('Tên nguồn');
  });
  it('validates the corrected effective data rather than the shared source', () => {
    const record = draft();
    record.replacementData = jsonData({
      ...(record.replacementData as object),
      gpa: 9,
      dob: '2099-01-01',
      grade: '',
    });
    expect(replacementErrors(record).length).toBeGreaterThanOrEqual(3);
  });
  it('validates request identity, dates and bounded paging', async () => {
    expect(
      await validate(plainToInstance(CreateReplacementDto, body)),
    ).toHaveLength(0);
    for (const invalid of [
      { issueDate: '2026-02-31' },
      { expectedUpdatedAt: 'bad' },
      { basis: '' },
    ])
      expect(
        (
          await validate(
            plainToInstance(CreateReplacementDto, { ...body, ...invalid }),
          )
        ).length,
      ).toBeGreaterThan(0);
    for (const invalid of [{ page: 0 }, { limit: 101 }, { stage: 'ACTIVE' }])
      expect(
        (await validate(plainToInstance(ReplacementQueryDto, invalid))).length,
      ).toBeGreaterThan(0);
  });
});

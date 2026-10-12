import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CertService } from './cert.service';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';

const actor = {
  id: 'staff1',
  role: 'university',
  institutionId: 'institution1',
  campusId: 'campus1',
  org: 'ORG2',
} as AuthActor;

describe('certificate safety rules', () => {
  it('rejects any document read for an employer membership', async () => {
    const findMany = jest.fn();
    const service = new CertService({
      diploma: { findMany },
    } as unknown as DatabaseService);
    await expect(
      service.findAll({ ...actor, role: 'employer' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('keeps anonymous name/MSSV directory closed by default', async () => {
    const previous = process.env.PUBLIC_DIRECTORY_ENABLED;
    delete process.env.PUBLIC_DIRECTORY_ENABLED;
    try {
      const service = new CertService({} as DatabaseService);
      await expect(service.search('student')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_DIRECTORY_ENABLED;
      else process.env.PUBLIC_DIRECTORY_ENABLED = previous;
    }
  });
  it('does not fill a missing issue date with today', async () => {
    const transaction = jest.fn();
    const database = {
      campus: {
        findFirst: jest.fn().mockResolvedValue({ id: actor.campusId }),
      },
      programAlias: {
        findUnique: jest.fn().mockResolvedValue({ programId: 'program1' }),
      },
      student: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: transaction,
    } as unknown as DatabaseService;
    const service = new CertService(database);
    await expect(
      service.requestCert(
        {
          mssv: '0012345678',
          fullName: 'Nguyen An',
          major: 'Program',
          grade: 'GOOD',
          namTotNghiep: 2025,
          gpa: null,
          soHieu: 'CERT1',
          soVaoSo: 'REG1',
          dob: '2001-01-01',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
});

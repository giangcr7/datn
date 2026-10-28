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
  isHeadquarters: true,
  canApproveDiplomas: true,
} as AuthActor;

describe('certificate safety rules', () => {
  it.each(['university', 'student'])(
    'requires committed issuance and preserves actor scope in the issued list for %s',
    async (role) => {
      const database = {
        diploma: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new CertService(database as unknown as DatabaseService);
      const reader = { ...actor, role, studentId: 'student1' } as AuthActor;
      await service.findAllPaginated(2, 20, 'CERT', reader, role !== 'student');
      const query = database.diploma.findMany.mock.calls[0][0];
      expect(query).toMatchObject({
        skip: 20,
        take: 20,
        where: {
          AND: expect.arrayContaining([
            expect.objectContaining({ institutionId: actor.institutionId }),
            {
              workflowStatus: 'APPROVED',
              versions: {
                some: {
                  anchors: {
                    some: { eventType: 'ISSUE', status: 'COMMITTED' },
                  },
                },
              },
            },
          ]),
        },
      });
      expect(database.diploma.count).toHaveBeenCalledWith({
        where: query.where,
      });
      if (role === 'student')
        expect(JSON.stringify(query.where)).toContain('student1');
      else expect(JSON.stringify(query.where)).toContain(actor.institutionId);
      expect(JSON.stringify(query.where)).toContain('CERT');
    },
  );
  it('does not expose unissued drafts through the student MSSV lookup', async () => {
    const database = { diploma: { findMany: jest.fn().mockResolvedValue([]) } };
    await new CertService(database as unknown as DatabaseService).findByMssv(
      '0012345678',
      {
        ...actor,
        role: 'student',
        studentId: 'student1',
      },
    );
    expect(database.diploma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            expect.objectContaining({
              workflowStatus: 'APPROVED',
              versions: {
                some: {
                  anchors: {
                    some: { eventType: 'ISSUE', status: 'COMMITTED' },
                  },
                },
              },
            }),
          ]),
        },
      }),
    );
  });
  it('allows one authorized officer to approve and reject their own local request', async () => {
    const transaction = {
      campus: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: actor.campusId, fabricMspId: 'Org1MSP' }),
      },
      $queryRaw: jest.fn(),
      diploma: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'diploma1',
          workflowStatus: 'REQUESTED',
          status: 'DRAFT',
          requestedById: actor.id,
          issuedOn: new Date('2024-06-01'),
          graduation: {
            classification: 'GOOD',
            graduationYear: 2024,
            student: { dateOfBirth: new Date('2002-01-01') },
          },
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      diplomaVersion: {
        create: jest.fn().mockResolvedValue({ id: 'version1', version: 1 }),
      },
      blockchainAnchor: { create: jest.fn() },
      outboxEvent: { create: jest.fn() },
      diplomaEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const signatures = {
      prepareFinal: jest
        .fn()
        .mockResolvedValue({ payload: { uuid: 'diploma1' } }),
      attachVersion: jest.fn(),
    };
    const service = new CertService(
      {
        $transaction: (callback: any) => callback(transaction),
      } as unknown as DatabaseService,
      signatures as never,
    );
    await expect(service.approveCert('diploma1', actor)).resolves.toMatchObject(
      { status: 'ANCHOR_PENDING' },
    );
    expect(transaction.diploma.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvedById: actor.id,
          issuingCampusId: actor.campusId,
        }),
      }),
    );
    expect(signatures.prepareFinal).toHaveBeenCalledTimes(1);
    await expect(
      service.rejectCert('diploma1', 'Correction required', actor),
    ).resolves.toMatchObject({ success: true });
  });
  it.each([
    { ...actor, role: 'admin', isHeadquarters: true, canApproveDiplomas: true },
    { ...actor, isHeadquarters: false, canApproveDiplomas: true },
    { ...actor, isHeadquarters: true, canApproveDiplomas: false },
  ])('blocks unauthorized business approval for %j', async (unauthorized) => {
    const transaction = jest.fn();
    const service = new CertService({
      $transaction: transaction,
    } as unknown as DatabaseService);
    await expect(
      service.approveCert('diploma1', unauthorized as AuthActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.rejectCert('diploma1', 'Invalid data', unauthorized as AuthActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.revoke('diploma1', 'Invalid data', unauthorized as AuthActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('lets authorized headquarters read across campuses but not institutions', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new CertService({
      diploma: { findMany, count: jest.fn().mockResolvedValue(0) },
    } as unknown as DatabaseService);
    await service.findPending({
      ...actor,
      isHeadquarters: true,
      canApproveDiplomas: true,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          institutionId: actor.institutionId,
          workflowStatus: 'REQUESTED',
        },
      }),
    );
  });
  it('keeps branch read access campus-scoped', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new CertService({
      diploma: { findMany, count: jest.fn().mockResolvedValue(0) },
    } as unknown as DatabaseService);
    await service.findPending({
      ...actor,
      isHeadquarters: false,
      canApproveDiplomas: false,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          institutionId: actor.institutionId,
          campusId: actor.campusId,
          workflowStatus: 'REQUESTED',
        },
      }),
    );
  });
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
      student: { findUnique: jest.fn().mockResolvedValue({ id: 'student1' }) },
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

  it.each(['2000-01-01', '2024-12-31', '2099-01-01'])(
    'rejects an issue date outside the confirmed academic timeline: %s',
    async (issueDate) => {
      const transaction = jest.fn();
      const database = {
        campus: {
          findFirst: jest.fn().mockResolvedValue({ id: actor.campusId }),
        },
        programAlias: {
          findUnique: jest.fn().mockResolvedValue({ programId: 'program1' }),
        },
        student: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'student1',
            dateOfBirth: new Date('2002-01-01T00:00:00.000Z'),
          }),
        },
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
            dob: '2002-01-01',
            issueDate,
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects a certificate request for an unknown student', async () => {
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
          issueDate: '2025-06-01',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(['2000-01-01', '2024-12-31'])(
    'does not allow an imported draft to bypass date checks: %s',
    async (issueDate) => {
      const updateMany = jest.fn();
      const transaction = {
        $queryRaw: jest.fn(),
        diploma: {
          findFirst: jest.fn().mockResolvedValue({
            graduation: {
              graduationYear: 2025,
              student: { dateOfBirth: new Date('2002-01-01') },
            },
          }),
          updateMany,
        },
      };
      const service = new CertService({
        $transaction: (callback: any) => callback(transaction),
      } as unknown as DatabaseService);
      await expect(
        service.submitDraft('draft1', issueDate, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(updateMany).not.toHaveBeenCalled();
    },
  );
});

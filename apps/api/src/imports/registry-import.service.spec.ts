import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import ExcelJS from 'exceljs';
import { CommitRegistryDto } from '../common/dto/registry-import.dto';
import * as academicWriter from '../database/academic-record-writer';
import { RegistryImportService } from './registry-import.service';
import { DatabaseService } from '../database/database.service';
import { DocumentStorageService } from '../storage/document-storage.service';
import { AuthActor } from '../auth/auth-actor';

describe('Registry import origin and issuance state', () => {
  const maker = {
    id: 'maker-1',
    role: 'university',
    isHeadquarters: true,
    canApproveDiplomas: true,
    institutionId: 'institution-1',
    campusId: 'campus-hcm',
  } as AuthActor;
  afterEach(() => jest.restoreAllMocks());
  function setup() {
    const row = {
      id: 'row-1',
      sheetName: '2025',
      rowNumber: 2,
      issues: [],
      status: 'READY',
      overrides: null,
      normalizedData: {
        studentCode: '0012345678',
        fullName: 'Test student',
        dateOfBirth: '2002-01-01',
        programId: 'program-1',
        graduationYear: 2024,
        classification: 'GOOD',
        gpa: null,
        gpaScale: 4,
        certificateNo: 'CERT-1',
        registryNo: 'REG-1',
        issuedOn: '2024-06-01',
        degreeType: 'ENGINEER',
        majorNameEn: 'Civil Engineering',
        issuePlace: 'Hà Nội',
        diplomaSignerName: 'Confirmed signer',
        diplomaSignerTitle: 'HIỆU TRƯỞNG',
      },
    };
    const transaction = {
      $queryRaw: jest.fn(),
      importRow: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(row),
        findMany: jest.fn().mockResolvedValue([row]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      validationIssue: {
        create: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      diploma: {
        create: jest.fn().mockResolvedValue({ id: 'diploma-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      diplomaEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      blockchainAnchor: { create: jest.fn() },
      outboxEvent: { create: jest.fn() },
    };
    const database = {
      institution: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ nameEn: 'Fixture University' }),
      },
      importBatch: {
        findFirst: jest.fn().mockResolvedValue({
          institutionId: maker.institutionId,
          campusId: maker.campusId,
        }),
        update: jest.fn(),
      },
      importRow: {
        findMany: jest.fn().mockResolvedValue([row]),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ status: 'IMPORTED', _count: 1 }]),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(transaction)),
    };
    jest
      .spyOn(academicWriter, 'writeAcademicRecord')
      .mockResolvedValue({ id: 'graduation-1' } as never);
    return {
      database,
      transaction,
      row,
      service: new RegistryImportService(
        database as unknown as DatabaseService,
        {} as DocumentStorageService,
      ),
    };
  }
  it.each([undefined, 'ISSUANCE', 'DIGITIZATION'] as const)(
    'creates only an unsigned draft for import mode %s',
    async (originType) => {
      const { service, database, transaction } = setup();
      expect(await service.commit('batch-1', maker, originType)).toMatchObject({
        diplomas: 1,
        conflicts: 0,
      });
      expect(transaction.diploma.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          originType: originType || 'ISSUANCE',
          status: 'DRAFT',
          workflowStatus: 'DRAFT',
          issuedOn: new Date('2024-06-01'),
        }),
      });
      expect(database.importBatch.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'batch-1',
          institutionId: maker.institutionId,
          campusId: maker.campusId,
        },
      });
      expect(transaction.outboxEvent.create).not.toHaveBeenCalled();
      expect(transaction.blockchainAnchor.create).not.toHaveBeenCalled();
    },
  );
  it('revalidates a legacy READY row and blocks a number already stored before writing academic data', async () => {
    const { service, transaction, row } = setup();
    transaction.diploma.findMany.mockResolvedValue([
      {
        id: 'existing',
        campusId: maker.campusId,
        certificateNo: row.normalizedData.certificateNo,
        registryNo: 'OTHER',
        graduation: { sourceRowId: 'other-row' },
      },
    ]);
    expect(await service.commit('batch-1', maker)).toMatchObject({
      imported: 0,
      conflicts: 1,
      diplomas: 0,
    });
    expect(academicWriter.writeAcademicRecord).not.toHaveBeenCalled();
    expect(transaction.diploma.create).not.toHaveBeenCalled();
    expect(transaction.importRow.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [row.id] },
        status: { notIn: ['IMPORTED', 'SKIPPED'] },
      },
      data: { status: 'NEEDS_REVIEW' },
    });
  });
  it('rejects an unknown import mode before reading or changing data', async () => {
    const { service, database } = setup();
    await expect(
      service.commit('batch-1', maker, 'ACTIVE' as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.importBatch.findFirst).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });
  it('defaults to new records and validates the HTTP import choice', async () => {
    const defaultBody = plainToInstance(CommitRegistryDto, {});
    expect(defaultBody.originType).toBe('ISSUANCE');
    expect(await validate(defaultBody)).toEqual([]);
    expect(
      await validate(
        plainToInstance(CommitRegistryDto, { originType: 'ACTIVE' }),
      ),
    ).not.toEqual([]);
  });
});

describe('Registry import batch summaries', () => {
  const maker = {
    role: 'university',
    isHeadquarters: true,
    canApproveDiplomas: true,
    institutionId: 'institution-1',
    campusId: 'campus-hcm',
  } as AuthActor;

  function setup(batches = [{ id: 'batch-1', importedRows: 284 }]) {
    const database = {
      institution: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ nameEn: 'Fixture University' }),
      },
      importBatch: {
        findMany: jest.fn().mockResolvedValue(batches),
        count: jest.fn().mockResolvedValue(batches.length),
      },
      importRow: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([
            { batchId: 'batch-1', status: 'IMPORTED', _count: { _all: 284 } },
            {
              batchId: 'batch-1',
              status: 'NEEDS_REVIEW',
              _count: { _all: 1671 },
            },
          ])
          .mockResolvedValueOnce([
            { batchId: 'batch-1', _count: { _all: 284 } },
          ])
          .mockResolvedValueOnce([]),
      },
    };
    const service = new RegistryImportService(
      database as unknown as DatabaseService,
      {} as DocumentStorageService,
    );
    return { service, database };
  }

  it('distinguishes saved graduation profiles from draft diplomas', async () => {
    const { service, database } = setup();
    const result = await service.list(maker);
    expect(result.data[0].reviewSummary).toEqual({
      readyRows: 0,
      needsReviewRows: 1671,
      importedRows: 284,
      graduationOnlyRows: 284,
      draftRows: 0,
    });
    expect(database.importBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: maker.institutionId, campusId: maker.campusId },
      }),
    );
    expect(database.importRow.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          batchId: { in: ['batch-1'] },
          status: 'IMPORTED',
          graduation: { is: { diplomas: { none: {} } } },
        },
      }),
    );
    expect(database.importRow.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          batchId: { in: ['batch-1'] },
          status: 'IMPORTED',
          graduation: {
            is: {
              diplomas: { some: { status: 'DRAFT', workflowStatus: 'DRAFT' } },
            },
          },
        },
      }),
    );
  });

  it('returns empty batches without running aggregate queries', async () => {
    const { service, database } = setup([]);
    expect(await service.list(maker)).toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    expect(database.importRow.groupBy).not.toHaveBeenCalled();
  });

  it('keeps counts separate for each batch and includes unsent drafts', async () => {
    const { service, database } = setup([
      { id: 'batch-1', importedRows: 2 },
      { id: 'batch-2', importedRows: 1 },
    ]);
    database.importRow.groupBy
      .mockReset()
      .mockResolvedValueOnce([
        { batchId: 'batch-1', status: 'IMPORTED', _count: { _all: 2 } },
        { batchId: 'batch-1', status: 'READY', _count: { _all: 3 } },
        { batchId: 'batch-2', status: 'IMPORTED', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([{ batchId: 'batch-2', _count: { _all: 1 } }])
      .mockResolvedValueOnce([{ batchId: 'batch-1', _count: { _all: 2 } }]);
    const result = await service.list(maker);
    expect(result.data.map((batch) => batch.reviewSummary)).toEqual([
      {
        readyRows: 3,
        needsReviewRows: 0,
        importedRows: 2,
        graduationOnlyRows: 0,
        draftRows: 2,
      },
      {
        readyRows: 0,
        needsReviewRows: 0,
        importedRows: 1,
        graduationOnlyRows: 1,
        draftRows: 0,
      },
    ]);
  });

  it('blocks staff without the approval capability from imports', async () => {
    const { service, database } = setup();
    await expect(
      service.list({
        ...maker,
        isHeadquarters: true,
        canApproveDiplomas: false,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(database.importBatch.findMany).not.toHaveBeenCalled();
  });
});

describe('Registry source print-data recovery', () => {
  const maker = {
    id: 'maker-1',
    email: 'maker@example.test',
    role: 'university',
    isHeadquarters: true,
    canApproveDiplomas: true,
    institutionId: 'institution-1',
    campusId: 'campus-hcm',
  } as AuthActor;
  const complete = {
    studentCode: '0012345678',
    fullName: 'Nguyen An',
    dateOfBirth: '2002-01-01',
    programId: 'program-1',
    programOriginal: 'Kỹ thuật xây dựng',
    graduationYear: 2024,
    classification: 'GOOD',
    gpa: null,
    gpaScale: 4,
    certificateNo: 'CERT1',
    registryNo: 'REG1',
    issuedOn: '2024-06-01',
    degreeType: 'ENGINEER',
    majorNameEn: 'Civil Engineering',
    issuePlace: 'Hà Nội',
    diplomaSignerName: 'Source signer',
    diplomaSignerTitle: 'HIỆU TRƯỞNG',
  };
  async function setup(
    options: {
      imported?: boolean;
      signed?: boolean;
      missingDate?: boolean;
      invalidIdentity?: boolean;
      duplicateSource?: boolean;
    } = {},
  ) {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('2025');
    sheet.addRow([
      'STT',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Loại bằng',
      'Ngày cấp trên bằng',
      'Nơi cấp trên bằng',
      'Người ký trên bằng',
      'Chức danh người ký bằng',
      'Họ tên không dấu',
      'Ngành tiếng Anh',
    ]);
    sheet.addRow([
      1,
      complete.studentCode,
      'Nguyen',
      'An',
      complete.dateOfBirth,
      '',
      'Nam',
      '',
      '',
      'C01',
      '',
      complete.programOriginal,
      'Khá',
      2024,
      'REG1',
      'CERT1',
      '',
      '',
      'Kỹ sư',
      options.missingDate ? '' : complete.issuedOn,
      complete.issuePlace,
      complete.diplomaSignerName,
      complete.diplomaSignerTitle,
      'Nguyen An',
      complete.majorNameEn,
    ]);
    if (options.duplicateSource)
      sheet.addRow((sheet.getRow(2).values as ExcelJS.CellValue[]).slice(1));
    const row = {
      id: 'row-1',
      sheetName: '2025',
      rowNumber: 2,
      status: options.imported ? 'IMPORTED' : 'NEEDS_REVIEW',
      normalizedData: {
        ...complete,
        ...(options.invalidIdentity ? { studentCode: 'unknown' } : {}),
        issuedOn: null,
        degreeType: null,
        majorNameEn: null,
        issuePlace: null,
        diplomaSignerName: null,
        diplomaSignerTitle: null,
      },
      rawData: {},
      overrides: null as Record<string, unknown> | null,
      reviewedAt: null,
      issues: [
        {
          id: 'date-issue',
          field: 'issuedOn',
          code: 'ISSUE_DATE_NOT_IN_SOURCE',
          severity: 'WARNING',
          message: 'Old missing date',
          resolvedAt: null,
        },
      ],
    };
    const diploma = {
      id: 'diploma-1',
      graduationId: 'graduation-1',
      status: 'DRAFT',
      workflowStatus: 'DRAFT',
      issuedOn: null as Date | null,
      fullNameLatin: null,
      majorNameEn: null,
      issuePlace: null,
      diplomaSignerName: null as string | null,
      diplomaSignerTitle: null,
      signedDocuments: options.signed ? [{ id: 'signed' }] : [],
      graduation: { degreeType: null },
    };
    const transaction = {
      $queryRaw: jest.fn(),
      importRow: {
        updateMany: jest.fn().mockImplementation(async ({ data }) => {
          Object.assign(row, data);
          return { count: 1 };
        }),
        findMany: jest
          .fn()
          .mockImplementation(async () => [
            { ...row, issues: row.issues.filter((issue) => !issue.resolvedAt) },
          ]),
        findUniqueOrThrow: jest
          .fn()
          .mockImplementation(async () => ({
            ...row,
            issues: row.issues.filter((issue) => !issue.resolvedAt),
          })),
        update: jest
          .fn()
          .mockImplementation(async ({ data }) => Object.assign(row, data)),
      },
      diploma: {
        findMany: jest
          .fn()
          .mockImplementation(async ({ select }) =>
            select ? [] : options.imported ? [diploma] : [],
          ),
        update: jest
          .fn()
          .mockImplementation(async ({ data }) => Object.assign(diploma, data)),
      },
      graduationRecord: {
        update: jest
          .fn()
          .mockImplementation(async ({ data }) =>
            Object.assign(diploma.graduation, data),
          ),
      },
      validationIssue: {
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          for (const issue of row.issues)
            if (
              (!where.id || where.id.in.includes(issue.id)) &&
              !issue.resolvedAt
            )
              Object.assign(issue, data);
          return { count: 1 };
        }),
        createMany: jest.fn().mockImplementation(async ({ data }) => {
          for (const issue of data)
            row.issues.push({
              ...issue,
              id: 'issue-' + row.issues.length,
              resolvedAt: null,
            });
          return { count: data.length };
        }),
      },
      diplomaEvent: { create: jest.fn() },
    };
    const database = {
      institution: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ nameEn: 'Fixture University' }),
      },
      importBatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'batch-1',
          document: { storageKey: 'source.xlsx', sha256: 'a'.repeat(64) },
        }),
        update: jest.fn(),
      },
      programAlias: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { normalizedName: 'kỹ thuật xây dựng', programId: 'program-1' },
          ]),
      },
      program: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'program-1', nameEn: complete.majorNameEn },
          ]),
      },
      importRow: {
        findMany: jest.fn().mockResolvedValue([{ id: row.id }]),
        count: jest
          .fn()
          .mockImplementation(async ({ where }) =>
            row.status === where.status ? 1 : 0,
          ),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(transaction)),
    };
    const storage = {
      getWorkbook: jest
        .fn()
        .mockResolvedValue(Buffer.from(await wb.xlsx.writeBuffer())),
    };
    return {
      service: new RegistryImportService(
        database as unknown as DatabaseService,
        storage as unknown as DocumentStorageService,
      ),
      row,
      diploma,
      transaction,
      database,
      storage,
    };
  }
  it('re-reads missing print fields from the stored source and makes a complete staging row ready', async () => {
    const { service, row, storage } = await setup();
    expect(await service.recheck('batch-1', maker)).toMatchObject({
      readyRows: 1,
      needsReviewRows: 0,
      repairedDrafts: 0,
    });
    expect(row.status).toBe('READY');
    expect(row.overrides).toMatchObject({
      degreeType: 'ENGINEER',
      issuedOn: '2024-06-01',
      diplomaSignerName: 'Source signer',
    });
    expect(storage.getWorkbook).toHaveBeenCalledWith(
      'source.xlsx',
      'a'.repeat(64),
    );
  });
  it('recovers a missing program mapping after its approved alias is restored', async () => {
    const { service, row, transaction } = await setup();
    row.normalizedData.programId = '';
    row.issues.push({
      id: 'program-issue',
      field: 'programId',
      code: 'UNMAPPED_PROGRAM',
      severity: 'ERROR',
      message: 'Missing approved program mapping',
      resolvedAt: null,
    });
    expect(await service.recheck('batch-1', maker)).toMatchObject({
      readyRows: 1,
      needsReviewRows: 0,
    });
    expect(row.normalizedData.programId).toBe('');
    expect(row.overrides).toMatchObject({ programId: 'program-1' });
    expect(transaction.validationIssue.updateMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(['program-issue']) } },
      data: { resolvedAt: expect.any(Date) },
    });
  });
  it.each([
    { programId: 'confirmed-program', readyRows: 1 },
    { programId: null, readyRows: 0 },
  ])(
    'preserves an explicit program correction of $programId',
    async ({ programId, readyRows }) => {
      const { service, row } = await setup();
      row.normalizedData.programId = '';
      row.overrides = { programId };
      expect(await service.recheck('batch-1', maker)).toMatchObject({
        readyRows,
        needsReviewRows: 1 - readyRows,
      });
      expect(row.overrides).toMatchObject({ programId });
    },
  );
  it('keeps an unknown source program in review without inventing a mapping', async () => {
    const { service, row, database, transaction } = await setup();
    row.normalizedData.programId = '';
    database.programAlias.findMany.mockResolvedValue([]);
    expect(await service.recheck('batch-1', maker)).toMatchObject({
      readyRows: 0,
      needsReviewRows: 1,
    });
    expect(row.overrides).not.toHaveProperty('programId');
    expect(transaction.validationIssue.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          code: 'UNMAPPED_PROGRAM',
          severity: 'ERROR',
        }),
      ]),
    });
  });
  it('does not resurrect duplicate warnings from original workbook values after corrections', async () => {
    const { service, row, transaction } = await setup({
      duplicateSource: true,
    });
    row.overrides = {
      studentCode: '0099999999',
      certificateNo: 'CORRECTED',
      registryNo: 'CORRECTED-REG',
    };
    expect(await service.recheck('batch-1', maker)).toMatchObject({
      readyRows: 1,
      needsReviewRows: 0,
    });
    expect(row.overrides).toMatchObject({ certificateNo: 'CORRECTED' });
    for (const [query] of transaction.validationIssue.createMany.mock.calls)
      expect(query.data).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: expect.stringMatching(
              /^(REPEATED_STUDENT_CODE|DUPLICATE_CERTIFICATE_NO|DUPLICATE_REGISTRY_NO)$/,
            ),
          }),
        ]),
      );
  });
  it('does not mark a source missing its issue date ready', async () => {
    const { service, row, transaction } = await setup({ missingDate: true });
    expect(await service.recheck('batch-1', maker)).toMatchObject({
      readyRows: 0,
      needsReviewRows: 1,
    });
    expect(row.status).toBe('NEEDS_REVIEW');
    expect(transaction.validationIssue.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ field: 'issuedOn', severity: 'ERROR' }),
      ]),
    });
  });
  it('repairs only missing draft values and preserves prior confirmations and source overrides', async () => {
    const { service, row, diploma, transaction } = await setup({
      imported: true,
    });
    row.overrides = { issuedOn: '2024-07-01' };
    diploma.diplomaSignerName = 'Previously confirmed signer';
    expect(await service.recheck('batch-1', maker)).toMatchObject({
      repairedDrafts: 1,
    });
    expect(diploma.issuedOn).toEqual(new Date('2024-07-01'));
    expect(diploma.diplomaSignerName).toBe('Previously confirmed signer');
    expect(row.overrides).toMatchObject({
      issuedOn: '2024-07-01',
      degreeType: 'ENGINEER',
    });
    expect(transaction.diplomaEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'RESTORED_IMPORT_PRINT_DATA',
        }),
      }),
    );
  });
  it('does not repair the same complete draft twice', async () => {
    const { service, transaction } = await setup({ imported: true });
    expect(await service.recheck('batch-1', maker)).toMatchObject({
      repairedDrafts: 1,
    });
    transaction.diploma.update.mockClear();
    transaction.diplomaEvent.create.mockClear();
    expect(await service.recheck('batch-1', maker)).toMatchObject({
      repairedDrafts: 0,
    });
    expect(transaction.diploma.update).not.toHaveBeenCalled();
    expect(transaction.diplomaEvent.create).not.toHaveBeenCalled();
  });
  it('never rewrites a signed draft or its source data', async () => {
    const { service, row, transaction } = await setup({
      imported: true,
      signed: true,
    });
    const original = structuredClone(row);
    expect(await service.recheck('batch-1', maker)).toMatchObject({
      repairedDrafts: 0,
      protectedRows: 1,
    });
    expect(row).toEqual(original);
    expect(transaction.diploma.update).not.toHaveBeenCalled();
    expect(transaction.importRow.update).not.toHaveBeenCalled();
  });
  it('keeps invalid identity in review instead of clearing unrelated blockers', async () => {
    const { service, row } = await setup({ invalidIdentity: true });
    expect(await service.recheck('batch-1', maker)).toMatchObject({
      readyRows: 0,
    });
    expect(row.normalizedData.studentCode).toBe('unknown');
  });
  it('rejects a batch outside the active campus before reading the source', async () => {
    const { service, database, storage } = await setup();
    database.importBatch.findFirst.mockResolvedValue(null);
    await expect(service.recheck('batch-1', maker)).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.getWorkbook).not.toHaveBeenCalled();
  });
  it('aborts without writes if the stored workbook cannot be verified', async () => {
    const { service, database, storage } = await setup();
    storage.getWorkbook.mockRejectedValue(new Error('Checksum mismatch'));
    await expect(service.recheck('batch-1', maker)).rejects.toThrow(
      'Checksum mismatch',
    );
    expect(database.$transaction).not.toHaveBeenCalled();
  });
  it('does not allow staff without the approval capability to edit source data', async () => {
    const { service, database } = await setup();
    await expect(
      service.recheck('batch-1', {
        ...maker,
        isHeadquarters: true,
        canApproveDiplomas: false,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});

describe('Supplement imported drafts in data review', () => {
  const maker = {
    id: 'maker-1',
    email: 'maker@example.test',
    role: 'university',
    isHeadquarters: true,
    canApproveDiplomas: true,
    institutionId: 'institution-1',
    campusId: 'campus-1',
  } as AuthActor;
  function setup() {
    const input = {
      studentCode: '0012345678',
      fullName: 'Test Student',
      dateOfBirth: '2002-01-01',
      programId: 'program-1',
      graduationYear: 2024,
      classification: 'GOOD',
      gpa: null,
      gpaScale: 4,
      certificateNo: 'CERT-1',
      registryNo: 'REG-1',
      degreeType: null,
      issuedOn: null,
      majorNameEn: null,
      issuePlace: null,
      diplomaSignerName: null,
      diplomaSignerTitle: null,
    };
    const row = {
      id: 'row-1',
      status: 'IMPORTED',
      normalizedData: input,
      overrides: null,
    };
    const diploma = {
      id: 'diploma-1',
      graduationId: 'graduation-1',
      status: 'DRAFT',
      workflowStatus: 'DRAFT',
      signedDocuments: [] as object[],
      graduation: {
        degreeType: 'ENGINEER',
        graduationYear: 2024,
        student: { dateOfBirth: new Date('2002-01-01') },
      },
      issuedOn: new Date('2024-06-01'),
      majorNameEn: 'Civil Engineering',
      issuePlace: 'Hanoi',
      diplomaSignerName: 'Previously confirmed signer' as string | null,
      diplomaSignerTitle: 'RECTOR',
      fullNameLatin: null,
    };
    const transaction = {
      $queryRaw: jest.fn(),
      importRow: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn(),
      },
      diploma: {
        findMany: jest.fn().mockResolvedValue([diploma]),
        update: jest.fn(),
      },
      graduationRecord: { update: jest.fn() },
      validationIssue: { updateMany: jest.fn() },
      diplomaEvent: { createMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const database = {
      institution: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ nameEn: 'Fixture University' }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(transaction)),
    };
    const service = new RegistryImportService(
      database as unknown as DatabaseService,
      {} as DocumentStorageService,
    );
    return { service, row, diploma, transaction, database };
  }
  it('uses confirmed draft fields when saving a partial correction on an old import row', async () => {
    const { service, transaction } = setup();
    expect(
      await service.review(
        'batch-1',
        'row-1',
        { issuePlace: 'Confirmed place' },
        'Checked source',
        maker,
      ),
    ).toMatchObject({ ready: true });
    expect(transaction.diploma.update).toHaveBeenCalledWith({
      where: { id: 'diploma-1' },
      data: expect.objectContaining({
        issuePlace: 'Confirmed place',
        diplomaSignerName: 'Previously confirmed signer',
        issuedOn: new Date('2024-06-01'),
      }),
    });
    expect(transaction.importRow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overrides: { issuePlace: 'Confirmed place' },
        }),
      }),
    );
  });
  it('does not accept a still-incomplete draft as ready', async () => {
    const { service, diploma, transaction } = setup();
    diploma.diplomaSignerName = null;
    await expect(
      service.review(
        'batch-1',
        'row-1',
        { issuePlace: 'Hanoi' },
        'Checked source',
        maker,
      ),
    ).rejects.toThrow('Thiếu người ký trên bằng');
    expect(transaction.diploma.update).not.toHaveBeenCalled();
  });
  it.each(['SIGNED', 'SENT', 'ISSUED'])(
    'never changes a protected %s record',
    async (state) => {
      const { service, diploma, transaction } = setup();
      if (state === 'SIGNED') diploma.signedDocuments.push({ id: 'pdf-1' });
      if (state === 'SENT') diploma.workflowStatus = 'REQUESTED';
      if (state === 'ISSUED') diploma.status = 'ACTIVE';
      await expect(
        service.review(
          'batch-1',
          'row-1',
          { issuePlace: 'Hanoi' },
          'Checked source',
          maker,
        ),
      ).rejects.toThrow('hồ sơ nháp chưa ký');
      expect(transaction.diploma.update).not.toHaveBeenCalled();
      expect(transaction.importRow.update).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid dates and changes to the identity of an imported draft', async () => {
    const { service, transaction } = setup();
    await expect(
      service.review(
        'batch-1',
        'row-1',
        { issuedOn: '2099-01-01' },
        'Checked source',
        maker,
      ),
    ).rejects.toThrow('Ngày cấp');
    await expect(
      service.review(
        'batch-1',
        'row-1',
        { fullName: 'Another person' },
        'Checked source',
        maker,
      ),
    ).rejects.toThrow('chỉ được bổ sung thông tin in bằng');
    expect(transaction.diploma.update).not.toHaveBeenCalled();
  });
  it('checks trusted institution print data before reporting ready', async () => {
    const { service, database } = setup();
    database.institution.findUnique.mockResolvedValue({ nameEn: '' });
    await expect(
      service.review(
        'batch-1',
        'row-1',
        { issuePlace: 'Hanoi' },
        'Checked source',
        maker,
      ),
    ).rejects.toThrow('tên tiếng Anh');
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});

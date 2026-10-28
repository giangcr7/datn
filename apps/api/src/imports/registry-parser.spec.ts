import ExcelJS from 'exceljs';
import {
  parseRegistryWorkbook,
  validateRegistryInput,
  registryIssuesRequireReview,
  ISSUE_DATE_NOT_IN_SOURCE,
} from './registry-parser';
import { lookupText, parseDateOnly } from '../database/data-utils';

const programId = 'f084ca6c-a9a4-4681-8acd-16cac16ee6e0';
const programs = new Map([[lookupText('Kỹ thuật xây dựng'), programId]]);
async function workbookBuffer(year: string, values: unknown[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(year);
  if (year === '2022') {
    sheet.getRow(1).values = ['Title'];
    sheet.getRow(3).values = ['STT'];
    sheet.getRow(4).values = values as any;
  } else if (year === '2021') {
    sheet.getRow(1).values = ['Title'];
    sheet.getRow(2).values = ['STT'];
    sheet.getRow(3).values = values as any;
  } else {
    sheet.getRow(1).values = ['STT'];
    sheet.getRow(2).values = values as any;
  }
  return Buffer.from((await workbook.xlsx.writeBuffer()) as any);
}

describe('registry import validation', () => {
  it('requires complete request data before marking an import row ready', () => {
    const input = {
      studentCode: '0012345678',
      fullName: 'Nguyen An',
      dateOfBirth: '2002-01-01',
      programId,
      programOriginal: 'Kỹ thuật xây dựng',
      graduationYear: 2025,
      gpa: null,
      gpaScale: 4,
      classification: 'GOOD' as const,
      certificateNo: 'CERT1',
      registryNo: 'REG1',
      issuedOn: null,
    };
    const issues = validateRegistryInput(input);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'issuedOn', severity: 'ERROR' }),
        ...[
          'degreeType',
          'majorNameEn',
          'issuePlace',
          'diplomaSignerName',
          'diplomaSignerTitle',
        ].map((field) => expect.objectContaining({ field, severity: 'ERROR' })),
      ]),
    );
    expect(registryIssuesRequireReview(issues)).toBe(true);
    expect(
      validateRegistryInput({
        ...input,
        issuedOn: '2025-06-01',
        degreeType: 'ENGINEER',
        majorNameEn: 'Civil Engineering',
        issuePlace: 'Hà Nội',
        diplomaSignerName: 'Confirmed signer',
        diplomaSignerTitle: 'HIỆU TRƯỞNG',
      }),
    ).toEqual([]);
  });
  it('rejects oversized supporting data before saving to the database', () => {
    const issues = validateRegistryInput({
      studentCode: '0012345678',
      fullName: 'Student',
      programId,
      programOriginal: null,
      graduationYear: 2025,
      issuedOn: '2025-06-01',
      certificateNo: 'CERT',
      registryNo: 'REG',
      birthPlace: 'x'.repeat(256),
      ethnicity: 'x'.repeat(81),
      nationality: 'x'.repeat(101),
      cohortCode: 'x'.repeat(41),
      specialization: 'x'.repeat(256),
      decisionNumber: 'x'.repeat(121),
      signerName: 'x'.repeat(256),
    });
    for (const field of [
      'birthPlace',
      'ethnicity',
      'nationality',
      'cohortCode',
      'specialization',
      'decisionNumber',
      'signerName',
    ])
      expect(issues).toContainEqual(
        expect.objectContaining({
          field,
          code: 'VALUE_TOO_LONG',
          severity: 'ERROR',
        }),
      );
  });
  it('keeps incomplete records in review without manufacturing diploma numbers or GPA', async () => {
    const buffer = await workbookBuffer('2025', [
      1,
      '0012345678',
      'Nguyễn Văn',
      'An',
      '01/02/2001',
      'Hà Nội',
      'Nam',
      'Kinh',
      'Việt Nam',
      'C01',
      '2020-2024',
      'Kỹ thuật xây dựng',
      'Khá',
      '2025',
      null,
      null,
    ]);
    const [row] = await parseRegistryWorkbook(buffer, programs);
    expect(row.normalizedData.studentCode).toBe('0012345678');
    expect(row.normalizedData.gpa).toBeNull();
    expect(row.normalizedData.certificateNo).toBeNull();
    expect(row.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'certificateNo',
          code: 'NOT_YET_ISSUED',
          severity: 'ERROR',
        }),
      ]),
    );
    expect(registryIssuesRequireReview(row.issues)).toBe(true);
  });
  it('reads 2022 MSSV from F and includes a row without STT', async () => {
    const buffer = await workbookBuffer('2022', [
      null,
      'wrong header',
      'Nguyễn Văn',
      'An',
      null,
      '0012345678',
      '01/02/2001',
      'Hà Nội',
      'Nam',
      'Kinh',
      'Việt Nam',
      'C01',
      'Kỹ thuật xây dựng',
      'Kỹ thuật xây dựng',
      'Khá',
      'CERT1',
      'REG1',
      265,
      '16/03/2022',
      null,
      'Signer',
    ]);
    const [row] = await parseRegistryWorkbook(buffer, programs);
    expect(row.rowNumber).toBe(4);
    expect(row.normalizedData.studentCode).toBe('0012345678');
    expect(row.normalizedData.graduationYear).toBe(2022);
    expect(row.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'MISSING_ORDINAL',
        'COLUMN_REALIGNMENT',
        'YEAR_FROM_SHEET',
      ]),
    );
    expect(
      row.issues
        .filter(
          (issue) =>
            issue.severity === 'ERROR' &&
            !['ISSUE_DATE_NOT_IN_SOURCE', 'MISSING_PRINT_FIELD'].includes(
              issue.code,
            ),
        )
        .map((issue) => issue.code),
    ).toEqual([]);
    expect(row.issues).toEqual(
      expect.arrayContaining([ISSUE_DATE_NOT_IN_SOURCE]),
    );
    expect(row.normalizedData.issuedOn).toBeNull();
  });
  it('recovers 2023 GPA and independent classification without deriving a grade', async () => {
    const buffer = await workbookBuffer('2023', [
      1,
      '0012345678',
      'Nguyễn Văn',
      'An',
      '01/02/2001',
      null,
      'Nam',
      'Kinh',
      'Việt Nam',
      'C01',
      null,
      'Kỹ thuật xây dựng',
      '2.52',
      'Khá',
      'REG1',
      'CERT1',
    ]);
    const [row] = await parseRegistryWorkbook(buffer, programs);
    expect(row.normalizedData.gpa).toBe(2.52);
    expect(row.normalizedData.classification).toBe('GOOD');
    expect(row.normalizedData.graduationYear).toBe(2023);
    expect(row.issues.map((issue) => issue.code)).toContain(
      'GPA_COLUMN_REALIGNMENT',
    );
  });
  it('keeps Excel errors as review issues instead of matching student names', async () => {
    const buffer = await workbookBuffer('2021', [
      1,
      'Nguyễn Văn',
      'An',
      null,
      { formula: 'VLOOKUP(D3,A:A,2,0)', result: { error: '#N/A' } },
      'C01',
      '01/02/2001',
      null,
      'Nam',
      null,
      null,
      'Kỹ thuật xây dựng',
      2021,
      'Khá',
      'CERT1',
      'REG1',
    ]);
    const [row] = await parseRegistryWorkbook(buffer, programs);
    expect(row.normalizedData.studentCode).toBe('');
    expect(row.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['EXCEL_ERROR', 'INVALID_STUDENT_CODE']),
    );
  });
  it('rejects future decision dates and malformed ZIP', async () => {
    const buffer = await workbookBuffer('2025', [
      1,
      '0012345678',
      'Nguyễn Văn',
      'An',
      '01/02/2001',
      null,
      'Nam',
      null,
      null,
      'C01',
      null,
      'Kỹ thuật xây dựng',
      'Khá',
      '2025',
      'REG1',
      'CERT1',
      'Q1',
      '01/01/2049',
    ]);
    const [row] = await parseRegistryWorkbook(buffer, programs);
    expect(row.issues.map((issue) => issue.code)).toContain(
      'INVALID_DOCUMENT_DATE',
    );
    await expect(
      parseRegistryWorkbook(Buffer.from('not a workbook'), programs),
    ).rejects.toThrow();
  });
  it('reads every printable field by its header, including real Excel dates', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('2025');
    sheet.getRow(7).values = [
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
      '',
      '',
      '',
      '',
      'GPA hệ 4',
      'Chuyên ngành',
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
      'Người ký quyết định TN',
    ];
    sheet.getRow(8).values = [
      1,
      '0012345678',
      'Nguyễn Văn',
      'An',
      '01/02/2001',
      'Hà Nội',
      'Nam',
      'Kinh',
      'Việt Nam',
      'C01',
      '2020-2024',
      'Kỹ thuật xây dựng',
      'Khá',
      2025,
      'REG1',
      'CERT1',
      'Q1',
      new Date('2025-05-15'),
      'Kỹ sư',
      new Date('2025-06-01'),
      'Hà Nội',
      'Diploma signer',
      'HIỆU TRƯỞNG',
      'Nguyen Van An',
      'Civil Engineering',
      '',
      '',
      '',
      '',
      2.7,
      'Civil specialization',
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
      'Decision signer',
    ];
    const [row] = await parseRegistryWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      programs,
    );
    expect(row.normalizedData).toMatchObject({
      degreeType: 'ENGINEER',
      issuedOn: '2025-06-01',
      issuePlace: 'Hà Nội',
      diplomaSignerName: 'Diploma signer',
      diplomaSignerTitle: 'HIỆU TRƯỞNG',
      fullNameLatin: 'Nguyen Van An',
      majorNameEn: 'Civil Engineering',
      gpa: 2.7,
      specialization: 'Civil specialization',
      signerName: 'Decision signer',
      decisionDate: '2025-05-15',
    });
    expect(row.issues).toEqual([]);
    expect(row.rawData).toHaveProperty('T8');
    expect(row.rawData).toHaveProperty('W8');
    expect(registryIssuesRequireReview(row.issues)).toBe(false);
  });
  it('supports reordered print columns and reports invalid printed dates at import time', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('2025');
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
      'Người ký trên bằng',
      'Loại bằng',
      'Ngày cấp trên bằng',
      'Nơi cấp trên bằng',
      'Chức danh người ký bằng',
    ]);
    sheet.addRow([
      1,
      '0012345678',
      'Nguyễn Văn',
      'An',
      '01/02/2001',
      '',
      'Nam',
      '',
      '',
      '',
      '',
      'Kỹ thuật xây dựng',
      'Khá',
      2025,
      'REG1',
      'CERT1',
      '',
      '',
      'Signer',
      'MASTER',
      '31/02/2025',
      'Hà Nội',
      'HIỆU TRƯỞNG',
    ]);
    const [row] = await parseRegistryWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      programs,
      new Map([[programId, 'Civil Engineering']]),
    );
    expect(row.normalizedData.degreeType).toBe('MASTER');
    expect(row.normalizedData.majorNameEn).toBe('Civil Engineering');
    expect(row.issues).toContainEqual(
      expect.objectContaining({
        field: 'issuedOn',
        code: 'INVALID_DOCUMENT_DATE',
        severity: 'ERROR',
      }),
    );
  });
  it('does not substitute a graduation decision signer for a missing diploma signer', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('2025');
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
      'Người ký quyết định TN',
    ]);
    sheet.addRow([
      1,
      '0012345678',
      'Nguyễn Văn',
      'An',
      '01/02/2001',
      '',
      'Nam',
      '',
      '',
      '',
      '',
      'Kỹ thuật xây dựng',
      'Khá',
      2025,
      'REG1',
      'CERT1',
      '',
      '',
      'Decision signer only',
    ]);
    const [row] = await parseRegistryWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      programs,
    );
    expect(row.normalizedData.signerName).toBe('Decision signer only');
    expect(row.normalizedData.diplomaSignerName).toBeNull();
    expect(row.issues).toContainEqual(
      expect.objectContaining({
        field: 'diplomaSignerName',
        severity: 'ERROR',
      }),
    );
  });
  it('parses calendar dates strictly', () => {
    expect(parseDateOnly('31/02/2025')).toBeNull();
    expect(parseDateOnly('ngày 03 tháng 4 năm 2025')?.toISOString()).toBe(
      '2025-04-03T00:00:00.000Z',
    );
    expect(parseDateOnly('29/02/2024')?.toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
  });

  it.each(['2000-01-01', '2024-12-31'])(
    'keeps an imported issue date outside the academic timeline in review: %s',
    (issuedOn) => {
      const issues = validateRegistryInput({
        studentCode: '0012345678',
        fullName: 'Nguyen An',
        dateOfBirth: '2002-01-01',
        programId,
        programOriginal: 'Kỹ thuật xây dựng',
        graduationYear: 2025,
        gpa: null,
        gpaScale: 4,
        classification: 'GOOD',
        certificateNo: 'CERT1',
        registryNo: 'REG1',
        issuedOn,
      });
      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'issuedOn',
            code: 'INVALID_DOCUMENT_DATE',
            severity: 'ERROR',
          }),
        ]),
      );
    },
  );
});

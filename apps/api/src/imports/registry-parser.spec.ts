import ExcelJS from 'exceljs';
import {
  parseRegistryWorkbook,
  validateRegistryInput,
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
  it('retains 2025 graduation-only records without manufacturing diploma numbers or GPA', async () => {
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
    expect(row.issues).toEqual([
      {
        field: 'certificateNo',
        code: 'NOT_YET_ISSUED',
        severity: 'WARNING',
        message: expect.any(String),
      },
    ]);
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
    expect(row.issues.some((issue) => issue.severity === 'ERROR')).toBe(false);
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
  it('parses calendar dates strictly', () => {
    expect(parseDateOnly('31/02/2025')).toBeNull();
    expect(parseDateOnly('ngày 03 tháng 4 năm 2025')?.toISOString()).toBe(
      '2025-04-03T00:00:00.000Z',
    );
    expect(parseDateOnly('29/02/2024')?.toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
  });
});

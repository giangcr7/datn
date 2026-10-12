import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { Classification, DegreeType, Gender } from '../generated/prisma/client';
import {
  classificationFrom,
  dateOnly,
  lookupText,
  normalizeText,
  parseDateOnly,
} from '../database/data-utils';
import { AcademicInput } from '../database/academic-record-writer';

export const REGISTRY_MAPPING_VERSION = 'tlu-register-v1';
export interface RegistryInput extends Omit<AcademicInput, 'programId'> {
  programId: string | null;
  programOriginal: string | null;
  certificateNo: string | null;
  registryNo: string | null;
  issuedOn: string | null;
}
export interface RowIssue {
  field: string;
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
}
export interface ParsedRow {
  sheetName: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  normalizedData: RegistryInput;
  issues: RowIssue[];
}
export type ProgramLookup = Map<string, string>;

export function assertWorkbookSize(buffer: Buffer) {
  if (
    buffer.length < 22 ||
    buffer.length > 5 * 1024 * 1024 ||
    buffer.readUInt32LE(0) !== 0x04034b50
  )
    throw new BadRequestException(
      'File .xlsx phải là ZIP OOXML hợp lệ, tối đa 5 MB',
    );
  let end = -1;
  for (
    let offset = buffer.length - 22;
    offset >= Math.max(0, buffer.length - 65557);
    offset--
  ) {
    if (
      buffer.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6))
    throw new BadRequestException('Không hỗ trợ ZIP nhiều volume');
  const count = buffer.readUInt16LE(end + 10);
  let position = buffer.readUInt32LE(end + 16),
    expanded = 0;
  if (count === 65535 || count > 2000)
    throw new BadRequestException('Workbook có quá nhiều ZIP entry');
  for (let entry = 0; entry < count; entry++) {
    if (position + 46 > end || buffer.readUInt32LE(position) !== 0x02014b50)
      throw new BadRequestException('ZIP directory lỗi');
    if (buffer.readUInt16LE(position + 8) & 1)
      throw new BadRequestException('Không nhận workbook mã hóa');
    expanded += buffer.readUInt32LE(position + 24);
    position +=
      46 +
      buffer.readUInt16LE(position + 28) +
      buffer.readUInt16LE(position + 30) +
      buffer.readUInt16LE(position + 32);
    if (expanded > 64 * 1024 * 1024 || position > end)
      throw new BadRequestException('Workbook vượt quá 64 MB sau giải nén');
  }
}

export function validateRegistryInput(
  input: RegistryInput,
  today = new Date(),
): RowIssue[] {
  const issues: RowIssue[] = [];
  const add = (
    field: string,
    code: string,
    message: string,
    severity: 'ERROR' | 'WARNING' = 'ERROR',
  ) => issues.push({ field, code, message, severity });
  if (!/^\d{10}$/.test(input.studentCode || ''))
    add(
      'studentCode',
      'INVALID_STUDENT_CODE',
      'MSSV phải là chuỗi 10 chữ số; không suy đoán từ họ tên',
    );
  if (!input.fullName || input.fullName.length > 255)
    add('fullName', 'INVALID_NAME', 'Họ tên bắt buộc, tối đa 255 ký tự');
  if (!input.programId)
    add(
      'programId',
      'UNMAPPED_PROGRAM',
      'Ngành chưa được ánh xạ vào danh mục được phê duyệt',
    );
  if (
    !Number.isInteger(input.graduationYear) ||
    input.graduationYear < 1900 ||
    input.graduationYear > today.getFullYear()
  )
    add(
      'graduationYear',
      'INVALID_GRADUATION_YEAR',
      'Năm tốt nghiệp không hợp lệ hoặc ở tương lai',
    );
  const dob = parseDateOnly(input.dateOfBirth);
  if (
    !dob ||
    dob > today ||
    dob.getUTCFullYear() < 1900 ||
    (input.graduationYear && dob.getUTCFullYear() >= input.graduationYear)
  )
    add(
      'dateOfBirth',
      'INVALID_BIRTH_DATE',
      'Ngày sinh không hợp lệ; cần kiểm tra với hồ sơ gốc',
    );
  if (
    input.gpa !== null &&
    input.gpa !== undefined &&
    (!Number.isFinite(input.gpa) ||
      input.gpa < 0 ||
      input.gpa > (input.gpaScale || 4))
  )
    add('gpa', 'INVALID_GPA', 'GPA phải thuộc thang điểm đã khai báo');
  if (input.gpaScale !== 4 && input.gpaScale !== 10)
    add('gpaScale', 'INVALID_GPA_SCALE', 'Chỉ nhận thang điểm 4 hoặc 10');
  if (
    !input.classification ||
    !Object.values(Classification).includes(input.classification)
  )
    add(
      'classification',
      'INVALID_CLASSIFICATION',
      'Xếp loại cần được xác nhận độc lập, không suy từ GPA',
    );
  if (input.gender && !Object.values(Gender).includes(input.gender))
    add('gender', 'INVALID_GENDER', 'Giới tính không thuộc danh mục');
  if (input.degreeType && !Object.values(DegreeType).includes(input.degreeType))
    add('degreeType', 'INVALID_DEGREE_TYPE', 'Loại bằng không thuộc danh mục');
  for (const field of ['decisionDate', 'issuedOn'] as const)
    if (input[field]) {
      const date = parseDateOnly(input[field]);
      if (!date || date > today)
        add(
          field,
          'INVALID_DOCUMENT_DATE',
          'Ngày ký/cấp không hợp lệ hoặc ở tương lai',
        );
    }
  if (!input.certificateNo && !input.registryNo)
    add(
      'certificateNo',
      'NOT_YET_ISSUED',
      'Chưa có số hiệu và số vào sổ: chỉ lưu hồ sơ tốt nghiệp, không tạo văn bằng',
      'WARNING',
    );
  else if (!input.certificateNo || !input.registryNo)
    add(
      'certificateNo',
      'INCOMPLETE_DIPLOMA_NUMBERS',
      'Chỉ có một trong hai số văn bằng; cần đối soát',
    );
  if (input.certificateNo && input.certificateNo.length > 120)
    add('certificateNo', 'VALUE_TOO_LONG', 'Số hiệu tối đa 120 ký tự');
  if (input.registryNo && input.registryNo.length > 180)
    add('registryNo', 'VALUE_TOO_LONG', 'Số vào sổ tối đa 180 ký tự');
  if (input.classCode && input.classCode.length > 100)
    add('classCode', 'VALUE_TOO_LONG', 'Mã lớp tối đa 100 ký tự');
  return issues;
}

export async function parseRegistryWorkbook(
  buffer: Buffer,
  programs: ProgramLookup,
): Promise<ParsedRow[]> {
  assertWorkbookSize(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new BadRequestException('File không đọc được bằng ExcelJS');
  }
  const rows: ParsedRow[] = [];
  for (const sheet of workbook.worksheets) {
    if (
      sheet.state !== 'visible' ||
      !/^20(20|21|22|23|24|25)$/.test(sheet.name)
    )
      continue;
    if (sheet.rowCount > 6000)
      throw new BadRequestException('Sheet vượt quá 6000 dòng');
    const start = sheet.name === '2021' ? 3 : sheet.name === '2022' ? 4 : 2;
    for (let rowNumber = start; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const ordinal = row.getCell(1).text.trim();
      if (
        !/^\d+$/.test(ordinal) &&
        !(
          sheet.name === '2022' &&
          row.getCell(3).text &&
          row.getCell(4).text &&
          row.getCell(13).text
        )
      )
        continue;
      const rawData: Record<string, unknown> = {};
      const issues: RowIssue[] = [];
      if (!ordinal)
        issues.push({
          field: 'sourceRow',
          code: 'MISSING_ORDINAL',
          severity: 'WARNING',
          message:
            'Dòng dữ liệu thiếu STT; vẫn lưu theo số dòng Excel, không bỏ sót',
        });
      const field = (column: number, name: string): string => {
        const cell = row.getCell(column);
        rawData[cell.address] = cell.value === undefined ? null : cell.value;
        let value: any = cell.value;
        if (
          value &&
          typeof value === 'object' &&
          ('formula' in value || 'sharedFormula' in value)
        ) {
          if (value.formula?.includes('['))
            issues.push({
              field: name,
              code: 'EXTERNAL_FORMULA_CACHE',
              severity: 'WARNING',
              message:
                'Giá trị từ cache công thức liên kết ngoài; cần rà soát, không tính lại hoặc tải file ngoài',
            });
          value = value.result;
          if (value === undefined)
            issues.push({
              field: name,
              code: 'MISSING_FORMULA_CACHE',
              severity: 'ERROR',
              message: 'Công thức không có giá trị cache; cần đối soát',
            });
        }
        if (value && typeof value === 'object' && 'error' in value) {
          issues.push({
            field: name,
            code: 'EXCEL_ERROR',
            severity: 'ERROR',
            message: 'Ô Excel lỗi ' + value.error,
          });
          return '';
        }
        if (value instanceof Date) return dateOnly(value)!;
        if (value && typeof value === 'object' && 'richText' in value)
          return normalizeText(
            value.richText.map((item: any) => item.text).join(''),
          );
        return normalizeText(value);
      };
      const data: RegistryInput = {
        studentCode: '',
        fullName: '',
        programId: null,
        programOriginal: null,
        graduationYear: Number(sheet.name),
        dateOfBirth: null,
        birthPlace: null,
        gender: null,
        ethnicity: null,
        nationality: null,
        classCode: null,
        cohortCode: null,
        gpa: null,
        gpaScale: 4,
        classification: null,
        degreeType: null,
        specialization: null,
        decisionNumber: null,
        decisionDate: null,
        signerName: null,
        certificateNo: null,
        registryNo: null,
        issuedOn: null,
      };
      let gender = '',
        grade = '',
        dob = '',
        decisionDate = '';
      if (sheet.name === '2020') {
        data.studentCode = field(2, 'studentCode');
        data.fullName = normalizeText(
          field(3, 'fullName') + ' ' + field(4, 'fullName'),
        );
        dob = field(5, 'dateOfBirth');
        gender = field(7, 'gender');
        data.ethnicity = field(8, 'ethnicity') || null;
        data.classCode = field(9, 'classCode') || null;
        const gpa = field(10, 'gpa');
        data.gpa = gpa ? Number(gpa.replace(',', '.')) : null;
        grade = field(11, 'classification');
        data.certificateNo = field(12, 'certificateNo') || null;
        data.registryNo = field(13, 'registryNo') || null;
      } else if (sheet.name === '2021' || sheet.name === '2022') {
        const year2022 = sheet.name === '2022';
        data.studentCode = field(year2022 ? 6 : 5, 'studentCode');
        data.fullName = normalizeText(
          field(year2022 ? 3 : 2, 'fullName') +
            ' ' +
            field(year2022 ? 4 : 3, 'fullName'),
        );
        data.classCode = field(year2022 ? 12 : 6, 'classCode') || null;
        dob = field(7, 'dateOfBirth');
        data.birthPlace = field(8, 'birthPlace') || null;
        gender = field(9, 'gender');
        data.ethnicity = field(10, 'ethnicity') || null;
        data.nationality = field(11, 'nationality') || null;
        data.programOriginal = field(year2022 ? 13 : 12, 'programId') || null;
        const sourceYear = field(year2022 ? 14 : 13, 'graduationYear');
        data.graduationYear = Number(sourceYear);
        grade = field(year2022 ? 15 : 14, 'classification');
        data.certificateNo = field(year2022 ? 16 : 15, 'certificateNo') || null;
        data.registryNo = field(year2022 ? 17 : 16, 'registryNo') || null;
        if (year2022 && !/^20\d{2}$/.test(sourceYear)) {
          data.graduationYear = Number(sheet.name);
          issues.push({
            field: 'graduationYear',
            code: 'YEAR_FROM_SHEET',
            severity: 'WARNING',
            message:
              'Ô năm chứa tên ngành; năm lấy từ tên sheet như gợi ý, cần xác nhận',
          });
        }
        const combined = field(year2022 ? 18 : 17, 'decisionNumber');
        if (year2022) {
          data.decisionNumber = combined || null;
          decisionDate = field(19, 'decisionDate');
        } else {
          data.decisionNumber = combined.split(/\s+ngày\s+/i)[0] || null;
          decisionDate = combined.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || '';
        }
        data.signerName = field(year2022 ? 21 : 18, 'signerName') || null;
        if (year2022)
          issues.push({
            field: 'studentCode',
            code: 'COLUMN_REALIGNMENT',
            severity: 'WARNING',
            message:
              'MSSV đọc từ cột F thực tế, không phải cột B theo tiêu đề sai',
          });
      } else if (sheet.name === '2024') {
        data.studentCode = field(2, 'studentCode');
        data.fullName = normalizeText(
          field(3, 'fullName') + ' ' + field(4, 'fullName'),
        );
        dob = field(6, 'dateOfBirth');
        gender = field(8, 'gender');
        data.ethnicity = field(9, 'ethnicity') || null;
        data.classCode = field(10, 'classCode') || null;
        const gpa = field(11, 'gpa');
        data.gpa = gpa ? Number(gpa.replace(',', '.')) : null;
        grade = field(12, 'classification');
        data.programOriginal = field(13, 'programId') || null;
        data.specialization = field(14, 'specialization') || null;
        data.cohortCode = field(16, 'cohortCode') || null;
        data.decisionNumber = field(17, 'decisionNumber') || null;
        decisionDate = field(18, 'decisionDate');
        data.registryNo = field(19, 'registryNo') || null;
        data.certificateNo = field(20, 'certificateNo') || null;
      } else {
        data.studentCode = field(2, 'studentCode');
        data.fullName = normalizeText(
          field(3, 'fullName') + ' ' + field(4, 'fullName'),
        );
        dob = field(5, 'dateOfBirth');
        data.birthPlace = field(6, 'birthPlace') || null;
        gender = field(7, 'gender');
        data.ethnicity = field(8, 'ethnicity') || null;
        data.nationality = field(9, 'nationality') || null;
        data.classCode = field(10, 'classCode') || null;
        data.cohortCode = field(11, 'cohortCode') || null;
        data.programOriginal = field(12, 'programId') || null;
        const column13 = field(13, 'classification'),
          column14 = field(14, 'graduationYear');
        if (/^20\d{2}$/.test(column13) && classificationFrom(column14)) {
          data.graduationYear = Number(column13);
          grade = column14;
          issues.push({
            field: 'classification',
            code: 'SWAPPED_YEAR_CLASSIFICATION',
            severity: 'WARNING',
            message: 'M/N bị đảo: đã gợi ý đổi năm/xếp loại theo kiểu dữ liệu',
          });
        } else if (
          sheet.name === '2023' &&
          classificationFrom(column14) &&
          (!column13 ||
            (Number.isFinite(Number(column13.replace(',', '.'))) &&
              Number(column13.replace(',', '.')) <= 4))
        ) {
          grade = column14;
          data.gpa = column13 ? Number(column13.replace(',', '.')) : null;
          data.graduationYear = Number(sheet.name);
          issues.push({
            field: 'graduationYear',
            code: 'YEAR_FROM_SHEET',
            severity: 'WARNING',
            message:
              'M là GPA, N là xếp loại thực tế; năm gợi ý từ tên sheet, cần xác nhận',
          });
          issues.push({
            field: 'gpa',
            code: 'GPA_COLUMN_REALIGNMENT',
            severity: 'WARNING',
            message:
              'GPA đọc từ M, xếp loại đọc độc lập từ N; không suy xếp loại từ GPA',
          });
        } else {
          grade = column13;
          data.graduationYear = Number(column14);
        }
        if (
          grade &&
          Number.isFinite(Number(grade.replace(',', '.'))) &&
          Number(grade.replace(',', '.')) <= 4
        ) {
          data.gpa = Number(grade.replace(',', '.'));
          issues.push({
            field: 'classification',
            code: 'GPA_IN_CLASSIFICATION',
            severity: 'ERROR',
            message: 'GPA nằm trong cột xếp loại; không tự suy xếp loại từ GPA',
          });
          grade = '';
        }
        data.registryNo = field(15, 'registryNo') || null;
        data.certificateNo = field(16, 'certificateNo') || null;
        if (sheet.name === '2025') {
          data.decisionNumber = field(17, 'decisionNumber') || null;
          decisionDate = field(18, 'decisionDate');
        } else {
          const degree = lookupText(field(19, 'degreeType'));
          data.degreeType = degree.includes('kỹ sư')
            ? DegreeType.ENGINEER
            : degree.includes('cử nhân')
              ? DegreeType.BACHELOR
              : null;
        }
      }
      data.dateOfBirth = dob ? dateOnly(parseDateOnly(dob)) || dob : null;
      data.decisionDate = decisionDate
        ? dateOnly(parseDateOnly(decisionDate)) || decisionDate
        : null;
      data.gender =
        lookupText(gender) === 'nam'
          ? Gender.MALE
          : lookupText(gender) === 'nữ'
            ? Gender.FEMALE
            : null;
      data.classification = classificationFrom(grade);
      data.programId = data.programOriginal
        ? programs.get(lookupText(data.programOriginal)) || null
        : null;
      issues.push(...validateRegistryInput(data));
      rows.push({
        sheetName: sheet.name,
        rowNumber,
        rawData,
        normalizedData: data,
        issues,
      });
      if (rows.length > 6000)
        throw new BadRequestException('Tối đa 6000 bản ghi mỗi workbook');
    }
  }
  if (!rows.length)
    throw new BadRequestException(
      'Không có sheet sổ gốc 2020–2025 được hỗ trợ',
    );
  for (const [field, code] of [
    ['studentCode', 'REPEATED_STUDENT_CODE'],
    ['certificateNo', 'DUPLICATE_CERTIFICATE_NO'],
    ['registryNo', 'DUPLICATE_REGISTRY_NO'],
  ] as const) {
    const groups = new Map<string, ParsedRow[]>();
    for (const row of rows) {
      const value = row.normalizedData[field];
      if (!value || (field === 'studentCode' && !/^\d{10}$/.test(value)))
        continue;
      const group = groups.get(value) || [];
      group.push(row);
      groups.set(value, group);
    }
    for (const group of groups.values())
      if (group.length > 1)
        for (const row of group)
          row.issues.push({
            field,
            code,
            severity: field === 'studentCode' ? 'WARNING' : 'ERROR',
            message:
              'Trùng với ' +
              group
                .filter((item) => item !== row)
                .map((item) => item.sheetName + '!' + item.rowNumber)
                .join(', ') +
              '; cần xác nhận, không gộp tự động',
          });
  }
  return rows;
}

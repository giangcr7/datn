import { normalizeText } from './data-utils';

export const DIPLOMA_PRINT_TEMPLATE = 'tlu-bilingual-v1';
export const DEGREE_TITLES = {
  BACHELOR: { vi: 'BẰNG CỬ NHÂN', en: 'THE DEGREE OF BACHELOR' },
  ENGINEER: { vi: 'BẰNG KỸ SƯ', en: 'THE DEGREE OF ENGINEER' },
  MASTER: { vi: 'BẰNG THẠC SĨ', en: 'THE DEGREE OF MASTER' },
  DOCTOR: { vi: 'BẰNG TIẾN SĨ', en: 'THE DEGREE OF DOCTOR' },
} as const;
export const CLASSIFICATION_ENGLISH: Record<string, string> = {
  'Xuất sắc': 'Excellent',
  Giỏi: 'Very good',
  Khá: 'Good',
  'Trung bình khá': 'Fairly good',
  'Trung bình': 'Average',
};

export function latinName(value: string): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd');
}

export interface PrintedDiploma {
  template: string;
  originType?: string;
  institutionName: string;
  institutionNameEn: string | null;
  fullNameLatin: string;
  majorNameEn: string | null;
  degreeType: string | null;
  issuePlace: string | null;
  diplomaSignerName: string | null;
  diplomaSignerTitle: string | null;
}

export function diplomaPrintWarnings(
  printed: PrintedDiploma | null,
  issueDate: unknown,
) {
  const warnings: string[] = [];
  if (!printed?.degreeType) warnings.push('Chưa xác nhận loại bằng');
  if (!printed?.majorNameEn) warnings.push('Chưa xác nhận tên ngành tiếng Anh');
  if (!printed?.institutionNameEn)
    warnings.push('Chưa có tên trường tiếng Anh');
  if (!printed?.issuePlace) warnings.push('Chưa xác nhận nơi cấp trên bằng');
  if (!issueDate) warnings.push('Nguồn chưa ghi ngày cấp trên bằng');
  if (!printed?.diplomaSignerName)
    warnings.push('Chưa xác nhận người ký trên bằng');
  if (!printed?.diplomaSignerTitle)
    warnings.push('Chưa xác nhận chức danh người ký trên bằng');
  return warnings;
}

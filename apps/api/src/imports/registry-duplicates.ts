import type { RegistryInput, RowIssue } from './registry-parser';

export const registryDuplicateFields = [
  {
    field: 'studentCode',
    label: 'Mã sinh viên',
    code: 'REPEATED_STUDENT_CODE',
    severity: 'WARNING',
  },
  {
    field: 'certificateNo',
    label: 'Số hiệu văn bằng',
    code: 'DUPLICATE_CERTIFICATE_NO',
    severity: 'ERROR',
  },
  {
    field: 'registryNo',
    label: 'Số vào sổ',
    code: 'DUPLICATE_REGISTRY_NO',
    severity: 'ERROR',
  },
] as const;
export type DuplicateField = (typeof registryDuplicateFields)[number]['field'];
export interface DuplicateSourceRow {
  id?: string;
  sheetName: string;
  rowNumber: number;
  status?: string;
  normalizedData: unknown;
  overrides?: unknown;
}
export function registryEffectiveData(
  row: Pick<DuplicateSourceRow, 'normalizedData' | 'overrides'>,
): RegistryInput {
  return {
    ...(row.normalizedData as object),
    ...((row.overrides as object) || {}),
  } as RegistryInput;
}
export function registryDuplicateValue(
  data: RegistryInput,
  field: DuplicateField,
): string {
  const value = typeof data[field] === 'string' ? data[field].trim() : '';
  return field === 'studentCode' && !/^[0-9]{10}$/.test(value) ? '' : value;
}
export function registryDuplicateIndex<Row extends DuplicateSourceRow>(
  rows: Row[],
) {
  const indexes = registryDuplicateFields.map(({ field }) => {
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      if (row.status === 'SKIPPED') continue;
      const value = registryDuplicateValue(registryEffectiveData(row), field);
      if (!value) continue;
      const group = groups.get(value) || [];
      group.push(row);
      groups.set(value, group);
    }
    return { field, groups };
  });
  return (row: DuplicateSourceRow) =>
    indexes.map(({ field, groups }) => ({
      ...registryDuplicateFields.find((item) => item.field === field)!,
      value: registryDuplicateValue(registryEffectiveData(row), field),
      matches: (
        groups.get(registryDuplicateValue(registryEffectiveData(row), field)) ||
        []
      ).filter((other) => other !== row && !(other.id && other.id === row.id)),
    }));
}
export function registryDuplicateIssues<Row extends DuplicateSourceRow>(
  row: Row,
  lookup: ReturnType<typeof registryDuplicateIndex<Row>>,
): RowIssue[] {
  return lookup(row)
    .filter((group) => group.matches.length > 0)
    .map((group) => ({
      field: group.field,
      code: group.code,
      severity: group.severity,
      message:
        group.label +
        ' "' +
        group.value +
        '" trùng với ' +
        group.matches
          .slice(0, 8)
          .map(
            (match) => 'sheet ' + match.sheetName + ', dòng ' + match.rowNumber,
          )
          .join('; ') +
        (group.matches.length > 8
          ? '; và ' + (group.matches.length - 8) + ' dòng khác'
          : '') +
        '. Cần đối chiếu, không gộp tự động.',
    }));
}
export function isRegistryDuplicateIssue(issue: { code: string }) {
  return [
    'REPEATED_STUDENT_CODE',
    'DUPLICATE_CERTIFICATE_NO',
    'DUPLICATE_REGISTRY_NO',
    'DUPLICATE_NUMBER',
    'EXISTING_CERTIFICATE_NO',
    'EXISTING_REGISTRY_NO',
    'EXISTING_NUMBER',
  ].includes(issue.code);
}

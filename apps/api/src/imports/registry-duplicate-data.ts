import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { RegistryInput, RowIssue } from './registry-parser';
import { registryIssuesRequireReview } from './registry-parser';
import {
  isRegistryDuplicateIssue,
  registryDuplicateFields,
  registryDuplicateIndex,
  registryDuplicateIssues,
  registryDuplicateValue,
  registryEffectiveData,
} from './registry-duplicates';

type Client = Pick<
  Prisma.TransactionClient,
  'importRow' | 'diploma' | 'validationIssue'
>;
export async function registryDuplicateState(
  client: Client,
  batchId: string,
  institutionId: string,
) {
  const rows = await client.importRow.findMany({
    where: { batchId, status: { not: 'SKIPPED' } },
    include: { issues: { where: { resolvedAt: null } } },
    orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
    take: 6001,
  });
  if (rows.length > 6000)
    throw new BadRequestException('Đợt nhập vượt giới hạn 6000 dòng đối chiếu');
  const numbers = (field: 'certificateNo' | 'registryNo') => [
    ...new Set(
      rows
        .map((row) => registryDuplicateValue(registryEffectiveData(row), field))
        .filter(Boolean),
    ),
  ];
  const certificateNumbers = numbers('certificateNo');
  const registryNumbers = numbers('registryNo');
  const diplomas =
    certificateNumbers.length || registryNumbers.length
      ? await client.diploma.findMany({
          where: {
            institutionId,
            OR: [
              { certificateNo: { in: certificateNumbers } },
              { registryNo: { in: registryNumbers } },
            ],
          },
          select: {
            id: true,
            campusId: true,
            certificateNo: true,
            registryNo: true,
            graduation: { select: { sourceRowId: true } },
          },
        })
      : [];
  return { rows, lookup: registryDuplicateIndex(rows), diplomas };
}
export function storedNumberIssues(
  input: RegistryInput,
  rowId: string | undefined,
  diplomas: Awaited<ReturnType<typeof registryDuplicateState>>['diplomas'],
): RowIssue[] {
  return registryDuplicateFields
    .filter((item) => item.field !== 'studentCode')
    .flatMap(({ field, label }) => {
      const value = registryDuplicateValue(input, field);
      return value &&
        diplomas.some(
          (diploma) =>
            diploma[field] === value &&
            (!rowId || diploma.graduation.sourceRowId !== rowId),
        )
        ? [
            {
              field,
              code:
                field === 'certificateNo'
                  ? 'EXISTING_CERTIFICATE_NO'
                  : 'EXISTING_REGISTRY_NO',
              severity: 'ERROR' as const,
              message:
                label +
                ' "' +
                value +
                '" đã có trong hệ thống. Mở đối chiếu hồ sơ trùng để kiểm tra.',
            },
          ]
        : [];
    });
}
export async function refreshRegistryDuplicates(
  client: Client,
  batchId: string,
  institutionId: string,
  target?: { rowId: string; previous?: RegistryInput },
) {
  const state = await registryDuplicateState(client, batchId, institutionId);
  const current = target && state.rows.find((row) => row.id === target.rowId);
  const selectedValues = current
    ? [
        registryEffectiveData(current),
        ...(target?.previous ? [target.previous] : []),
      ]
    : [];
  const results = new Map<string, { ready: boolean; issues: RowIssue[] }>();
  const resolvedIds: string[] = [];
  const additions: (RowIssue & { rowId: string })[] = [];
  const readyIds: string[] = [];
  const reviewIds: string[] = [];
  for (const row of state.rows) {
    if (row.status === 'IMPORTED') continue;
    const input = registryEffectiveData(row);
    if (
      target &&
      row.id !== target.rowId &&
      !registryDuplicateFields.some(({ field }) =>
        selectedValues.some(
          (values) =>
            registryDuplicateValue(values, field) &&
            registryDuplicateValue(values, field) ===
              registryDuplicateValue(input, field),
        ),
      )
    )
      continue;
    const next = [
      ...registryDuplicateIssues(row, state.lookup),
      ...storedNumberIssues(input, row.id, state.diplomas),
    ];
    const previous = row.issues.filter(isRegistryDuplicateIssue);
    const key = (issue: RowIssue) =>
      JSON.stringify([issue.field, issue.code, issue.severity, issue.message]);
    const nextKeys = new Set(next.map(key));
    const previousKeys = new Set(previous.map(key));
    const resolved = previous.filter((issue) => !nextKeys.has(key(issue)));
    resolvedIds.push(...resolved.map((issue) => issue.id));
    additions.push(
      ...next
        .filter((issue) => !previousKeys.has(key(issue)))
        .map((issue) => ({ ...issue, rowId: row.id })),
    );
    const issues = [
      ...row.issues.filter((issue) => !isRegistryDuplicateIssue(issue)),
      ...next,
    ];
    const ready =
      !issues.some((issue) => issue.severity === 'ERROR') &&
      (!!row.reviewedAt || !registryIssuesRequireReview(issues));
    const status = ready ? 'READY' : 'NEEDS_REVIEW';
    if (row.status !== status) (ready ? readyIds : reviewIds).push(row.id);
    results.set(row.id, { ready, issues });
  }
  for (let offset = 0; offset < resolvedIds.length; offset += 500)
    await client.validationIssue.updateMany({
      where: {
        id: { in: resolvedIds.slice(offset, offset + 500) },
        resolvedAt: null,
      },
      data: { resolvedAt: new Date() },
    });
  for (let offset = 0; offset < additions.length; offset += 500)
    await client.validationIssue.createMany({
      data: additions.slice(offset, offset + 500),
    });
  for (const [ids, status] of [
    [readyIds, 'READY'],
    [reviewIds, 'NEEDS_REVIEW'],
  ] as const) {
    for (let offset = 0; offset < ids.length; offset += 500)
      await client.importRow.updateMany({
        where: {
          id: { in: ids.slice(offset, offset + 500) },
          status: { notIn: ['IMPORTED', 'SKIPPED'] },
        },
        data: { status },
      });
  }
  return results;
}

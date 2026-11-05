import { Prisma } from '../generated/prisma/client';

export function normalizeRegisterSearch(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0110/g, 'D')
    .replace(/\u0111/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function registerSearchPlan(value?: string) {
  const text = normalizeRegisterSearch(value);
  return {
    text,
    tokens: text ? text.split(' ') : [],
    fuzzy: text.length >= 4 && text.length <= 80 && /^[a-z ]+$/.test(text),
  };
}

export function searchPattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function registerSearchMatch(
  text: Prisma.Sql,
  name: Prisma.Sql,
  plan: ReturnType<typeof registerSearchPlan>,
) {
  if (!plan.text) return Prisma.sql`TRUE`;
  const partial = Prisma.join(
    plan.tokens.map(
      (token) => Prisma.sql`${text} LIKE ${'%' + searchPattern(token) + '%'}`,
    ),
    ' AND ',
  );
  return Prisma.sql`((${partial})${
    plan.fuzzy
      ? Prisma.sql` OR ${name} OPERATOR(public.%>) ${plan.text}`
      : Prisma.empty
  })`;
}

export function registerSearchCandidates(
  institutionId: string,
  plan: ReturnType<typeof registerSearchPlan>,
) {
  if (!plan.text) return Prisma.empty;
  return Prisma.sql`search_versions AS MATERIALIZED (
    SELECT version.id FROM diploma_versions version
    WHERE (${registerSearchMatch(
      Prisma.sql`public.diploma_search_snapshot(version.payload)`,
      Prisma.sql`public.diploma_search_normalize(coalesce(version.payload ->> 'fullName', ''))`,
      plan,
    )} OR NOT (version.payload ?& ARRAY['fullName', 'mssv', 'soHieu', 'soVaoSo']))
      AND EXISTS (SELECT 1 FROM diplomas owner
        WHERE owner.id = version.diploma_id AND owner.institution_id = ${institutionId}::uuid)
  ),`;
}

export function registerSearchRank(
  plan: ReturnType<typeof registerSearchPlan>,
) {
  if (!plan.text) return Prisma.sql`0`;
  const identifiers = [
    'search_student_code',
    'search_certificate_no',
    'search_registry_no',
  ].map((field) => Prisma.raw(field));
  return Prisma.sql`CASE
    WHEN ${Prisma.join(
      identifiers.map((field) => Prisma.sql`${field} = ${plan.text}`),
      ' OR ',
    )} THEN 0
    WHEN search_name = ${plan.text} THEN 1
    WHEN ${Prisma.join(
      identifiers.map(
        (field) => Prisma.sql`${field} LIKE ${searchPattern(plan.text) + '%'}`,
      ),
      ' OR ',
    )} THEN 2
    WHEN search_name LIKE ${searchPattern(plan.text) + '%'} THEN 3
    WHEN ${registerSearchMatch(Prisma.sql`search_text`, Prisma.sql`NULL::text`, { ...plan, fuzzy: false })} THEN 4
    ELSE 5 END`;
}

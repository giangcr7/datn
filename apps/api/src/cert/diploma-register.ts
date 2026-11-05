import { Prisma } from '../generated/prisma/client';
import type { RegisterQueryDto } from './register-query.dto';
import {
  registerSearchCandidates,
  registerSearchMatch,
  registerSearchPlan,
  registerSearchRank,
} from './register-search';

function snapshotField(field: string, fallback: Prisma.Sql) {
  return Prisma.sql`CASE WHEN version.payload ? ${field}
    THEN version.payload ->> ${field} ELSE ${fallback} END`;
}

function contains(field: Prisma.Sql, value: string) {
  const pattern = '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
  return Prisma.sql`${field} ILIKE ${pattern}`;
}

export function registerDataset(
  institutionId: string,
  query: RegisterQueryDto,
) {
  const search = registerSearchPlan(query.search);
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (search.text)
    conditions.push(
      registerSearchMatch(
        Prisma.sql`search_text`,
        Prisma.sql`search_name`,
        search,
      ),
    );
  if (query.year)
    conditions.push(Prisma.sql`graduation_year = ${String(query.year)}`);
  if (query.major) conditions.push(contains(Prisma.sql`major`, query.major));
  if (query.decision)
    conditions.push(contains(Prisma.sql`decision_no`, query.decision));
  if (query.status) conditions.push(Prisma.sql`status = ${query.status}`);
  if (query.grade) conditions.push(Prisma.sql`grade = ${query.grade}`);
  if (query.issuedFrom)
    conditions.push(Prisma.sql`issued_on >= ${query.issuedFrom}`);
  if (query.issuedTo)
    conditions.push(Prisma.sql`issued_on <= ${query.issuedTo}`);

  return Prisma.sql`
    WITH ${registerSearchCandidates(institutionId, search)} source_entries AS (
      SELECT diploma.id, diploma.created_at,
        ${snapshotField('fullName', Prisma.sql`student.full_name`)} AS full_name,
        ${snapshotField('mssv', Prisma.sql`student.student_code`)} AS student_code,
        ${snapshotField('soHieu', Prisma.sql`diploma.certificate_no`)} AS certificate_no,
        ${snapshotField('soVaoSo', Prisma.sql`diploma.registry_no`)} AS registry_no,
        ${snapshotField('major', Prisma.sql`program.name`)} AS major,
        ${snapshotField(
          'grade',
          Prisma.sql`CASE graduation.classification
          WHEN 'EXCELLENT' THEN 'Xuất sắc' WHEN 'VERY_GOOD' THEN 'Giỏi'
          WHEN 'GOOD' THEN 'Khá' WHEN 'AVERAGE_GOOD' THEN 'Trung bình khá'
          WHEN 'AVERAGE' THEN 'Trung bình' END`,
        )} AS grade,
        ${snapshotField('namTotNghiep', Prisma.sql`graduation.graduation_year::text`)} AS graduation_year,
        ${snapshotField('decisionNo', Prisma.sql`decision.document_number`)} AS decision_no,
        ${snapshotField('issueDate', Prisma.sql`to_char(diploma.issued_on, 'YYYY-MM-DD')`)} AS issued_on,
        CASE diploma.status WHEN 'REVOKED' THEN 'REVOKED'
          WHEN 'SUPERSEDED' THEN 'REPLACED' ELSE 'ON_CHAIN' END AS status
      FROM diplomas diploma
      JOIN graduation_records graduation ON graduation.id = diploma.graduation_id
      JOIN students student ON student.id = graduation.student_id
      JOIN programs program ON program.id = graduation.program_id
      LEFT JOIN graduation_decisions decision ON decision.id = graduation.decision_id
      ${
        search.text
          ? Prisma.sql`JOIN diploma_versions version ON version.diploma_id = diploma.id`
          : Prisma.sql`JOIN LATERAL (
        SELECT id, payload FROM diploma_versions
        WHERE diploma_id = diploma.id ORDER BY version DESC LIMIT 1
      ) version ON TRUE`
      }
      WHERE diploma.institution_id = ${institutionId}::uuid
        ${
          search.text
            ? Prisma.sql`AND version.id IN (SELECT id FROM search_versions)
          AND NOT EXISTS (SELECT 1 FROM diploma_versions newer
            WHERE newer.diploma_id = diploma.id AND newer.version > version.version)`
            : Prisma.empty
        }
        AND diploma.workflow_status = 'APPROVED'
        AND diploma.status IN ('ACTIVE', 'REVOKED', 'SUPERSEDED')
        AND EXISTS (
          SELECT 1 FROM blockchain_anchors anchor
          WHERE anchor.version_id = version.id
            AND anchor.event_type = 'ISSUE' AND anchor.status = 'COMMITTED'
        )
    ), search_fields AS ${search.text ? Prisma.raw('MATERIALIZED') : Prisma.empty} (
      SELECT *, ${
        search.text
          ? Prisma.sql`
        public.diploma_search_normalize(full_name) AS search_name,
        public.diploma_search_normalize(student_code) AS search_student_code,
        public.diploma_search_normalize(certificate_no) AS search_certificate_no,
        public.diploma_search_normalize(registry_no) AS search_registry_no
      `
          : Prisma.sql`NULL::text AS search_name, NULL::text AS search_student_code,
        NULL::text AS search_certificate_no, NULL::text AS search_registry_no`
      }
      FROM source_entries
    ), entries AS (
      SELECT *, ${
        search.text
          ? Prisma.sql`coalesce(search_name, '') || ' ' || coalesce(search_student_code, '') || ' ' || coalesce(search_certificate_no, '') || ' ' || coalesce(search_registry_no, '')`
          : Prisma.sql`''::text`
      } AS search_text FROM search_fields
    ), filtered AS (
      SELECT *, ${registerSearchRank(search)} AS search_rank,
        ${search.fuzzy ? Prisma.sql`public.word_similarity(${search.text}, search_name)` : Prisma.sql`0::real`} AS search_similarity
      FROM entries WHERE ${Prisma.join(conditions, ' AND ')}
    )
  `;
}

export function registerQuery(institutionId: string, query: RegisterQueryDto) {
  return Prisma.sql`
    ${registerDataset(institutionId, query)}
    SELECT COUNT(*)::integer AS total,
      ARRAY(SELECT id FROM filtered ORDER BY search_rank, search_similarity DESC, created_at DESC, id DESC
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}) AS ids
    FROM filtered
  `;
}

export function registerSuggestionsQuery(
  institutionId: string,
  query: RegisterQueryDto,
) {
  return Prisma.sql`
    ${registerDataset(institutionId, query)}
    SELECT id AS uuid, full_name AS "fullName", student_code AS mssv,
      certificate_no AS "soHieu", registry_no AS "soVaoSo", major,
      graduation_year AS "namTotNghiep", status,
      CASE search_rank WHEN 0 THEN 'EXACT_CODE' WHEN 1 THEN 'EXACT_NAME'
        WHEN 5 THEN 'SIMILAR' ELSE 'PARTIAL' END AS "matchKind"
    FROM filtered ORDER BY search_rank, search_similarity DESC, created_at DESC, id DESC
    LIMIT 6
  `;
}

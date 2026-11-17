import { Prisma } from '../generated/prisma/client';
import {
  registerSearchMatch,
  registerSearchPlan,
  registerSearchRank,
} from './register-search';

export type PublicSearchScope = {
  institutionId?: string;
  campusId?: string;
  studentId?: string;
};

function snapshotField(field: string, fallback: Prisma.Sql) {
  return Prisma.sql`CASE WHEN version.payload ? ${field}
    THEN version.payload ->> ${field} ELSE ${fallback} END`;
}

export function publicSearchQuery(
  query: string,
  scope: PublicSearchScope = {},
) {
  const search = registerSearchPlan(query);
  const scopeConditions: Prisma.Sql[] = [];
  if (scope.institutionId)
    scopeConditions.push(
      Prisma.sql`diploma.institution_id = ${scope.institutionId}::uuid`,
    );
  if (scope.campusId)
    scopeConditions.push(
      Prisma.sql`diploma.campus_id = ${scope.campusId}::uuid`,
    );
  if (scope.studentId)
    scopeConditions.push(
      Prisma.sql`graduation.student_id = ${scope.studentId}::uuid`,
    );
  const scopeSql = scopeConditions.length
    ? Prisma.sql`AND ${Prisma.join(scopeConditions, ' AND ')}`
    : Prisma.empty;

  const candidates = search.text
    ? Prisma.sql`search_candidates AS MATERIALIZED (
        SELECT DISTINCT version.id AS version_id
        FROM diploma_versions version
        WHERE (
          ${registerSearchMatch(
            Prisma.sql`public.diploma_search_snapshot(version.payload)`,
            Prisma.sql`public.diploma_search_normalize(
              coalesce(version.payload ->> 'fullName', '')
            )`,
            search,
          )}
          OR NOT (
            version.payload ?& ARRAY['fullName', 'mssv', 'soHieu', 'soVaoSo']
          )
        )
      ),`
    : Prisma.empty;
  const candidateJoin = search.text
    ? Prisma.sql`JOIN search_candidates candidate ON candidate.version_id = version.id`
    : Prisma.empty;
  return Prisma.sql`
    WITH ${candidates} latest_versions AS (
      SELECT DISTINCT ON (diploma.id)
        diploma.id,
        diploma.created_at,
        ${snapshotField('fullName', Prisma.sql`student.full_name`)} AS full_name,
        ${snapshotField('mssv', Prisma.sql`student.student_code`)} AS student_code,
        ${snapshotField('soHieu', Prisma.sql`diploma.certificate_no`)} AS certificate_no,
        ${snapshotField('soVaoSo', Prisma.sql`diploma.registry_no`)} AS registry_no,
        version.id AS version_id
      FROM diplomas diploma
      JOIN graduation_records graduation ON graduation.id = diploma.graduation_id
      JOIN students student ON student.id = graduation.student_id
      JOIN LATERAL (
        SELECT id, version, payload
        FROM diploma_versions
        WHERE diploma_id = diploma.id
        ORDER BY version DESC
        LIMIT 1
      ) version ON TRUE
      ${candidateJoin}
      WHERE diploma.workflow_status = 'APPROVED'
        AND diploma.status = 'ACTIVE'
        ${scopeSql}
      ORDER BY diploma.id, version.version DESC
    ), published AS (
      SELECT latest.*
      FROM latest_versions latest
      WHERE EXISTS (
        SELECT 1
        FROM blockchain_anchors anchor
        WHERE anchor.version_id = latest.version_id
          AND anchor.event_type = 'ISSUE'
          AND anchor.status = 'COMMITTED'
      )
    ), search_fields AS (
      SELECT *,
        public.diploma_search_normalize(full_name) AS search_name,
        public.diploma_search_normalize(student_code) AS search_student_code,
        public.diploma_search_normalize(certificate_no) AS search_certificate_no,
        public.diploma_search_normalize(registry_no) AS search_registry_no,
        public.diploma_search_normalize(
          concat_ws(' ', full_name, student_code, certificate_no, registry_no)
        ) AS search_text
      FROM published
    ), filtered AS (
      SELECT *,
        ${registerSearchRank(search)} AS search_rank,
        ${
          search.fuzzy
            ? Prisma.sql`public.word_similarity(${search.text}, search_name)`
            : Prisma.sql`0::real`
        } AS search_similarity
      FROM search_fields
      WHERE ${registerSearchMatch(
        Prisma.sql`search_text`,
        Prisma.sql`search_name`,
        search,
      )}
    )
    SELECT id
    FROM filtered
    ORDER BY search_rank, search_similarity DESC, created_at DESC, id DESC
    LIMIT 20
  `;
}

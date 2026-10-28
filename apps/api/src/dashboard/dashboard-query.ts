import { Prisma } from '../generated/prisma/client';

function snapshot(field: string, fallback: Prisma.Sql) {
  return Prisma.sql`CASE WHEN version.payload ? ${field}
    THEN version.payload ->> ${field} ELSE ${fallback} END`;
}

export function dashboardQuery(institutionId: string, now: Date) {
  return Prisma.sql`
    WITH entries AS (
      SELECT diploma.id, diploma.status, diploma.workflow_status,
        anchor.status = 'COMMITTED' AS committed,
        anchor.committed_at,
        ${snapshot('fullName', Prisma.sql`student.full_name`)} AS full_name,
        ${snapshot('mssv', Prisma.sql`student.student_code`)} AS student_code,
        ${snapshot('soHieu', Prisma.sql`diploma.certificate_no`)} AS certificate_no,
        ${snapshot('major', Prisma.sql`program.name`)} AS major,
        ${snapshot('namTotNghiep', Prisma.sql`graduation.graduation_year::text`)} AS graduation_year
      FROM diplomas diploma
      JOIN graduation_records graduation ON graduation.id = diploma.graduation_id
      JOIN students student ON student.id = graduation.student_id
      JOIN programs program ON program.id = graduation.program_id
      LEFT JOIN LATERAL (
        SELECT id, payload FROM diploma_versions
        WHERE diploma_id = diploma.id ORDER BY version DESC LIMIT 1
      ) version ON TRUE
      LEFT JOIN blockchain_anchors anchor ON anchor.version_id = version.id
        AND anchor.event_type = 'ISSUE'
      WHERE diploma.institution_id = ${institutionId}::uuid
    ), published AS (
      SELECT * FROM entries WHERE workflow_status = 'APPROVED'
        AND status IN ('ACTIVE', 'REVOKED', 'SUPERSEDED') AND committed IS TRUE
    ), months AS (
      SELECT generate_series(
        date_trunc('month', ${now}::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '5 months',
        date_trunc('month', ${now}::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh'),
        interval '1 month'
      ) AS month
    )
    SELECT json_build_object(
      'totalRecords', (SELECT COUNT(*)::integer FROM entries),
      'draftRecords', (SELECT COUNT(*)::integer FROM entries WHERE workflow_status = 'DRAFT'),
      'requestedRecords', (SELECT COUNT(*)::integer FROM entries JOIN diplomas USING (id) WHERE entries.workflow_status = 'REQUESTED' AND supersedes_id IS NULL),
      'rejectedRecords', (SELECT COUNT(*)::integer FROM entries JOIN diplomas USING (id) WHERE entries.workflow_status = 'REJECTED' AND supersedes_id IS NULL),
      'replacementDrafts', (SELECT COUNT(*)::integer FROM entries JOIN diplomas USING (id) WHERE entries.workflow_status = 'DRAFT' AND supersedes_id IS NOT NULL),
      'replacementRejected', (SELECT COUNT(*)::integer FROM entries JOIN diplomas USING (id) WHERE entries.workflow_status = 'REJECTED' AND supersedes_id IS NOT NULL),
      'replacementRequested', (SELECT COUNT(*)::integer FROM entries JOIN diplomas USING (id) WHERE entries.workflow_status = 'REQUESTED' AND supersedes_id IS NOT NULL),
      'reopenedDrafts', (SELECT COUNT(*)::integer FROM entries WHERE workflow_status = 'DRAFT'
        AND EXISTS (SELECT 1 FROM diploma_events event WHERE event.diploma_id = entries.id AND event.event_type = 'REOPENED')),
      'pendingAnchoring', (SELECT COUNT(*)::integer FROM entries
        WHERE workflow_status = 'APPROVED' AND committed IS NOT TRUE),
      'registered', (SELECT COUNT(*)::integer FROM published),
      'active', (SELECT COUNT(*)::integer FROM published WHERE status = 'ACTIVE'),
      'revoked', (SELECT COUNT(*)::integer FROM published WHERE status = 'REVOKED'),
      'replaced', (SELECT COUNT(*)::integer FROM published WHERE status = 'SUPERSEDED'),
      'registeredThisMonth', (SELECT COUNT(*)::integer FROM published
        WHERE committed_at >= (SELECT MAX(month) FROM months) AT TIME ZONE 'Asia/Ho_Chi_Minh'
          AND committed_at < ((SELECT MAX(month) FROM months) + interval '1 month') AT TIME ZONE 'Asia/Ho_Chi_Minh'),
      'undatedRegistrations', (SELECT COUNT(*)::integer FROM published WHERE committed_at IS NULL)
    ) AS summary,
    (SELECT COALESCE(json_agg(grouped ORDER BY value DESC, name), '[]'::json) FROM (
      SELECT COALESCE(NULLIF(btrim(major), ''), 'Chưa ghi nhận ngành') AS name,
        COUNT(*)::integer AS value FROM published GROUP BY 1
    ) grouped) AS "byMajor",
    (SELECT COALESCE(json_agg(grouped ORDER BY name DESC), '[]'::json) FROM (
      SELECT COALESCE(NULLIF(btrim(graduation_year), ''), 'Chưa ghi nhận năm') AS name,
        COUNT(*)::integer AS value FROM published GROUP BY 1
    ) grouped) AS "byYear",
    (SELECT json_agg(grouped ORDER BY month) FROM (
      SELECT to_char(months.month, 'YYYY-MM') AS month, COUNT(published.id)::integer AS value
      FROM months LEFT JOIN published
        ON published.committed_at >= months.month AT TIME ZONE 'Asia/Ho_Chi_Minh'
        AND published.committed_at < (months.month + interval '1 month') AT TIME ZONE 'Asia/Ho_Chi_Minh'
      GROUP BY months.month
    ) grouped) AS "byMonth",
    (SELECT COALESCE(json_agg(recent ORDER BY "committedAt" DESC NULLS LAST, id), '[]'::json) FROM (
      SELECT id, full_name AS "fullName", student_code AS mssv,
        certificate_no AS "certificateNo", status, committed_at AS "committedAt"
      FROM published ORDER BY committed_at DESC NULLS LAST, id LIMIT 5
    ) recent) AS "recentIssued"
  `;
}

export function dashboardImportQuery(institutionId: string, campusId?: string) {
  return Prisma.sql`
    WITH batches AS (
      SELECT batch.id, document.file_name AS "fileName", batch.created_at AS "createdAt",
        COUNT(*) FILTER (WHERE row.status = 'NEEDS_REVIEW')::integer AS "needsReview",
        COUNT(*) FILTER (WHERE row.status = 'READY')::integer AS ready,
        COUNT(*) FILTER (WHERE row.status = 'IMPORTED' AND graduation.id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM diplomas WHERE graduation_id = graduation.id))::integer AS "graduationOnly",
        COUNT(*) FILTER (WHERE row.status = 'IMPORTED' AND EXISTS (
          SELECT 1 FROM diplomas WHERE graduation_id = graduation.id
            AND status = 'DRAFT' AND workflow_status = 'DRAFT'
            AND campus_id = batch.campus_id
            AND supersedes_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM diploma_events event WHERE event.diploma_id = diplomas.id AND event.event_type = 'REOPENED')
        ))::integer AS prepare
      FROM import_batches batch
      JOIN source_documents document ON document.id = batch.document_id
      LEFT JOIN import_rows row ON row.batch_id = batch.id
      LEFT JOIN graduation_records graduation ON graduation.source_row_id = row.id
      WHERE batch.institution_id = ${institutionId}::uuid
        ${campusId ? Prisma.sql`AND batch.campus_id = ${campusId}::uuid` : Prisma.empty}
      GROUP BY batch.id, document.file_name, batch.created_at
    )
    SELECT json_build_object(
      'needsReview', COALESCE(SUM("needsReview"), 0)::integer,
      'ready', COALESCE(SUM(ready), 0)::integer,
      'graduationOnly', COALESCE(SUM("graduationOnly"), 0)::integer,
      'prepare', COALESCE(SUM(prepare), 0)::integer
    ) AS counts,
    (SELECT COALESCE(json_agg(work ORDER BY "createdAt", id), '[]'::json) FROM (
      SELECT * FROM batches WHERE "needsReview" + ready + "graduationOnly" + prepare > 0
      ORDER BY "createdAt", id LIMIT 5
    ) work) AS batches FROM batches
  `;
}

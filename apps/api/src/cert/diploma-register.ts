import { Prisma } from '../generated/prisma/client';
import type { RegisterQueryDto } from './register-query.dto';

function snapshotField(field: string, fallback: Prisma.Sql) {
  return Prisma.sql`CASE WHEN version.payload ? ${field}
    THEN version.payload ->> ${field} ELSE ${fallback} END`;
}

function contains(field: Prisma.Sql, value: string) {
  const pattern = '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
  return Prisma.sql`${field} ILIKE ${pattern}`;
}

export function registerQuery(institutionId: string, query: RegisterQueryDto) {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (query.search)
    conditions.push(
      Prisma.sql`(${Prisma.join(
        [
          Prisma.sql`full_name`,
          Prisma.sql`student_code`,
          Prisma.sql`certificate_no`,
          Prisma.sql`registry_no`,
        ].map((field) => contains(field, query.search!)),
        ' OR ',
      )})`,
    );
  if (query.year)
    conditions.push(Prisma.sql`graduation_year = ${String(query.year)}`);
  if (query.major) conditions.push(contains(Prisma.sql`major`, query.major));
  if (query.decision)
    conditions.push(contains(Prisma.sql`decision_no`, query.decision));
  if (query.status) conditions.push(Prisma.sql`status = ${query.status}`);
  if (query.issuedFrom)
    conditions.push(Prisma.sql`issued_on >= ${query.issuedFrom}`);
  if (query.issuedTo)
    conditions.push(Prisma.sql`issued_on <= ${query.issuedTo}`);

  return Prisma.sql`
    WITH entries AS (
      SELECT diploma.id, diploma.created_at,
        ${snapshotField('fullName', Prisma.sql`student.full_name`)} AS full_name,
        ${snapshotField('mssv', Prisma.sql`student.student_code`)} AS student_code,
        ${snapshotField('soHieu', Prisma.sql`diploma.certificate_no`)} AS certificate_no,
        ${snapshotField('soVaoSo', Prisma.sql`diploma.registry_no`)} AS registry_no,
        ${snapshotField('major', Prisma.sql`program.name`)} AS major,
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
      JOIN LATERAL (
        SELECT id, payload FROM diploma_versions
        WHERE diploma_id = diploma.id ORDER BY version DESC LIMIT 1
      ) version ON TRUE
      WHERE diploma.institution_id = ${institutionId}::uuid
        AND diploma.workflow_status = 'APPROVED'
        AND diploma.status IN ('ACTIVE', 'REVOKED', 'SUPERSEDED')
        AND EXISTS (
          SELECT 1 FROM blockchain_anchors anchor
          WHERE anchor.version_id = version.id
            AND anchor.event_type = 'ISSUE' AND anchor.status = 'COMMITTED'
        )
    ), filtered AS (
      SELECT * FROM entries WHERE ${Prisma.join(conditions, ' AND ')}
    )
    SELECT COUNT(*)::integer AS total,
      ARRAY(SELECT id FROM filtered ORDER BY created_at DESC, id DESC
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}) AS ids
    FROM filtered
  `;
}

import { Prisma } from '../generated/prisma/client';
import { normalizeText } from '../database/data-utils';
import {
  diplomaProjection,
  type DiplomaWithRelations,
} from '../database/diploma-projection';
import type { LookupDiplomaDto } from './lookup-diploma.dto';

const accentedLetters =
  'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';

export function diplomaLookupProjection(diploma: DiplomaWithRelations) {
  const result = diplomaProjection(diploma);
  return {
    uuid: result.uuid,
    fullName: result.fullName,
    mssv: result.mssv,
    major: result.major,
    degreeType: result.degreeType,
    grade: result.grade,
    namTotNghiep: result.namTotNghiep,
    soHieu: result.soHieu,
    soVaoSo: result.soVaoSo,
    className: result.className,
    issueDate: result.issueDate,
    decisionNo: result.decisionNo,
    decisionDate: result.decisionDate,
    status: result.status,
  };
}

export function lookupName(value: string) {
  return normalizeText(value)
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function normalizedField(field: Prisma.Sql) {
  return Prisma.sql`translate(lower(regexp_replace(btrim(${field}), '[[:space:]]+', ' ', 'g')),
    ${accentedLetters}, ${lookupName(accentedLetters)})`;
}

function snapshotField(field: string, fallback: Prisma.Sql) {
  return Prisma.sql`CASE WHEN version.payload ? ${field}
    THEN version.payload ->> ${field} ELSE ${fallback} END`;
}

export function diplomaLookupQuery(query: LookupDiplomaDto) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`${normalizedField(Prisma.sql`full_name`)} = ${lookupName(query.fullName)}`,
    Prisma.sql`birth_date = ${query.dob}`,
  ];
  for (const [field, value] of [
    [Prisma.sql`student_code`, query.mssv],
    [Prisma.sql`certificate_no`, query.soHieu],
    [Prisma.sql`registry_no`, query.soVaoSo],
    [Prisma.sql`class_name`, query.className],
    [Prisma.sql`decision_no`, query.decisionNo],
  ] as const) {
    if (value) conditions.push(Prisma.sql`lower(${field}) = lower(${value})`);
  }
  if (query.major)
    conditions.push(
      Prisma.sql`${normalizedField(Prisma.sql`major`)} = ${lookupName(query.major)}`,
    );
  for (const [field, value] of [
    [Prisma.sql`degree_type`, query.degreeType],
    [Prisma.sql`graduation_year`, query.namTotNghiep],
    [Prisma.sql`grade`, query.grade],
    [Prisma.sql`issued_on`, query.issueDate],
    [Prisma.sql`decision_date`, query.decisionDate],
  ] as const) {
    if (value !== undefined && value !== null)
      conditions.push(Prisma.sql`${field} = ${String(value)}`);
  }
  if (query.gpa !== undefined)
    conditions.push(Prisma.sql`NULLIF(gpa, '')::numeric = ${query.gpa}`);

  return Prisma.sql`
    WITH published AS (
      SELECT diploma.id, diploma.created_at,
        ${snapshotField('fullName', Prisma.sql`student.full_name`)} AS full_name,
        ${snapshotField('dob', Prisma.sql`to_char(student.date_of_birth, 'YYYY-MM-DD')`)} AS birth_date,
        ${snapshotField('mssv', Prisma.sql`student.student_code`)} AS student_code,
        ${snapshotField('soHieu', Prisma.sql`diploma.certificate_no`)} AS certificate_no,
        ${snapshotField('soVaoSo', Prisma.sql`diploma.registry_no`)} AS registry_no,
        ${snapshotField('className', Prisma.sql`academic_class.code`)} AS class_name,
        ${snapshotField('major', Prisma.sql`program.name`)} AS major,
        ${snapshotField('degreeType', Prisma.sql`graduation.degree_type::text`)} AS degree_type,
        ${snapshotField('namTotNghiep', Prisma.sql`graduation.graduation_year::text`)} AS graduation_year,
        ${snapshotField(
          'grade',
          Prisma.sql`CASE graduation.classification
          WHEN 'EXCELLENT' THEN 'Xuất sắc' WHEN 'VERY_GOOD' THEN 'Giỏi'
          WHEN 'GOOD' THEN 'Khá' WHEN 'AVERAGE_GOOD' THEN 'Trung bình khá'
          WHEN 'AVERAGE' THEN 'Trung bình' END`,
        )} AS grade,
        ${snapshotField('gpa', Prisma.sql`graduation.gpa::text`)} AS gpa,
        ${snapshotField('issueDate', Prisma.sql`to_char(diploma.issued_on, 'YYYY-MM-DD')`)} AS issued_on,
        ${snapshotField('decisionNo', Prisma.sql`decision.document_number`)} AS decision_no,
        ${snapshotField('decisionDate', Prisma.sql`to_char(decision.signed_on, 'YYYY-MM-DD')`)} AS decision_date
      FROM diplomas diploma
      JOIN graduation_records graduation ON graduation.id = diploma.graduation_id
      JOIN students student ON student.id = graduation.student_id
      JOIN programs program ON program.id = graduation.program_id
      LEFT JOIN enrollments enrollment ON enrollment.id = graduation.enrollment_id
      LEFT JOIN academic_classes academic_class ON academic_class.id = enrollment.class_id
      LEFT JOIN graduation_decisions decision ON decision.id = graduation.decision_id
      JOIN LATERAL (
        SELECT id, payload FROM diploma_versions
        WHERE diploma_id = diploma.id ORDER BY version DESC LIMIT 1
      ) version ON TRUE
      WHERE diploma.workflow_status = 'APPROVED'
        AND diploma.status IN ('ACTIVE', 'REVOKED', 'SUPERSEDED')
        AND EXISTS (
          SELECT 1 FROM blockchain_anchors anchor
          WHERE anchor.version_id = version.id
            AND anchor.event_type = 'ISSUE' AND anchor.status = 'COMMITTED'
        )
    )
    SELECT id FROM published WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY created_at DESC, id DESC LIMIT 20
  `;
}

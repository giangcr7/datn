import { Prisma } from '../generated/prisma/client';
import { registerDataset } from '../cert/diploma-register';
import type { RegisterQueryDto } from '../cert/register-query.dto';

export interface ReportGroup {
  name: string;
  total: number;
  active: number;
  revoked: number;
  replaced: number;
}

export interface ReportStatistics {
  summary: Omit<ReportGroup, 'name'>;
  byYear: ReportGroup[];
  byMajor: ReportGroup[];
  byGrade: ReportGroup[];
  byStatus: ReportGroup[];
}

function counts() {
  return Prisma.sql`COUNT(*)::integer AS total,
    COUNT(*) FILTER (WHERE status = 'ON_CHAIN')::integer AS active,
    COUNT(*) FILTER (WHERE status = 'REVOKED')::integer AS revoked,
    COUNT(*) FILTER (WHERE status = 'REPLACED')::integer AS replaced`;
}

function groups(field: Prisma.Sql) {
  return Prisma.sql`(SELECT COALESCE(json_agg(grouped ORDER BY total DESC, name), '[]'::json)
    FROM (SELECT COALESCE(NULLIF(${field}, ''), 'Chưa ghi nhận') AS name,
      ${counts()} FROM filtered GROUP BY 1) grouped)`;
}

export function statisticsQuery(
  institutionId: string,
  query: RegisterQueryDto,
) {
  return Prisma.sql`
    ${registerDataset(institutionId, query)}
    SELECT
      (SELECT row_to_json(totals) FROM (SELECT ${counts()} FROM filtered) totals) AS summary,
      ${groups(Prisma.sql`graduation_year`)} AS "byYear",
      ${groups(Prisma.sql`major`)} AS "byMajor",
      ${groups(Prisma.sql`grade`)} AS "byGrade",
      ${groups(Prisma.sql`status`)} AS "byStatus"
  `;
}

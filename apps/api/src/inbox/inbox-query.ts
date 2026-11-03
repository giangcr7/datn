import type { AuthActor } from '../auth/auth-actor';
import { Prisma } from '../generated/prisma/client';
import { OUTBOX_MAX_ATTEMPTS } from '../outbox/outbox-policy';

export function inboxQuery(actor: AuthActor, now: Date) {
  const schoolScope = Prisma.sql`d.institution_id = ${actor.institutionId}::uuid AND (${actor.role === 'admin'} OR d.campus_id = ${actor.campusId}::uuid)`;
  const officer = actor.role === 'university';
  const technical = actor.role !== 'student';
  const studentScope = Prisma.sql`${actor.role === 'student'} AND d.institution_id = ${actor.institutionId}::uuid
    AND r.requester_id = ${actor.id}::uuid AND g.student_id = ${actor.studentId}::uuid`;
  const delayedBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const resultsAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return Prisma.sql`
    WITH tasks AS (
      SELECT CASE WHEN d.supersedes_id IS NULL THEN 'approvals' ELSE 'replacement-approvals' END AS key, d.id, d.updated_at::text AS token FROM diplomas d
      WHERE ${officer} AND ${schoolScope} AND d.workflow_status = 'REQUESTED'
      UNION ALL
      SELECT CASE WHEN d.supersedes_id IS NULL THEN 'rejected' ELSE 'replacement-rejected' END, d.id, d.updated_at::text FROM diplomas d
      WHERE ${officer} AND ${schoolScope} AND d.workflow_status = 'REJECTED'
      UNION ALL
      SELECT 'requests', r.id, r.revision::text FROM diploma_change_requests r JOIN diplomas d ON d.id = r.diploma_id
      WHERE ${officer} AND ${schoolScope} AND r.status IN ('PENDING','IN_REVIEW')
      UNION ALL
      SELECT 'blockchain-failed', a.id, a.status::text || ':' || COALESCE(e.status::text,'') || ':' || COALESCE(e.attempts::text,'')
      FROM blockchain_anchors a JOIN diploma_versions v ON v.id = a.version_id JOIN diplomas d ON d.id = v.diploma_id
      LEFT JOIN outbox_events e ON e.version_id = a.version_id AND e.event_type = a.event_type
      WHERE ${technical} AND ${schoolScope} AND a.event_type IN ('ISSUE','REVOKE')
        AND (a.status = 'FAILED' OR e.status = 'FAILED' OR (e.attempts >= ${OUTBOX_MAX_ATTEMPTS} AND e.status <> 'COMPLETED' AND (e.status = 'PENDING' OR e.locked_until <= ${now})))
      UNION ALL
      SELECT 'blockchain-delayed', a.id, a.status::text FROM blockchain_anchors a
      JOIN diploma_versions v ON v.id = a.version_id JOIN diplomas d ON d.id = v.diploma_id
      LEFT JOIN outbox_events e ON e.version_id = a.version_id AND e.event_type = a.event_type
      WHERE ${technical} AND ${schoolScope} AND a.event_type IN ('ISSUE','REVOKE')
        AND a.status IN ('QUEUED','SUBMITTED') AND a.created_at <= ${delayedBefore}
        AND (e.id IS NULL OR (e.status <> 'FAILED' AND e.attempts < ${OUTBOX_MAX_ATTEMPTS}))
      UNION ALL
      SELECT CASE r.status WHEN 'NEEDS_INFORMATION' THEN 'student-supplement' WHEN 'IN_REVIEW' THEN 'student-review' ELSE 'student-results' END,
        r.id, r.revision::text FROM diploma_change_requests r JOIN diplomas d ON d.id = r.diploma_id
      JOIN graduation_records g ON g.id = d.graduation_id
      WHERE ${studentScope} AND (r.status IN ('NEEDS_INFORMATION','IN_REVIEW') OR (r.status IN ('RESOLVED','REJECTED') AND r.updated_at >= ${resultsAfter}))
    )
    SELECT key, count(*)::int AS count, md5(string_agg(id::text || ':' || token, ',' ORDER BY id)) AS version
    FROM tasks GROUP BY key ORDER BY key
  `;
}

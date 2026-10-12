import { config } from 'dotenv';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Client } from 'pg';

config({ path: join(__dirname, '../.env') });
const database = new Client({ connectionString: process.env.DATABASE_URL });
let checks = 0;
async function reject(
  label: string,
  sql: string,
  values: unknown[],
  codes: string[],
) {
  await database.query('SAVEPOINT validation_case');
  let rejected = false;
  try {
    await database.query(sql, values);
  } catch (error: any) {
    assert(
      codes.includes(error.code),
      label + ': unexpected SQLSTATE ' + error.code,
    );
    rejected = true;
  }
  await database.query('ROLLBACK TO SAVEPOINT validation_case');
  await database.query('RELEASE SAVEPOINT validation_case');
  assert(rejected, label + ': database accepted invalid data');
  checks++;
}
async function main() {
  await database.connect();
  await database.query('BEGIN');
  try {
    const roleFlags = (
      await database.query(
        "SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN ('diplomachain_app','diplomachain_migrator')",
      )
    ).rows;
    assert.equal(roleFlags.length, 2);
    for (const role of roleFlags) {
      assert.equal(role.rolsuper, false);
      assert.equal(role.rolcreatedb, false);
      assert.equal(role.rolcreaterole, false);
      assert.equal(role.rolreplication, false);
      assert.equal(role.rolbypassrls, false);
      checks++;
    }
    const institutionId = randomUUID(),
      otherInstitutionId = randomUUID(),
      campusId = randomUUID(),
      otherCampusId = randomUUID(),
      programId = randomUUID(),
      otherProgramId = randomUUID(),
      studentId = randomUUID(),
      enrollmentId = randomUUID(),
      graduationId = randomUUID(),
      diplomaId = randomUUID(),
      accountId = randomUUID(),
      versionId = randomUUID(),
      documentId = randomUUID(),
      batchId = randomUUID(),
      rowId = randomUUID(),
      outboxId = randomUUID();
    const suffix = randomUUID().slice(0, 8);
    await database.query(
      'INSERT INTO institutions(id,code,name) VALUES ($1,$2,$3),($4,$5,$6)',
      [
        institutionId,
        'TEST_' + suffix,
        'Test institution',
        otherInstitutionId,
        'OTHER_' + suffix,
        'Other test institution',
      ],
    );
    await database.query(
      'INSERT INTO campuses(id,institution_id,code,name) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',
      [
        campusId,
        institutionId,
        'TEST',
        'Test campus',
        otherCampusId,
        otherInstitutionId,
        'OTHER',
        'Other campus',
      ],
    );
    await database.query(
      'INSERT INTO programs(id,institution_id,code,name) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',
      [
        programId,
        institutionId,
        'TEST',
        'Test program',
        otherProgramId,
        otherInstitutionId,
        'OTHER',
        'Other program',
      ],
    );
    await database.query(
      'INSERT INTO students(id,institution_id,student_code,full_name,updated_at) VALUES ($1,$2,$3,$4,now())',
      [studentId, institutionId, '0012345678', 'Test student'],
    );
    await database.query(
      'INSERT INTO accounts(id,email,password_hash,display_name,updated_at) VALUES ($1,$2,$3,$4,now())',
      [
        accountId,
        suffix + '@example.invalid',
        'test-only-rollback',
        'Test account',
      ],
    );
    await reject(
      'cross-institution enrollment',
      'INSERT INTO enrollments(student_id,program_id,campus_id) VALUES ($1,$2,$3)',
      [studentId, otherProgramId, campusId],
      ['23514'],
    );
    await database.query(
      'INSERT INTO enrollments(id,student_id,program_id,campus_id) VALUES ($1,$2,$3,$4)',
      [enrollmentId, studentId, programId, campusId],
    );
    await reject(
      'NULL-safe enrollment uniqueness',
      'INSERT INTO enrollments(student_id,program_id,campus_id) VALUES ($1,$2,$3)',
      [studentId, programId, campusId],
      ['23505'],
    );
    await reject(
      'GPA outside scale',
      'INSERT INTO graduation_records(institution_id,student_id,program_id,graduation_year,gpa) VALUES ($1,$2,$3,2025,4.01)',
      [institutionId, studentId, programId],
      ['23514'],
    );
    await reject(
      'cross-institution graduation',
      'INSERT INTO graduation_records(institution_id,student_id,program_id,graduation_year) VALUES ($1,$2,$3,2025)',
      [otherInstitutionId, studentId, otherProgramId],
      ['23503'],
    );
    await database.query(
      'INSERT INTO graduation_records(id,institution_id,student_id,program_id,enrollment_id,graduation_year,gpa) VALUES ($1,$2,$3,$4,$5,2025,2.52)',
      [graduationId, institutionId, studentId, programId, enrollmentId],
    );
    await reject(
      'graduation identity uniqueness',
      'INSERT INTO graduation_records(institution_id,student_id,program_id,graduation_year) VALUES ($1,$2,$3,2025)',
      [institutionId, studentId, programId],
      ['23505'],
    );
    assert.equal(
      (
        await database.query('SELECT student_code FROM students WHERE id=$1', [
          studentId,
        ])
      ).rows[0].student_code,
      '0012345678',
    );
    checks++;
    assert.equal(
      (
        await database.query('SELECT gpa FROM graduation_records WHERE id=$1', [
          graduationId,
        ])
      ).rows[0].gpa,
      '2.52',
    );
    checks++;
    await reject(
      'wrong campus diploma',
      'INSERT INTO diplomas(institution_id,campus_id,graduation_id,certificate_no,registry_no,updated_at) VALUES ($1,$2,$3,$4,$5,now())',
      [institutionId, otherCampusId, graduationId, 'CERT_BAD', 'REG_BAD'],
      ['23514', '23503'],
    );
    await reject(
      'maker checker separation',
      'INSERT INTO diplomas(institution_id,campus_id,graduation_id,certificate_no,registry_no,requested_by_id,approved_by_id,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6,now())',
      [
        institutionId,
        campusId,
        graduationId,
        'CERT_SAME',
        'REG_SAME',
        accountId,
      ],
      ['23514'],
    );
    await database.query(
      'INSERT INTO diplomas(id,institution_id,campus_id,graduation_id,certificate_no,registry_no,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())',
      [
        diplomaId,
        institutionId,
        campusId,
        graduationId,
        'CERT_' + suffix,
        'REG_' + suffix,
      ],
    );
    await reject(
      'future issue date',
      'UPDATE diplomas SET issued_on=$1 WHERE id=$2',
      ['2049-01-01', diplomaId],
      ['23514'],
    );
    await reject(
      'request must identify maker',
      "UPDATE diplomas SET workflow_status='REQUESTED' WHERE id=$1",
      [diplomaId],
      ['23514'],
    );
    await reject(
      'one open diploma per graduation',
      'INSERT INTO diplomas(institution_id,campus_id,graduation_id,certificate_no,registry_no,updated_at) VALUES ($1,$2,$3,$4,$5,now())',
      [institutionId, campusId, graduationId, 'CERT_OTHER', 'REG_OTHER'],
      ['23505'],
    );
    await database.query(
      'INSERT INTO diploma_versions(id,diploma_id,version,schema_version,payload,payload_hash) VALUES ($1,$2,1,$3,$4,$5)',
      [versionId, diplomaId, 'diploma-v1', '{}', 'a'.repeat(64)],
    );
    await reject(
      'snapshot immutable/runtime privilege',
      'UPDATE diploma_versions SET payload=$1 WHERE id=$2',
      ['{"tampered":true}', versionId],
      ['42501', '23514'],
    );
    await database.query(
      'INSERT INTO audit_logs(actor_email,action,result) VALUES ($1,$2,$3)',
      ['test@example.invalid', 'TEST_ROLLBACK', 'SUCCESS'],
    );
    await reject(
      'audit append only',
      'UPDATE audit_logs SET action=$1 WHERE actor_email=$2',
      ['TAMPERED', 'test@example.invalid'],
      ['42501', '23514'],
    );
    await reject(
      'runtime cannot create schema tables',
      'CREATE TABLE public.forbidden_runtime_test(id integer)',
      [],
      ['42501'],
    );
    await database.query(
      'INSERT INTO source_documents(id,institution_id,file_name,sha256,byte_size,media_type,storage_key) VALUES ($1,$2,$3,$4,100,$5,$6)',
      [
        documentId,
        institutionId,
        'test.xlsx',
        'a'.repeat(64),
        'application/test',
        institutionId + '/test.xlsx',
      ],
    );
    await database.query(
      'INSERT INTO import_batches(id,institution_id,campus_id,document_id,mapping_version,total_rows,created_by_id) VALUES ($1,$2,$3,$4,$5,1,$6)',
      [batchId, institutionId, campusId, documentId, 'TEST', accountId],
    );
    await database.query(
      'INSERT INTO import_rows(id,batch_id,sheet_name,row_number,raw_data,normalized_data) VALUES ($1,$2,$3,2,$4,$5)',
      [rowId, batchId, 'TEST', '{"A2":1}', '{}'],
    );
    await reject(
      'source row immutable',
      'UPDATE import_rows SET raw_data=$1 WHERE id=$2',
      ['{"A2":2}', rowId],
      ['23514'],
    );
    await database.query(
      'INSERT INTO outbox_events(id,version_id,event_type,payload) VALUES ($1,$2,$3,$4)',
      [outboxId, versionId, 'ISSUE', '{}'],
    );
    await reject(
      'outbox idempotency key',
      'INSERT INTO outbox_events(version_id,event_type,payload) VALUES ($1,$2,$3)',
      [versionId, 'ISSUE', '{}'],
      ['23505'],
    );
    await reject(
      'outbox payload immutable',
      'UPDATE outbox_events SET payload=$1 WHERE id=$2',
      ['{"tampered":true}', outboxId],
      ['23514'],
    );
    console.log(
      'Database checks passed: ' +
        checks +
        '. All fixtures rolled back; no production/user rows changed.',
    );
  } finally {
    await database.query('ROLLBACK');
    await database.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

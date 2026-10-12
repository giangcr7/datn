DROP INDEX "graduation_records_student_id_program_id_graduation_year_idx";
CREATE UNIQUE INDEX "graduation_records_student_id_program_id_graduation_year_key" ON "graduation_records" ("student_id", "program_id", "graduation_year");
ALTER TABLE diplomas ADD CONSTRAINT diploma_issued_on_valid CHECK (issued_on IS NULL OR issued_on BETWEEN DATE '1900-01-01' AND CURRENT_DATE);
ALTER TABLE diplomas ADD CONSTRAINT diploma_request_actor_valid CHECK (workflow_status NOT IN ('REQUESTED', 'APPROVED') OR (requested_by_id IS NOT NULL AND requested_at IS NOT NULL));
ALTER TABLE diplomas ADD CONSTRAINT diploma_approved_actor_valid CHECK (workflow_status <> 'APPROVED' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL AND approved_by_id <> requested_by_id));
ALTER DEFAULT PRIVILEGES FOR ROLE diplomachain_migrator IN SCHEMA public REVOKE DELETE ON TABLES FROM diplomachain_app;

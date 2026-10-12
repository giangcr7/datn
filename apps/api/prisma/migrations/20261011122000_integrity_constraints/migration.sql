ALTER TABLE campuses ADD CONSTRAINT campuses_scope_key UNIQUE (id, institution_id);
ALTER TABLE programs ADD CONSTRAINT programs_scope_key UNIQUE (id, institution_id);
ALTER TABLE students ADD CONSTRAINT students_scope_key UNIQUE (id, institution_id);
ALTER TABLE graduation_decisions ADD CONSTRAINT decisions_scope_key UNIQUE (id, institution_id);
ALTER TABLE graduation_records ADD CONSTRAINT graduations_scope_key UNIQUE (id, institution_id);
ALTER TABLE source_documents ADD CONSTRAINT source_documents_scope_key UNIQUE (id, institution_id);
ALTER TABLE account_memberships ADD CONSTRAINT memberships_account_key UNIQUE (id, account_id);

ALTER TABLE program_aliases ADD CONSTRAINT aliases_program_scope FOREIGN KEY (program_id, institution_id) REFERENCES programs (id, institution_id);
ALTER TABLE graduation_records ADD CONSTRAINT graduation_student_scope FOREIGN KEY (student_id, institution_id) REFERENCES students (id, institution_id);
ALTER TABLE graduation_records ADD CONSTRAINT graduation_program_scope FOREIGN KEY (program_id, institution_id) REFERENCES programs (id, institution_id);
ALTER TABLE graduation_records ADD CONSTRAINT graduation_decision_scope FOREIGN KEY (decision_id, institution_id) REFERENCES graduation_decisions (id, institution_id);
ALTER TABLE graduation_decisions ADD CONSTRAINT decision_document_scope FOREIGN KEY (source_document_id, institution_id) REFERENCES source_documents (id, institution_id);
ALTER TABLE diplomas ADD CONSTRAINT diploma_campus_scope FOREIGN KEY (campus_id, institution_id) REFERENCES campuses (id, institution_id);
ALTER TABLE diplomas ADD CONSTRAINT diploma_graduation_scope FOREIGN KEY (graduation_id, institution_id) REFERENCES graduation_records (id, institution_id);
ALTER TABLE import_batches ADD CONSTRAINT import_document_scope FOREIGN KEY (document_id, institution_id) REFERENCES source_documents (id, institution_id);
ALTER TABLE import_batches ADD CONSTRAINT import_campus_scope FOREIGN KEY (campus_id, institution_id) REFERENCES campuses (id, institution_id);
ALTER TABLE refresh_sessions ADD CONSTRAINT refresh_membership_account FOREIGN KEY (membership_id, account_id) REFERENCES account_memberships (id, account_id);

ALTER TABLE students ADD CONSTRAINT student_code_nonempty CHECK (length(trim(student_code)) > 0);
ALTER TABLE students ADD CONSTRAINT student_name_nonempty CHECK (length(trim(full_name)) > 0);
ALTER TABLE students ADD CONSTRAINT student_dob_valid CHECK (date_of_birth IS NULL OR date_of_birth BETWEEN DATE '1900-01-01' AND CURRENT_DATE);
ALTER TABLE graduation_records ADD CONSTRAINT graduation_gpa_valid CHECK (gpa_scale IN (4, 10) AND (gpa IS NULL OR gpa BETWEEN 0 AND gpa_scale));
ALTER TABLE graduation_records ADD CONSTRAINT graduation_year_valid CHECK (graduation_year BETWEEN 1900 AND 2200);
ALTER TABLE graduation_decisions ADD CONSTRAINT decision_year_valid CHECK (decision_year BETWEEN 1900 AND 2200 AND (signed_on IS NULL OR EXTRACT(YEAR FROM signed_on) = decision_year));
ALTER TABLE diplomas ADD CONSTRAINT diploma_numbers_nonempty CHECK (length(trim(certificate_no)) > 0 AND length(trim(registry_no)) > 0);
ALTER TABLE diplomas ADD CONSTRAINT diploma_version_positive CHECK (current_version > 0);
ALTER TABLE diplomas ADD CONSTRAINT diploma_maker_checker CHECK (approved_by_id IS NULL OR requested_by_id IS NULL OR approved_by_id <> requested_by_id);
ALTER TABLE diplomas ADD CONSTRAINT diploma_approval_valid CHECK (status <> 'ACTIVE' OR (workflow_status = 'APPROVED' AND issued_on IS NOT NULL AND approved_at IS NOT NULL));
ALTER TABLE diplomas ADD CONSTRAINT diploma_revocation_valid CHECK (status <> 'REVOKED' OR (revoked_at IS NOT NULL AND length(trim(revoked_reason)) > 0));
ALTER TABLE diplomas ADD CONSTRAINT diploma_no_self_replacement CHECK (supersedes_id IS NULL OR supersedes_id <> id);
ALTER TABLE diploma_versions ADD CONSTRAINT diploma_payload_valid CHECK (version > 0 AND jsonb_typeof(payload) = 'object' AND payload_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE blockchain_anchors ADD CONSTRAINT anchor_hash_valid CHECK (payload_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE blockchain_anchors ADD CONSTRAINT committed_anchor_valid CHECK (status <> 'COMMITTED' OR (transaction_id IS NOT NULL AND committed_at IS NOT NULL));
ALTER TABLE outbox_events ADD CONSTRAINT outbox_valid CHECK (attempts >= 0 AND jsonb_typeof(payload) = 'object' AND event_type IN ('ISSUE', 'REVOKE'));
ALTER TABLE source_documents ADD CONSTRAINT source_document_valid CHECK (byte_size > 0 AND sha256 ~ '^[0-9a-f]{64}$' AND length(storage_key) > 0);
ALTER TABLE import_batches ADD CONSTRAINT import_counts_valid CHECK (total_rows >= 0 AND imported_rows BETWEEN 0 AND total_rows);
ALTER TABLE import_rows ADD CONSTRAINT import_row_valid CHECK (row_number > 0 AND jsonb_typeof(raw_data) = 'object' AND jsonb_typeof(normalized_data) = 'object' AND (overrides IS NULL OR jsonb_typeof(overrides) = 'object'));
ALTER TABLE accounts ADD CONSTRAINT account_email_normalized CHECK (email = lower(trim(email)) AND length(email) > 3);
ALTER TABLE accounts ADD CONSTRAINT account_session_version_valid CHECK (session_version >= 0);
ALTER TABLE otp_challenges ADD CONSTRAINT otp_attempts_valid CHECK (attempts BETWEEN 0 AND 5 AND expires_at > created_at AND code_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE refresh_sessions ADD CONSTRAINT refresh_token_valid CHECK (expires_at > created_at AND token_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE audit_logs ADD CONSTRAINT audit_result_valid CHECK (result IN ('SUCCESS', 'FAILED'));

CREATE UNIQUE INDEX one_open_diploma_per_graduation ON diplomas (graduation_id) WHERE status IN ('DRAFT', 'ACTIVE') AND workflow_status <> 'REJECTED';
CREATE UNIQUE INDEX one_open_integrity_alert ON integrity_alerts (diploma_id, type) WHERE resolved_at IS NULL;
CREATE UNIQUE INDEX enrollment_identity_key ON enrollments (student_id, program_id, campus_id, class_id) NULLS NOT DISTINCT;

CREATE FUNCTION validate_academic_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_institution uuid; target_campus uuid; related record;
BEGIN
  IF TG_TABLE_NAME = 'enrollments' THEN
    SELECT institution_id INTO target_institution FROM students WHERE id = NEW.student_id;
    IF NOT EXISTS (SELECT 1 FROM programs WHERE id = NEW.program_id AND institution_id = target_institution)
       OR NOT EXISTS (SELECT 1 FROM campuses WHERE id = NEW.campus_id AND institution_id = target_institution)
       OR (NEW.class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM academic_classes WHERE id = NEW.class_id AND campus_id = NEW.campus_id)) THEN
      RAISE EXCEPTION 'Enrollment scope mismatch' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'graduation_records' THEN
    IF NEW.enrollment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM enrollments WHERE id = NEW.enrollment_id AND student_id = NEW.student_id AND program_id = NEW.program_id) THEN
      RAISE EXCEPTION 'Graduation enrollment mismatch' USING ERRCODE = '23514';
    END IF;
    IF NEW.source_row_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM import_rows r JOIN import_batches b ON b.id = r.batch_id WHERE r.id = NEW.source_row_id AND b.institution_id = NEW.institution_id) THEN
      RAISE EXCEPTION 'Graduation source scope mismatch' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'diplomas' THEN
    SELECT e.campus_id INTO target_campus FROM graduation_records g JOIN enrollments e ON e.id = g.enrollment_id WHERE g.id = NEW.graduation_id;
    IF target_campus IS NOT NULL AND target_campus <> NEW.campus_id THEN
      RAISE EXCEPTION 'Diploma campus mismatch' USING ERRCODE = '23514';
    END IF;
    IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM diplomas WHERE id = NEW.supersedes_id AND institution_id = NEW.institution_id AND graduation_id = NEW.graduation_id) THEN
      RAISE EXCEPTION 'Replacement scope mismatch' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'account_memberships' THEN
    SELECT s.institution_id INTO target_institution FROM accounts a JOIN students s ON s.id = a.student_id WHERE a.id = NEW.account_id;
    IF target_institution IS NOT NULL AND NOT EXISTS (SELECT 1 FROM campuses WHERE id = NEW.campus_id AND institution_id = target_institution) THEN
      RAISE EXCEPTION 'Student membership scope mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enrollments_links BEFORE INSERT OR UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION validate_academic_links();
CREATE TRIGGER graduations_links BEFORE INSERT OR UPDATE ON graduation_records FOR EACH ROW EXECUTE FUNCTION validate_academic_links();
CREATE TRIGGER diplomas_links BEFORE INSERT OR UPDATE ON diplomas FOR EACH ROW EXECUTE FUNCTION validate_academic_links();
CREATE TRIGGER memberships_links BEFORE INSERT OR UPDATE ON account_memberships FOR EACH ROW EXECUTE FUNCTION validate_academic_links();

CREATE FUNCTION reject_historical_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historical table % is append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER immutable_diploma_versions BEFORE UPDATE OR DELETE ON diploma_versions FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER immutable_diploma_events BEFORE UPDATE OR DELETE ON diploma_events FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER immutable_audit_logs BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER immutable_source_documents BEFORE UPDATE OR DELETE ON source_documents FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();

CREATE FUNCTION protect_import_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.batch_id IS DISTINCT FROM OLD.batch_id OR NEW.sheet_name IS DISTINCT FROM OLD.sheet_name OR NEW.row_number IS DISTINCT FROM OLD.row_number OR NEW.raw_data IS DISTINCT FROM OLD.raw_data OR NEW.normalized_data IS DISTINCT FROM OLD.normalized_data THEN
    RAISE EXCEPTION 'Import source is immutable; use overrides with review audit' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_import_source BEFORE UPDATE ON import_rows FOR EACH ROW EXECUTE FUNCTION protect_import_source();

CREATE FUNCTION protect_outbox_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.event_type IS DISTINCT FROM OLD.event_type OR NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'Outbox payload is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_outbox_payload BEFORE UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION protect_outbox_payload();

REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM diplomachain_app;
REVOKE UPDATE ON diploma_versions, diploma_events, audit_logs, source_documents FROM diplomachain_app;
REVOKE ALL ON _prisma_migrations FROM diplomachain_app;


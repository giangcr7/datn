# Ràng buộc vật lý

Không dùng db push thay migrations: một số CHECK/trigger/partial index không biểu diễn hết trong Prisma/DBML.

- academic_classes.academic_classes_campus_id_fkey: FOREIGN KEY (campus_id) REFERENCES campuses(id) ON UPDATE CASCADE ON DELETE RESTRICT
- account_memberships.account_memberships_account_id_fkey: FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- account_memberships.account_memberships_campus_id_fkey: FOREIGN KEY (campus_id) REFERENCES campuses(id) ON UPDATE CASCADE ON DELETE RESTRICT
- account_memberships.approver_role_valid: CHECK (((NOT can_approve_diplomas) OR (role = 'UNIVERSITY'::"Role")))
- account_memberships.memberships_account_key: UNIQUE (id, account_id)
- accounts.account_email_normalized: CHECK ((((email)::text = lower(TRIM(BOTH FROM email))) AND (length((email)::text) > 3)))
- accounts.account_session_version_valid: CHECK ((session_version >= 0))
- accounts.accounts_student_id_fkey: FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT
- audit_logs.audit_logs_actor_id_fkey: FOREIGN KEY (actor_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- audit_logs.audit_logs_institution_id_fkey: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- audit_logs.audit_result_valid: CHECK (((result)::text = ANY ((ARRAY['SUCCESS'::character varying, 'FAILED'::character varying])::text[])))
- blockchain_anchors.anchor_hash_valid: CHECK ((payload_hash ~ '^[0-9a-f]{64}$'::text))
- blockchain_anchors.blockchain_anchors_version_id_fkey: FOREIGN KEY (version_id) REFERENCES diploma_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- blockchain_anchors.committed_anchor_valid: CHECK (((status <> 'COMMITTED'::"AnchorStatus") OR ((transaction_id IS NOT NULL) AND (committed_at IS NOT NULL))))
- campuses.campuses_institution_id_fkey: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- campuses.campuses_scope_key: UNIQUE (id, institution_id)
- diploma_events.diploma_events_actor_id_fkey: FOREIGN KEY (actor_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diploma_events.diploma_events_diploma_id_fkey: FOREIGN KEY (diploma_id) REFERENCES diplomas(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diploma_pdf_signatures.diploma_pdf_signatures_actor_id_fkey: FOREIGN KEY (actor_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diploma_pdf_signatures.diploma_pdf_signatures_campus_id_fkey: FOREIGN KEY (campus_id) REFERENCES campuses(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diploma_pdf_signatures.diploma_pdf_signatures_certificate_sha256_check: CHECK ((certificate_sha256 ~ '^[0-9a-f]{64}$'::text))
- diploma_pdf_signatures.diploma_pdf_signatures_check: CHECK (((valid_to > valid_from) AND (signed_at >= valid_from) AND (signed_at <= valid_to)))
- diploma_pdf_signatures.diploma_pdf_signatures_check1: CHECK ((((signature_order = 1) AND ((field_name)::text = 'CampusApproval'::text)) OR ((signature_order = 2) AND ((field_name)::text = 'HeadquartersIssue'::text))))
- diploma_pdf_signatures.diploma_pdf_signatures_document_id_actor_id_key: UNIQUE (document_id, actor_id)
- diploma_pdf_signatures.diploma_pdf_signatures_document_id_certificate_sha256_key: UNIQUE (document_id, certificate_sha256)
- diploma_pdf_signatures.diploma_pdf_signatures_document_id_fkey: FOREIGN KEY (document_id) REFERENCES signed_diploma_documents(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diploma_pdf_signatures.diploma_pdf_signatures_document_id_signature_order_key: UNIQUE (document_id, signature_order)
- diploma_pdf_signatures.diploma_pdf_signatures_signature_order_check: CHECK ((signature_order = ANY (ARRAY[1, 2])))
- diploma_pdf_signatures.pdf_validation_evidence_shape: CHECK (((validation_evidence IS NULL) OR (((jsonb_typeof(validation_evidence) = 'object'::text) AND ((validation_evidence ->> 'policy'::text) = 'pades-bt-pki-v2'::text) AND (jsonb_typeof((validation_evidence -> 'timestamp'::text)) = 'object'::text) AND (((validation_evidence -> 'timestamp'::text) -> 'valid'::text) = 'true'::jsonb) AND (((validation_evidence -> 'timestamp'::text) ->> 'tokenSha256'::text) ~ '^[0-9a-f]{64}$'::text) AND ((validation_evidence ->> 'trustAnchorSha256'::text) ~ '^[0-9a-f]{64}$'::text) AND
CASE
    WHEN (jsonb_typeof((validation_evidence -> 'revocation'::text)) = 'array'::text) THEN (jsonb_array_length((validation_evidence -> 'revocation'::text)) > 0)
    ELSE false
END AND
CASE
    WHEN (jsonb_typeof(((validation_evidence -> 'timestamp'::text) -> 'revocation'::text)) = 'array'::text) THEN (jsonb_array_length(((validation_evidence -> 'timestamp'::text) -> 'revocation'::text)) > 0)
    ELSE false
END) IS TRUE)))
- diploma_versions.diploma_payload_valid: CHECK (((version > 0) AND (jsonb_typeof(payload) = 'object'::text) AND (payload_hash ~ '^[0-9a-f]{64}$'::text)))
- diploma_versions.diploma_versions_created_by_id_fkey: FOREIGN KEY (created_by_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diploma_versions.diploma_versions_diploma_id_fkey: FOREIGN KEY (diploma_id) REFERENCES diplomas(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diplomas.diploma_approval_valid: CHECK (((status <> 'ACTIVE'::"DiplomaStatus") OR ((workflow_status = 'APPROVED'::"WorkflowStatus") AND (approved_at IS NOT NULL))))
- diplomas.diploma_approved_actor_valid: CHECK (((workflow_status <> 'APPROVED'::"WorkflowStatus") OR ((approved_by_id IS NOT NULL) AND (approved_at IS NOT NULL) AND (approved_by_id <> requested_by_id))))
- diplomas.diploma_campus_scope: FOREIGN KEY (campus_id, institution_id) REFERENCES campuses(id, institution_id)
- diplomas.diploma_graduation_scope: FOREIGN KEY (graduation_id, institution_id) REFERENCES graduation_records(id, institution_id)
- diplomas.diploma_issued_on_valid: CHECK (((issued_on IS NULL) OR ((issued_on >= '1900-01-01'::date) AND (issued_on <= CURRENT_DATE))))
- diplomas.diploma_issuer_scope: FOREIGN KEY (issuing_campus_id, institution_id) REFERENCES campuses(id, institution_id)
- diplomas.diploma_maker_checker: CHECK (((approved_by_id IS NULL) OR (requested_by_id IS NULL) OR (approved_by_id <> requested_by_id)))
- diplomas.diploma_no_self_replacement: CHECK (((supersedes_id IS NULL) OR (supersedes_id <> id)))
- diplomas.diploma_numbers_nonempty: CHECK (((length(TRIM(BOTH FROM certificate_no)) > 0) AND (length(TRIM(BOTH FROM registry_no)) > 0)))
- diplomas.diploma_origin_valid: CHECK (((origin_type)::text = ANY ((ARRAY['ISSUANCE'::character varying, 'DIGITIZATION'::character varying])::text[])))
- diplomas.diploma_print_template_valid: CHECK (((print_template IS NULL) OR ((print_template)::text = 'tlu-bilingual-v1'::text)))
- diplomas.diploma_request_actor_valid: CHECK (((workflow_status <> ALL (ARRAY['REQUESTED'::"WorkflowStatus", 'APPROVED'::"WorkflowStatus"])) OR ((requested_by_id IS NOT NULL) AND (requested_at IS NOT NULL))))
- diplomas.diploma_revocation_valid: CHECK (((status <> 'REVOKED'::"DiplomaStatus") OR ((revoked_at IS NOT NULL) AND (length(TRIM(BOTH FROM revoked_reason)) > 0))))
- diplomas.diploma_version_positive: CHECK ((current_version > 0))
- diplomas.diplomas_approved_by_id_fkey: FOREIGN KEY (approved_by_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diplomas.diplomas_campus_id_fkey: FOREIGN KEY (campus_id) REFERENCES campuses(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diplomas.diplomas_graduation_id_fkey: FOREIGN KEY (graduation_id) REFERENCES graduation_records(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diplomas.diplomas_institution_id_fkey: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diplomas.diplomas_issuing_campus_id_fkey: FOREIGN KEY (issuing_campus_id) REFERENCES campuses(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diplomas.diplomas_requested_by_id_fkey: FOREIGN KEY (requested_by_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- diplomas.diplomas_supersedes_id_fkey: FOREIGN KEY (supersedes_id) REFERENCES diplomas(id) ON UPDATE CASCADE ON DELETE RESTRICT
- enrollments.enrollments_campus_id_fkey: FOREIGN KEY (campus_id) REFERENCES campuses(id) ON UPDATE CASCADE ON DELETE RESTRICT
- enrollments.enrollments_class_id_fkey: FOREIGN KEY (class_id) REFERENCES academic_classes(id) ON UPDATE CASCADE ON DELETE RESTRICT
- enrollments.enrollments_program_id_fkey: FOREIGN KEY (program_id) REFERENCES programs(id) ON UPDATE CASCADE ON DELETE RESTRICT
- enrollments.enrollments_student_id_fkey: FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT
- graduation_decisions.decision_document_scope: FOREIGN KEY (source_document_id, institution_id) REFERENCES source_documents(id, institution_id)
- graduation_decisions.decision_year_valid: CHECK ((((decision_year >= 1900) AND (decision_year <= 2200)) AND ((signed_on IS NULL) OR (EXTRACT(year FROM signed_on) = (decision_year)::numeric))))
- graduation_decisions.decisions_scope_key: UNIQUE (id, institution_id)
- graduation_decisions.graduation_decisions_institution_id_fkey: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- graduation_decisions.graduation_decisions_source_document_id_fkey: FOREIGN KEY (source_document_id) REFERENCES source_documents(id) ON UPDATE CASCADE ON DELETE RESTRICT
- graduation_records.graduation_decision_scope: FOREIGN KEY (decision_id, institution_id) REFERENCES graduation_decisions(id, institution_id)
- graduation_records.graduation_gpa_valid: CHECK (((gpa_scale = ANY (ARRAY[4, 10])) AND ((gpa IS NULL) OR ((gpa >= (0)::numeric) AND (gpa <= (gpa_scale)::numeric)))))
- graduation_records.graduation_program_scope: FOREIGN KEY (program_id, institution_id) REFERENCES programs(id, institution_id)
- graduation_records.graduation_records_decision_id_fkey: FOREIGN KEY (decision_id) REFERENCES graduation_decisions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- graduation_records.graduation_records_enrollment_id_fkey: FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT
- graduation_records.graduation_records_institution_id_fkey: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- graduation_records.graduation_records_program_id_fkey: FOREIGN KEY (program_id) REFERENCES programs(id) ON UPDATE CASCADE ON DELETE RESTRICT
- graduation_records.graduation_records_source_row_id_fkey: FOREIGN KEY (source_row_id) REFERENCES import_rows(id) ON UPDATE CASCADE ON DELETE RESTRICT
- graduation_records.graduation_records_student_id_fkey: FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT
- graduation_records.graduation_student_scope: FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id)
- graduation_records.graduation_year_valid: CHECK (((graduation_year >= 1900) AND (graduation_year <= 2200)))
- graduation_records.graduations_scope_key: UNIQUE (id, institution_id)
- import_batches.import_batches_campus_id_fkey: FOREIGN KEY (campus_id) REFERENCES campuses(id) ON UPDATE CASCADE ON DELETE RESTRICT
- import_batches.import_batches_created_by_id_fkey: FOREIGN KEY (created_by_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- import_batches.import_batches_document_id_fkey: FOREIGN KEY (document_id) REFERENCES source_documents(id) ON UPDATE CASCADE ON DELETE RESTRICT
- import_batches.import_batches_institution_id_fkey: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- import_batches.import_campus_scope: FOREIGN KEY (campus_id, institution_id) REFERENCES campuses(id, institution_id)
- import_batches.import_counts_valid: CHECK (((total_rows >= 0) AND ((imported_rows >= 0) AND (imported_rows <= total_rows))))
- import_batches.import_document_scope: FOREIGN KEY (document_id, institution_id) REFERENCES source_documents(id, institution_id)
- import_rows.import_row_valid: CHECK (((row_number > 0) AND (jsonb_typeof(raw_data) = 'object'::text) AND (jsonb_typeof(normalized_data) = 'object'::text) AND ((overrides IS NULL) OR (jsonb_typeof(overrides) = 'object'::text))))
- import_rows.import_rows_batch_id_fkey: FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON UPDATE CASCADE ON DELETE RESTRICT
- import_rows.import_rows_reviewed_by_id_fkey: FOREIGN KEY (reviewed_by_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- integrity_alerts.integrity_alerts_diploma_id_fkey: FOREIGN KEY (diploma_id) REFERENCES diplomas(id) ON UPDATE CASCADE ON DELETE RESTRICT
- integrity_alerts.integrity_alerts_resolved_by_id_fkey: FOREIGN KEY (resolved_by_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- otp_challenges.otp_attempts_valid: CHECK ((((attempts >= 0) AND (attempts <= 5)) AND (expires_at > created_at) AND (code_hash ~ '^[0-9a-f]{64}$'::text)))
- otp_challenges.otp_challenges_account_id_fkey: FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- outbox_events.outbox_events_version_id_fkey: FOREIGN KEY (version_id) REFERENCES diploma_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- outbox_events.outbox_valid: CHECK (((attempts >= 0) AND (jsonb_typeof(payload) = 'object'::text) AND ((event_type)::text = ANY ((ARRAY['ISSUE'::character varying, 'REVOKE'::character varying])::text[]))))
- program_aliases.aliases_program_scope: FOREIGN KEY (program_id, institution_id) REFERENCES programs(id, institution_id)
- program_aliases.program_aliases_approved_by_id_fkey: FOREIGN KEY (approved_by_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- program_aliases.program_aliases_institution_id_fkey: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- program_aliases.program_aliases_program_id_fkey: FOREIGN KEY (program_id) REFERENCES programs(id) ON UPDATE CASCADE ON DELETE RESTRICT
- programs.programs_institution_id_fkey: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- programs.programs_scope_key: UNIQUE (id, institution_id)
- refresh_sessions.refresh_membership_account: FOREIGN KEY (membership_id, account_id) REFERENCES account_memberships(id, account_id)
- refresh_sessions.refresh_sessions_account_id_fkey: FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- refresh_sessions.refresh_sessions_membership_id_fkey: FOREIGN KEY (membership_id) REFERENCES account_memberships(id) ON UPDATE CASCADE ON DELETE RESTRICT
- refresh_sessions.refresh_sessions_replaced_by_id_fkey: FOREIGN KEY (replaced_by_id) REFERENCES refresh_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- refresh_sessions.refresh_token_valid: CHECK (((expires_at > created_at) AND (token_hash ~ '^[0-9a-f]{64}$'::text)))
- signed_diploma_documents.signed_diploma_documents_byte_size_check: CHECK (((byte_size > 0) AND (byte_size <= 10485760)))
- signed_diploma_documents.signed_diploma_documents_diploma_id_fkey: FOREIGN KEY (diploma_id) REFERENCES diplomas(id) ON UPDATE CASCADE ON DELETE RESTRICT
- signed_diploma_documents.signed_diploma_documents_diploma_id_version_key: UNIQUE (diploma_id, version)
- signed_diploma_documents.signed_diploma_documents_origin_pdf_hash_check: CHECK ((origin_pdf_hash ~ '^[0-9a-f]{64}$'::text))
- signed_diploma_documents.signed_diploma_documents_payload_hash_check: CHECK ((payload_hash ~ '^[0-9a-f]{64}$'::text))
- signed_diploma_documents.signed_diploma_documents_signed_pdf_hash_check: CHECK ((signed_pdf_hash ~ '^[0-9a-f]{64}$'::text))
- signed_diploma_documents.signed_diploma_documents_signed_pdf_hash_key: UNIQUE (signed_pdf_hash)
- signed_diploma_documents.signed_diploma_documents_signing_mode_check: CHECK (((signing_mode)::text = ANY ((ARRAY['demo'::character varying, 'certificate'::character varying])::text[])))
- signed_diploma_documents.signed_diploma_documents_version_check: CHECK ((version > 0))
- signed_diploma_documents.signed_diploma_documents_version_id_fkey: FOREIGN KEY (version_id) REFERENCES diploma_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- signed_diploma_documents.signed_diploma_documents_version_id_key: UNIQUE (version_id)
- signed_diploma_documents.signed_document_completion: CHECK ((((version_id IS NULL) AND (signed_pdf_key IS NULL) AND (signed_pdf_hash IS NULL) AND (completed_at IS NULL)) OR ((version_id IS NOT NULL) AND (signed_pdf_key IS NOT NULL) AND (signed_pdf_hash IS NOT NULL) AND (completed_at IS NOT NULL))))
- source_documents.source_document_valid: CHECK (((byte_size > 0) AND (sha256 ~ '^[0-9a-f]{64}$'::text) AND (length((storage_key)::text) > 0)))
- source_documents.source_documents_institution_id_fkey: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- source_documents.source_documents_scope_key: UNIQUE (id, institution_id)
- source_documents.source_documents_uploaded_by_id_fkey: FOREIGN KEY (uploaded_by_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
- students.student_code_nonempty: CHECK ((length(TRIM(BOTH FROM student_code)) > 0))
- students.student_dob_valid: CHECK (((date_of_birth IS NULL) OR ((date_of_birth >= '1900-01-01'::date) AND (date_of_birth <= CURRENT_DATE))))
- students.student_name_nonempty: CHECK ((length(TRIM(BOTH FROM full_name)) > 0))
- students.students_institution_id_fkey: FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE RESTRICT
- students.students_scope_key: UNIQUE (id, institution_id)
- validation_issues.validation_issues_row_id_fkey: FOREIGN KEY (row_id) REFERENCES import_rows(id) ON UPDATE CASCADE ON DELETE CASCADE

## Index đặc biệt

- CREATE UNIQUE INDEX one_headquarters_per_institution ON public.campuses USING btree (institution_id) WHERE is_headquarters
- CREATE UNIQUE INDEX one_open_diploma_per_graduation ON public.diplomas USING btree (graduation_id) WHERE ((status = ANY (ARRAY['DRAFT'::"DiplomaStatus", 'ACTIVE'::"DiplomaStatus"])) AND (workflow_status <> 'REJECTED'::"WorkflowStatus"))
- CREATE UNIQUE INDEX enrollment_identity_key ON public.enrollments USING btree (student_id, program_id, campus_id, class_id) NULLS NOT DISTINCT
- CREATE UNIQUE INDEX one_open_integrity_alert ON public.integrity_alerts USING btree (diploma_id, type) WHERE (resolved_at IS NULL)

## Trigger bảo vệ

- account_memberships: approver_membership_scope (INSERT)
- account_memberships: approver_membership_scope (UPDATE)
- account_memberships: memberships_links (INSERT)
- account_memberships: memberships_links (UPDATE)
- audit_logs: immutable_audit_logs (DELETE)
- audit_logs: immutable_audit_logs (UPDATE)
- diploma_events: immutable_diploma_events (DELETE)
- diploma_events: immutable_diploma_events (UPDATE)
- diploma_pdf_signatures: pdf_signature_actor (DELETE)
- diploma_pdf_signatures: pdf_signature_actor (INSERT)
- diploma_pdf_signatures: pdf_signature_actor (UPDATE)
- diploma_versions: immutable_diploma_versions (DELETE)
- diploma_versions: immutable_diploma_versions (UPDATE)
- diplomas: diploma_issue_date (INSERT)
- diplomas: diploma_issue_date (UPDATE)
- diplomas: diploma_origin (UPDATE)
- diplomas: diploma_print_fields (UPDATE)
- diplomas: diplomas_links (INSERT)
- diplomas: diplomas_links (UPDATE)
- diplomas: headquarters_approval (INSERT)
- diplomas: headquarters_approval (UPDATE)
- enrollments: enrollments_links (INSERT)
- enrollments: enrollments_links (UPDATE)
- graduation_records: graduation_degree_type (UPDATE)
- graduation_records: graduations_links (INSERT)
- graduation_records: graduations_links (UPDATE)
- import_rows: immutable_import_source (UPDATE)
- outbox_events: immutable_outbox_payload (UPDATE)
- signed_diploma_documents: signed_pdf_completion (INSERT)
- signed_diploma_documents: signed_pdf_completion (UPDATE)
- signed_diploma_documents: signed_pdf_immutable (DELETE)
- signed_diploma_documents: signed_pdf_immutable (UPDATE)
- source_documents: immutable_source_documents (DELETE)
- source_documents: immutable_source_documents (UPDATE)

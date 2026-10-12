-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'UNIVERSITY', 'STUDENT', 'EMPLOYER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "Classification" AS ENUM ('EXCELLENT', 'VERY_GOOD', 'GOOD', 'AVERAGE_GOOD', 'AVERAGE');

-- CreateEnum
CREATE TYPE "DegreeType" AS ENUM ('BACHELOR', 'ENGINEER', 'MASTER', 'DOCTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "DiplomaStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REVOKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AnchorStatus" AS ENUM ('QUEUED', 'SUBMITTED', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('READY', 'REVIEW_REQUIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('READY', 'NEEDS_REVIEW', 'IMPORTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('ERROR', 'WARNING');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campuses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "fabric_msp_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "national_code" VARCHAR(30),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_aliases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "normalized_name" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "approved_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campus_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "cohort_code" VARCHAR(40),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "student_code" VARCHAR(40) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "date_of_birth" DATE,
    "birth_place" VARCHAR(255),
    "gender" "Gender",
    "ethnicity" VARCHAR(80),
    "nationality" VARCHAR(100),
    "contact_email" VARCHAR(320),
    "phone" VARCHAR(30),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "class_id" UUID,
    "start_year" SMALLINT,
    "end_year" SMALLINT,
    "cohort_code" VARCHAR(40),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graduation_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "document_number" VARCHAR(120) NOT NULL,
    "decision_year" SMALLINT NOT NULL,
    "signed_on" DATE,
    "signer_name" VARCHAR(255),
    "source_document_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graduation_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graduation_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "decision_id" UUID,
    "source_row_id" UUID,
    "graduation_year" SMALLINT NOT NULL,
    "gpa" DECIMAL(4,2),
    "gpa_scale" SMALLINT NOT NULL DEFAULT 4,
    "classification" "Classification",
    "degree_type" "DegreeType",
    "specialization" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graduation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diplomas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "graduation_id" UUID NOT NULL,
    "certificate_no" VARCHAR(120) NOT NULL,
    "registry_no" VARCHAR(180) NOT NULL,
    "issued_on" DATE,
    "status" "DiplomaStatus" NOT NULL DEFAULT 'DRAFT',
    "workflow_status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "requested_by_id" UUID,
    "approved_by_id" UUID,
    "requested_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "supersedes_id" UUID,
    "revoked_reason" TEXT,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "diplomas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diploma_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diploma_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "schema_version" VARCHAR(20) NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diploma_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diploma_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diploma_id" UUID NOT NULL,
    "event_type" VARCHAR(60) NOT NULL,
    "actor_id" UUID,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diploma_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_anchors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "event_type" VARCHAR(60) NOT NULL,
    "status" "AnchorStatus" NOT NULL DEFAULT 'QUEUED',
    "channel" VARCHAR(100) NOT NULL,
    "chaincode" VARCHAR(100) NOT NULL,
    "transaction_id" VARCHAR(100),
    "block_number" BIGINT,
    "issuer_msp_id" VARCHAR(100),
    "payload_hash" CHAR(64) NOT NULL,
    "committed_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blockchain_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "media_type" VARCHAR(100) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "mapping_version" VARCHAR(40) NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "sheet_name" VARCHAR(100) NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB NOT NULL,
    "overrides" JSONB,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "row_id" UUID NOT NULL,
    "field" VARCHAR(80) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "student_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" UUID,
    "ip" VARCHAR(100),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "actor_id" UUID,
    "actor_email" VARCHAR(320) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "target" VARCHAR(255),
    "result" VARCHAR(20) NOT NULL,
    "ip" VARCHAR(100),
    "user_agent" VARCHAR(500),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrity_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diploma_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "database_hash" CHAR(64),
    "fabric_hash" CHAR(64),
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrity_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "event_type" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "lock_token" UUID,
    "last_error" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_id_maps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "legacy_id" VARCHAR(120) NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_id_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institutions_code_key" ON "institutions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "campuses_fabric_msp_id_key" ON "campuses"("fabric_msp_id");

-- CreateIndex
CREATE INDEX "campuses_institution_id_idx" ON "campuses"("institution_id");

-- CreateIndex
CREATE UNIQUE INDEX "campuses_institution_id_code_key" ON "campuses"("institution_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "programs_institution_id_code_key" ON "programs"("institution_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "programs_institution_id_name_key" ON "programs"("institution_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "program_aliases_institution_id_normalized_name_key" ON "program_aliases"("institution_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_classes_campus_id_code_key" ON "academic_classes"("campus_id", "code");

-- CreateIndex
CREATE INDEX "students_institution_id_full_name_idx" ON "students"("institution_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "students_institution_id_student_code_key" ON "students"("institution_id", "student_code");

-- CreateIndex
CREATE INDEX "enrollments_student_id_program_id_idx" ON "enrollments"("student_id", "program_id");

-- CreateIndex
CREATE INDEX "enrollments_campus_id_class_id_idx" ON "enrollments"("campus_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "graduation_decisions_institution_id_document_number_decisio_key" ON "graduation_decisions"("institution_id", "document_number", "decision_year");

-- CreateIndex
CREATE UNIQUE INDEX "graduation_records_source_row_id_key" ON "graduation_records"("source_row_id");

-- CreateIndex
CREATE INDEX "graduation_records_institution_id_graduation_year_idx" ON "graduation_records"("institution_id", "graduation_year");

-- CreateIndex
CREATE INDEX "graduation_records_student_id_program_id_graduation_year_idx" ON "graduation_records"("student_id", "program_id", "graduation_year");

-- CreateIndex
CREATE UNIQUE INDEX "diplomas_supersedes_id_key" ON "diplomas"("supersedes_id");

-- CreateIndex
CREATE INDEX "diplomas_campus_id_workflow_status_created_at_idx" ON "diplomas"("campus_id", "workflow_status", "created_at");

-- CreateIndex
CREATE INDEX "diplomas_graduation_id_idx" ON "diplomas"("graduation_id");

-- CreateIndex
CREATE UNIQUE INDEX "diplomas_institution_id_certificate_no_key" ON "diplomas"("institution_id", "certificate_no");

-- CreateIndex
CREATE UNIQUE INDEX "diplomas_institution_id_registry_no_key" ON "diplomas"("institution_id", "registry_no");

-- CreateIndex
CREATE UNIQUE INDEX "diploma_versions_diploma_id_version_key" ON "diploma_versions"("diploma_id", "version");

-- CreateIndex
CREATE INDEX "diploma_events_diploma_id_created_at_idx" ON "diploma_events"("diploma_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_anchors_transaction_id_key" ON "blockchain_anchors"("transaction_id");

-- CreateIndex
CREATE INDEX "blockchain_anchors_status_created_at_idx" ON "blockchain_anchors"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_anchors_version_id_event_type_key" ON "blockchain_anchors"("version_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "source_documents_institution_id_sha256_key" ON "source_documents"("institution_id", "sha256");

-- CreateIndex
CREATE INDEX "import_batches_institution_id_created_at_idx" ON "import_batches"("institution_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_document_id_campus_id_mapping_version_key" ON "import_batches"("document_id", "campus_id", "mapping_version");

-- CreateIndex
CREATE INDEX "import_rows_batch_id_status_idx" ON "import_rows"("batch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_batch_id_sheet_name_row_number_key" ON "import_rows"("batch_id", "sheet_name", "row_number");

-- CreateIndex
CREATE INDEX "validation_issues_row_id_severity_resolved_at_idx" ON "validation_issues"("row_id", "severity", "resolved_at");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_student_id_key" ON "accounts"("student_id");

-- CreateIndex
CREATE INDEX "account_memberships_campus_id_role_idx" ON "account_memberships"("campus_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "account_memberships_account_id_campus_id_role_key" ON "account_memberships"("account_id", "campus_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_replaced_by_id_key" ON "refresh_sessions"("replaced_by_id");

-- CreateIndex
CREATE INDEX "refresh_sessions_account_id_family_id_idx" ON "refresh_sessions"("account_id", "family_id");

-- CreateIndex
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "otp_challenges_account_id_created_at_idx" ON "otp_challenges"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "otp_challenges_expires_at_idx" ON "otp_challenges"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_institution_id_created_at_idx" ON "audit_logs"("institution_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "integrity_alerts_diploma_id_type_resolved_at_idx" ON "integrity_alerts"("diploma_id", "type", "resolved_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_locked_until_idx" ON "outbox_events"("status", "available_at", "locked_until");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_version_id_event_type_key" ON "outbox_events"("version_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_id_maps_source_entity_legacy_id_key" ON "legacy_id_maps"("source", "entity", "legacy_id");

-- AddForeignKey
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_aliases" ADD CONSTRAINT "program_aliases_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_aliases" ADD CONSTRAINT "program_aliases_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_aliases" ADD CONSTRAINT "program_aliases_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_classes" ADD CONSTRAINT "academic_classes_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "academic_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graduation_decisions" ADD CONSTRAINT "graduation_decisions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graduation_decisions" ADD CONSTRAINT "graduation_decisions_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "graduation_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_source_row_id_fkey" FOREIGN KEY ("source_row_id") REFERENCES "import_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diplomas" ADD CONSTRAINT "diplomas_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diplomas" ADD CONSTRAINT "diplomas_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diplomas" ADD CONSTRAINT "diplomas_graduation_id_fkey" FOREIGN KEY ("graduation_id") REFERENCES "graduation_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diplomas" ADD CONSTRAINT "diplomas_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diplomas" ADD CONSTRAINT "diplomas_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diplomas" ADD CONSTRAINT "diplomas_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "diplomas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diploma_versions" ADD CONSTRAINT "diploma_versions_diploma_id_fkey" FOREIGN KEY ("diploma_id") REFERENCES "diplomas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diploma_versions" ADD CONSTRAINT "diploma_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diploma_events" ADD CONSTRAINT "diploma_events_diploma_id_fkey" FOREIGN KEY ("diploma_id") REFERENCES "diplomas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diploma_events" ADD CONSTRAINT "diploma_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockchain_anchors" ADD CONSTRAINT "blockchain_anchors_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "diploma_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "source_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_row_id_fkey" FOREIGN KEY ("row_id") REFERENCES "import_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_memberships" ADD CONSTRAINT "account_memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_memberships" ADD CONSTRAINT "account_memberships_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "account_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrity_alerts" ADD CONSTRAINT "integrity_alerts_diploma_id_fkey" FOREIGN KEY ("diploma_id") REFERENCES "diplomas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrity_alerts" ADD CONSTRAINT "integrity_alerts_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "diploma_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

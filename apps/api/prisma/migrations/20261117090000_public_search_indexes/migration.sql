BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE INDEX students_public_search_name_idx ON students
USING gin (public.diploma_search_normalize(full_name) public.gin_trgm_ops);

CREATE INDEX students_public_search_code_idx ON students
USING gin (public.diploma_search_normalize(student_code) public.gin_trgm_ops);

CREATE INDEX diplomas_public_search_certificate_idx ON diplomas
USING gin (public.diploma_search_normalize(certificate_no) public.gin_trgm_ops);

CREATE INDEX diplomas_public_search_registry_idx ON diplomas
USING gin (public.diploma_search_normalize(registry_no) public.gin_trgm_ops);

CREATE INDEX diplomas_public_directory_status_idx ON diplomas
(status, workflow_status, created_at DESC, id DESC);

CREATE INDEX diploma_versions_latest_public_search_idx ON diploma_versions
(diploma_id, version DESC);

CREATE INDEX blockchain_anchors_public_issue_idx ON blockchain_anchors
(version_id, event_type, status);

COMMIT;

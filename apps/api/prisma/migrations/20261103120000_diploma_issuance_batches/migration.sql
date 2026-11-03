BEGIN;

CREATE TABLE diploma_issuance_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT,
  decision_id uuid NOT NULL REFERENCES graduation_decisions(id) ON DELETE RESTRICT,
  program_id uuid REFERENCES programs(id) ON DELETE RESTRICT,
  code varchar(60) NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,59}$'),
  name varchar(255) NOT NULL CHECK (length(trim(name)) > 0),
  graduation_year smallint NOT NULL CHECK (graduation_year BETWEEN 1900 AND 2200),
  created_by_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT diploma_issuance_batches_institution_id_code_key UNIQUE (institution_id, code),
  FOREIGN KEY (campus_id, institution_id) REFERENCES campuses(id, institution_id),
  FOREIGN KEY (decision_id, institution_id) REFERENCES graduation_decisions(id, institution_id),
  FOREIGN KEY (program_id, institution_id) REFERENCES programs(id, institution_id)
);
CREATE INDEX diploma_issuance_batches_institution_id_campus_id_created_at_idx
  ON diploma_issuance_batches(institution_id, campus_id, created_at);
ALTER TABLE diplomas ADD COLUMN issuance_batch_id uuid REFERENCES diploma_issuance_batches(id) ON DELETE RESTRICT;
CREATE INDEX diplomas_issuance_batch_id_idx ON diplomas(issuance_batch_id);

CREATE FUNCTION validate_issuance_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM campuses c JOIN account_memberships m ON m.campus_id = c.id
    JOIN accounts a ON a.id = m.account_id
    WHERE c.id = NEW.campus_id AND c.institution_id = NEW.institution_id
      AND c.active AND c.is_headquarters AND m.account_id = NEW.created_by_id
      AND m.active AND m.can_approve_diplomas AND m.role = 'UNIVERSITY' AND a.active
  ) THEN
    RAISE EXCEPTION 'Issuance batch requires an active main-campus approver' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issuance_batch_authority BEFORE INSERT ON diploma_issuance_batches
  FOR EACH ROW EXECUTE FUNCTION validate_issuance_batch();
CREATE TRIGGER immutable_issuance_batch BEFORE UPDATE OR DELETE ON diploma_issuance_batches
  FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();

CREATE FUNCTION validate_issuance_batch_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.issuance_batch_id IS NOT NULL) OR
     (TG_OP = 'UPDATE' AND NEW.issuance_batch_id IS DISTINCT FROM OLD.issuance_batch_id) THEN
    IF NEW.status <> 'DRAFT' OR NEW.workflow_status <> 'DRAFT' OR NEW.supersedes_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM diploma_versions WHERE diploma_id = NEW.id)
      OR EXISTS (SELECT 1 FROM signed_diploma_documents WHERE diploma_id = NEW.id) THEN
      RAISE EXCEPTION 'Only unsigned draft diplomas may change issuance batch' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD.status <> 'DRAFT' OR OLD.workflow_status <> 'DRAFT') THEN
      RAISE EXCEPTION 'Submitted batch membership is locked' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.issuance_batch_id IS NOT NULL THEN
    PERFORM 1 FROM graduation_records WHERE id = NEW.graduation_id FOR SHARE;
    IF NOT EXISTS (
      SELECT 1 FROM diploma_issuance_batches b JOIN graduation_records g ON g.id = NEW.graduation_id
      WHERE b.id = NEW.issuance_batch_id AND b.institution_id = NEW.institution_id
        AND b.campus_id = NEW.campus_id AND g.decision_id = b.decision_id
        AND g.graduation_year = b.graduation_year AND (b.program_id IS NULL OR b.program_id = g.program_id)
    ) THEN
      RAISE EXCEPTION 'Diploma does not match issuance batch scope, decision, year or program' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issuance_batch_member BEFORE INSERT OR UPDATE ON diplomas
  FOR EACH ROW EXECUTE FUNCTION validate_issuance_batch_member();

CREATE FUNCTION protect_batched_graduation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM diplomas d JOIN diploma_issuance_batches b ON b.id = d.issuance_batch_id
    WHERE d.graduation_id = OLD.id AND (NEW.decision_id IS DISTINCT FROM b.decision_id
      OR NEW.institution_id IS DISTINCT FROM b.institution_id
      OR NEW.graduation_year <> b.graduation_year
      OR (b.program_id IS NOT NULL AND NEW.program_id <> b.program_id))
  ) THEN
    RAISE EXCEPTION 'Remove the draft from its issuance batch before changing decision, year or program' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER batched_graduation_scope BEFORE UPDATE ON graduation_records
  FOR EACH ROW EXECUTE FUNCTION protect_batched_graduation();

GRANT SELECT, INSERT, UPDATE ON diploma_issuance_batches TO diplomachain_app;
CREATE FUNCTION protect_batched_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.institution_id IS DISTINCT FROM OLD.institution_id OR NEW.document_number IS DISTINCT FROM OLD.document_number
      OR NEW.decision_year IS DISTINCT FROM OLD.decision_year OR NEW.signed_on IS DISTINCT FROM OLD.signed_on)
    AND EXISTS (SELECT 1 FROM diploma_issuance_batches WHERE decision_id = OLD.id) THEN
    RAISE EXCEPTION 'A decision referenced by an issuance batch is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER batched_decision BEFORE UPDATE ON graduation_decisions
  FOR EACH ROW EXECUTE FUNCTION protect_batched_decision();

REVOKE DELETE ON diploma_issuance_batches FROM diplomachain_app;
COMMIT;

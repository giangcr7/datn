BEGIN;

ALTER TABLE diploma_issuance_batches
  ALTER COLUMN decision_id DROP NOT NULL,
  ALTER COLUMN graduation_year DROP NOT NULL,
  ADD COLUMN issuance_year smallint CHECK (issuance_year BETWEEN 1900 AND 2200),
  ADD COLUMN batch_number smallint CHECK (batch_number BETWEEN 1 AND 999),
  ADD CONSTRAINT issuance_batch_kind CHECK (
    (issuance_year IS NULL AND batch_number IS NULL AND decision_id IS NOT NULL AND graduation_year IS NOT NULL)
    OR (issuance_year IS NOT NULL AND batch_number IS NOT NULL AND decision_id IS NULL AND graduation_year IS NULL AND program_id IS NULL)
  ),
  ADD CONSTRAINT diploma_issuance_batches_institution_id_issuance_year_batch_number_key
    UNIQUE (institution_id, issuance_year, batch_number);

CREATE OR REPLACE FUNCTION validate_issuance_batch_member() RETURNS trigger LANGUAGE plpgsql AS $$
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
        AND b.campus_id = NEW.campus_id AND g.institution_id = NEW.institution_id
        AND (b.issuance_year IS NOT NULL OR (g.decision_id = b.decision_id
          AND g.graduation_year = b.graduation_year AND (b.program_id IS NULL OR b.program_id = g.program_id)))
    ) THEN
      RAISE EXCEPTION 'Diploma does not match issuance batch scope' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_batched_graduation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM diplomas d JOIN diploma_issuance_batches b ON b.id = d.issuance_batch_id
    WHERE d.graduation_id = OLD.id AND (NEW.institution_id IS DISTINCT FROM b.institution_id
      OR (b.issuance_year IS NULL AND (NEW.decision_id IS DISTINCT FROM b.decision_id
        OR NEW.graduation_year <> b.graduation_year
        OR (b.program_id IS NOT NULL AND NEW.program_id <> b.program_id))))
  ) THEN
    RAISE EXCEPTION 'Remove the draft from its issuance batch before changing its scope' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;

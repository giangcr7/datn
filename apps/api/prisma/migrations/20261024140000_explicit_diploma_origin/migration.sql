ALTER TABLE diplomas ADD COLUMN origin_type varchar(20) NOT NULL DEFAULT 'ISSUANCE';
UPDATE diplomas d SET origin_type = 'DIGITIZATION' FROM graduation_records g WHERE g.id = d.graduation_id AND g.source_row_id IS NOT NULL;
ALTER TABLE diplomas ADD CONSTRAINT diploma_origin_valid CHECK (origin_type IN ('ISSUANCE', 'DIGITIZATION'));

CREATE OR REPLACE FUNCTION validate_diploma_issue_date() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND NEW.issued_on IS NULL AND NOT EXISTS (
    SELECT 1 FROM graduation_records g
    JOIN import_rows r ON r.id = g.source_row_id
    JOIN import_batches b ON b.id = r.batch_id
    WHERE NEW.origin_type = 'DIGITIZATION'
      AND g.id = NEW.graduation_id AND g.institution_id = NEW.institution_id
      AND b.institution_id = NEW.institution_id AND b.campus_id = NEW.campus_id
      AND r.status = 'IMPORTED' AND r.normalized_data ? 'issuedOn'
      AND NULLIF(r.normalized_data->>'issuedOn', '') IS NULL
      AND NULLIF((r.normalized_data || COALESCE(r.overrides, '{}'::jsonb))->>'issuedOn', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Only reviewed historical digitization can retain an unknown issue date' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION protect_diploma_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.origin_type IS DISTINCT FROM NEW.origin_type THEN
    RAISE EXCEPTION 'Diploma origin is immutable; create the appropriate request instead' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER diploma_origin BEFORE UPDATE ON diplomas FOR EACH ROW EXECUTE FUNCTION protect_diploma_origin();

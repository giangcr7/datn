ALTER TABLE diplomas DROP CONSTRAINT diploma_approval_valid;
ALTER TABLE diplomas ADD CONSTRAINT diploma_approval_valid CHECK (status <> 'ACTIVE' OR (workflow_status = 'APPROVED' AND approved_at IS NOT NULL));

CREATE FUNCTION validate_diploma_issue_date() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND NEW.issued_on IS NULL AND NOT EXISTS (
    SELECT 1 FROM graduation_records g
    JOIN import_rows r ON r.id = g.source_row_id
    JOIN import_batches b ON b.id = r.batch_id
    WHERE g.id = NEW.graduation_id AND g.institution_id = NEW.institution_id
      AND b.institution_id = NEW.institution_id AND b.campus_id = NEW.campus_id
      AND r.status = 'IMPORTED'
      AND r.normalized_data ? 'issuedOn'
      AND NULLIF(r.normalized_data->>'issuedOn', '') IS NULL
      AND NULLIF((r.normalized_data || COALESCE(r.overrides, '{}'::jsonb))->>'issuedOn', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Only reviewed historical digitization can retain an unknown issue date' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER diploma_issue_date BEFORE INSERT OR UPDATE ON diplomas FOR EACH ROW EXECUTE FUNCTION validate_diploma_issue_date();

ALTER TABLE diplomas ADD COLUMN replacement_data jsonb;
ALTER TABLE diplomas ADD CONSTRAINT replacement_data_requires_source
  CHECK (replacement_data IS NULL OR supersedes_id IS NOT NULL);

CREATE FUNCTION protect_diploma_replacement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.supersedes_id IS DISTINCT FROM NEW.supersedes_id THEN
    RAISE EXCEPTION 'Replacement source cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF OLD.replacement_data IS DISTINCT FROM NEW.replacement_data AND
    (OLD.workflow_status <> 'DRAFT' OR EXISTS (SELECT 1 FROM diploma_versions WHERE diploma_id = OLD.id)
      OR EXISTS (SELECT 1 FROM signed_diploma_documents WHERE diploma_id = OLD.id)) THEN
    RAISE EXCEPTION 'Submitted or signed replacement data is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER diploma_replacement BEFORE UPDATE ON diplomas
  FOR EACH ROW EXECUTE FUNCTION protect_diploma_replacement();

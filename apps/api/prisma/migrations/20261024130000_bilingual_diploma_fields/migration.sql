ALTER TABLE institutions ADD COLUMN name_en varchar(255);
ALTER TABLE programs ADD COLUMN name_en varchar(255);
ALTER TABLE diplomas
  ADD COLUMN print_template varchar(60),
  ADD COLUMN full_name_latin varchar(255),
  ADD COLUMN major_name_en varchar(255),
  ADD COLUMN issue_place varchar(120),
  ADD COLUMN diploma_signer_name varchar(255),
  ADD COLUMN diploma_signer_title varchar(120),
  ADD CONSTRAINT diploma_print_template_valid CHECK (print_template IS NULL OR print_template = 'tlu-bilingual-v1');

UPDATE institutions SET name_en = 'Thuyloi University' WHERE code = 'TLU' AND name_en IS NULL;
UPDATE programs p SET name_en = names.english FROM institutions i, (VALUES
  ('WATER_WORKS_LEGACY', 'Hydraulic Engineering'),
  ('CIVIL_LEGACY', 'Civil Engineering'),
  ('WATER_SUPPLY_LEGACY', 'Water Supply and Drainage'),
  ('WATER_WORKS', 'Hydraulic Engineering'),
  ('CIVIL', 'Civil Engineering'),
  ('WATER_SUPPLY', 'Water Supply and Drainage Engineering'),
  ('TRANSPORT', 'Transport Infrastructure Engineering'),
  ('WATER_RESOURCES', 'Water Resources Engineering'),
  ('CONSTRUCTION_TECH', 'Civil Engineering Technology'),
  ('ACCOUNTING', 'Accounting'),
  ('IT', 'Information Technology'),
  ('BUSINESS', 'Business Administration'),
  ('LOGISTICS', 'Logistics and Supply Chain Management')
) AS names(code, english)
WHERE i.id = p.institution_id AND i.code = 'TLU' AND p.code = names.code AND p.name_en IS NULL;

CREATE FUNCTION protect_diploma_print_fields() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.workflow_status <> 'DRAFT' OR EXISTS (SELECT 1 FROM signed_diploma_documents WHERE diploma_id = OLD.id))
    AND ROW(OLD.print_template, OLD.full_name_latin, OLD.major_name_en, OLD.issue_place, OLD.diploma_signer_name, OLD.diploma_signer_title)
      IS DISTINCT FROM ROW(NEW.print_template, NEW.full_name_latin, NEW.major_name_en, NEW.issue_place, NEW.diploma_signer_name, NEW.diploma_signer_title)
  THEN
    RAISE EXCEPTION 'Signed diploma print fields are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER diploma_print_fields BEFORE UPDATE ON diplomas FOR EACH ROW EXECUTE FUNCTION protect_diploma_print_fields();

CREATE FUNCTION protect_signed_degree_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.degree_type IS DISTINCT FROM NEW.degree_type AND EXISTS (
    SELECT 1 FROM diplomas d WHERE d.graduation_id = OLD.id AND
      (d.workflow_status <> 'DRAFT' OR EXISTS (SELECT 1 FROM signed_diploma_documents s WHERE s.diploma_id = d.id))
  ) THEN
    RAISE EXCEPTION 'Signed diploma degree type is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER graduation_degree_type BEFORE UPDATE ON graduation_records FOR EACH ROW EXECUTE FUNCTION protect_signed_degree_type();

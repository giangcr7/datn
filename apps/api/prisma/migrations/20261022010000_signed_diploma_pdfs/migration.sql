CREATE TABLE signed_diploma_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diploma_id uuid NOT NULL REFERENCES diplomas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  version_id uuid UNIQUE REFERENCES diploma_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  signing_mode varchar(20) NOT NULL CHECK (signing_mode IN ('demo', 'certificate')),
  origin_pdf_key varchar(500) NOT NULL,
  origin_pdf_hash char(64) NOT NULL CHECK (origin_pdf_hash ~ '^[0-9a-f]{64}$'),
  signed_pdf_key varchar(500),
  signed_pdf_hash char(64) UNIQUE CHECK (signed_pdf_hash ~ '^[0-9a-f]{64}$'),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz(3),
  CONSTRAINT signed_document_completion CHECK (
    (version_id IS NULL AND signed_pdf_key IS NULL AND signed_pdf_hash IS NULL AND completed_at IS NULL) OR
    (version_id IS NOT NULL AND signed_pdf_key IS NOT NULL AND signed_pdf_hash IS NOT NULL AND completed_at IS NOT NULL)
  ),
  UNIQUE(diploma_id, version)
);

CREATE TABLE diploma_pdf_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES signed_diploma_documents(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  signature_order integer NOT NULL CHECK (signature_order IN (1, 2)),
  field_name varchar(80) NOT NULL,
  actor_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  signer_name varchar(255) NOT NULL,
  certificate_sha256 char(64) NOT NULL CHECK (certificate_sha256 ~ '^[0-9a-f]{64}$'),
  certificate_serial varchar(255) NOT NULL,
  certificate_subject text NOT NULL,
  certificate_issuer text NOT NULL,
  valid_from timestamptz(3) NOT NULL,
  valid_to timestamptz(3) NOT NULL,
  signed_at timestamptz(3) NOT NULL,
  CHECK (valid_to > valid_from AND signed_at >= valid_from AND signed_at <= valid_to),
  CHECK ((signature_order = 1 AND field_name = 'CampusApproval') OR (signature_order = 2 AND field_name = 'HeadquartersIssue')),
  UNIQUE(document_id, signature_order),
  UNIQUE(document_id, actor_id),
  UNIQUE(document_id, certificate_sha256)
);

CREATE FUNCTION protect_signed_pdf() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.completed_at IS NOT NULL OR
     NEW.diploma_id IS DISTINCT FROM OLD.diploma_id OR NEW.version IS DISTINCT FROM OLD.version OR
     NEW.payload_hash IS DISTINCT FROM OLD.payload_hash OR NEW.signing_mode IS DISTINCT FROM OLD.signing_mode OR
     NEW.origin_pdf_key IS DISTINCT FROM OLD.origin_pdf_key OR NEW.origin_pdf_hash IS DISTINCT FROM OLD.origin_pdf_hash OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Signed PDF history is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER signed_pdf_immutable BEFORE UPDATE OR DELETE ON signed_diploma_documents FOR EACH ROW EXECUTE FUNCTION protect_signed_pdf();

CREATE FUNCTION validate_pdf_signature_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'PDF signature history is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM signed_diploma_documents doc JOIN diplomas d ON d.id = doc.diploma_id
      JOIN campuses c ON c.id = NEW.campus_id
      JOIN account_memberships m ON m.campus_id = c.id AND m.account_id = NEW.actor_id
      JOIN accounts a ON a.id = m.account_id
    WHERE doc.id = NEW.document_id AND c.institution_id = d.institution_id AND m.role = 'UNIVERSITY' AND m.active AND a.active
      AND ((NEW.signature_order = 1 AND NOT c.is_headquarters AND c.id = d.campus_id AND c.code = 'ORG2') OR
           (NEW.signature_order = 2 AND c.is_headquarters AND m.can_approve_diplomas AND c.code = 'ORG1'))
  ) THEN
    RAISE EXCEPTION 'PDF signature requires the correct active campus membership' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pdf_signature_actor BEFORE INSERT OR UPDATE OR DELETE ON diploma_pdf_signatures FOR EACH ROW EXECUTE FUNCTION validate_pdf_signature_actor();

CREATE FUNCTION validate_completed_pdf() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target signed_diploma_documents%ROWTYPE;
BEGIN
  SELECT * INTO target FROM signed_diploma_documents WHERE id = NEW.id;
  IF target.completed_at IS NOT NULL AND (
    (SELECT count(*) FROM diploma_pdf_signatures WHERE document_id = target.id) <> 2 OR NOT EXISTS (
      SELECT 1 FROM diploma_versions v JOIN diplomas d ON d.id = v.diploma_id
      WHERE v.id = target.version_id AND v.diploma_id = target.diploma_id AND v.version = target.version
        AND v.payload->>'signedPdfHash' = target.signed_pdf_hash AND v.payload->>'pdfSigningMode' = target.signing_mode
        AND d.workflow_status = 'APPROVED'
    )
  ) THEN
    RAISE EXCEPTION 'Completed PDF must have two signatures and match the approved immutable snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER signed_pdf_completion AFTER INSERT OR UPDATE ON signed_diploma_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_completed_pdf();

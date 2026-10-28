BEGIN;

ALTER TABLE campuses ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE diplomas DROP CONSTRAINT diploma_maker_checker;
ALTER TABLE diplomas DROP CONSTRAINT diploma_approved_actor_valid;
ALTER TABLE diplomas ADD CONSTRAINT diploma_approved_actor_valid CHECK (
  workflow_status <> 'APPROVED' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL)
);

CREATE OR REPLACE FUNCTION validate_diploma_approver_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active AND NEW.can_approve_diplomas AND NOT EXISTS (
    SELECT 1 FROM campuses WHERE id = NEW.campus_id AND is_headquarters AND active
  ) THEN
    RAISE EXCEPTION 'Diploma approvers must belong to the active main campus' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_headquarters_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.workflow_status = 'APPROVED' AND (
    NEW.issuing_campus_id IS DISTINCT FROM OLD.issuing_campus_id OR
    NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
  ) THEN
    RAISE EXCEPTION 'Approved issuing authority is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.workflow_status = 'APPROVED' AND (TG_OP = 'INSERT' OR OLD.workflow_status IS DISTINCT FROM NEW.workflow_status) AND NOT EXISTS (
    SELECT 1 FROM account_memberships m JOIN accounts a ON a.id = m.account_id JOIN campuses c ON c.id = m.campus_id
    WHERE m.account_id = NEW.approved_by_id AND m.campus_id = NEW.issuing_campus_id AND c.id = NEW.campus_id
      AND m.role = 'UNIVERSITY' AND m.active AND m.can_approve_diplomas AND a.active
      AND c.active AND c.is_headquarters AND c.institution_id = NEW.institution_id AND c.fabric_msp_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Approval requires an authorized main-campus officer' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_pdf_signature_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'PDF signature history is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM signed_diploma_documents doc JOIN diplomas d ON d.id = doc.diploma_id
      JOIN campuses c ON c.id = NEW.campus_id
      JOIN account_memberships m ON m.campus_id = c.id AND m.account_id = NEW.actor_id
      JOIN accounts a ON a.id = m.account_id
    WHERE doc.id = NEW.document_id AND doc.completed_at IS NULL AND c.id = d.campus_id
      AND c.institution_id = d.institution_id AND c.active AND c.is_headquarters
      AND m.role = 'UNIVERSITY' AND m.active AND m.can_approve_diplomas AND a.active
      AND NEW.signature_order = 1 AND NEW.field_name = 'CampusApproval'
  ) THEN
    RAISE EXCEPTION 'PDF issuance requires the active main-campus approver' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_completed_pdf() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target signed_diploma_documents%ROWTYPE;
BEGIN
  SELECT * INTO target FROM signed_diploma_documents WHERE id = NEW.id;
  IF target.completed_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM diploma_versions v JOIN diplomas d ON d.id = v.diploma_id
    WHERE v.id = target.version_id AND v.diploma_id = target.diploma_id AND v.version = target.version
      AND v.payload->>'signedPdfHash' = target.signed_pdf_hash AND v.payload->>'pdfSigningMode' = target.signing_mode
      AND d.workflow_status = 'APPROVED'
      AND (
        (v.payload->>'pdfSignaturePolicy' IN ('two-organizations-pades-bb-v1', 'two-organizations-pades-bt-pki-v2')
          AND (SELECT count(*) FROM diploma_pdf_signatures WHERE document_id = target.id) = 2)
        OR
        (v.payload->>'pdfSignaturePolicy' IN ('single-campus-one-approver-pades-bb-v1', 'single-campus-one-approver-pades-bt-pki-v1')
          AND (SELECT count(*) FROM diploma_pdf_signatures WHERE document_id = target.id) = 1
          AND jsonb_array_length(v.payload->'pdfSignatures') = 1
          AND EXISTS (
            SELECT 1 FROM diploma_pdf_signatures s WHERE s.document_id = target.id AND s.signature_order = 1
              AND s.actor_id = d.approved_by_id AND s.campus_id = d.issuing_campus_id AND s.campus_id = d.campus_id
              AND v.payload->'pdfSignatures'->0->>'actorId' = s.actor_id::text
              AND v.payload->'pdfSignatures'->0->>'campusId' = s.campus_id::text
              AND v.payload->'pdfSignatures'->0->>'certificateSha256' = s.certificate_sha256
          ))
      )
  ) THEN
    RAISE EXCEPTION 'Completed PDF must match its immutable issuance policy and approved snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TEMP TABLE single_campus_staff ON COMMIT DROP AS
  SELECT DISTINCT m.account_id FROM account_memberships m JOIN campuses c ON c.id = m.campus_id
  JOIN institutions i ON i.id = c.institution_id WHERE i.code = 'TLU' AND m.role IN ('ADMIN', 'UNIVERSITY');

DO $$
DECLARE main_id uuid; legacy_id uuid; issuer_msp text;
BEGIN
  SELECT c.id INTO main_id FROM campuses c JOIN institutions i ON i.id = c.institution_id WHERE i.code = 'TLU' AND c.code = 'ORG2';
  SELECT c.id, c.fabric_msp_id INTO legacy_id, issuer_msp FROM campuses c JOIN institutions i ON i.id = c.institution_id WHERE i.code = 'TLU' AND c.code = 'ORG1';
  IF main_id IS NOT NULL THEN
    UPDATE account_memberships SET active = false WHERE campus_id = legacy_id;
    UPDATE campuses SET active = false, is_headquarters = false, fabric_msp_id = NULL WHERE id = legacy_id;
    UPDATE campuses SET active = true, is_headquarters = true, name = 'Cơ sở chính TP. Hồ Chí Minh',
      fabric_msp_id = COALESCE(issuer_msp, 'Org1MSP') WHERE id = main_id;
    UPDATE account_memberships SET can_approve_diplomas = true WHERE campus_id = main_id AND role = 'UNIVERSITY' AND active;
    INSERT INTO account_memberships (account_id, campus_id, role, active, can_approve_diplomas)
      SELECT account_id, main_id, role, true, false FROM account_memberships WHERE campus_id = legacy_id AND role = 'ADMIN'
      ON CONFLICT (account_id, campus_id, role) DO UPDATE SET active = true;
  END IF;
END;
$$;

UPDATE accounts SET session_version = session_version + 1 WHERE id IN (SELECT account_id FROM single_campus_staff);
UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE account_id IN (SELECT account_id FROM single_campus_staff);

COMMIT;

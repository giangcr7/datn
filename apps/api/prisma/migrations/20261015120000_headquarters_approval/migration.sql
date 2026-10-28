ALTER TABLE campuses ADD COLUMN is_headquarters boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX one_headquarters_per_institution ON campuses (institution_id) WHERE is_headquarters;
ALTER TABLE account_memberships ADD COLUMN can_approve_diplomas boolean NOT NULL DEFAULT false;
ALTER TABLE account_memberships ADD CONSTRAINT approver_role_valid CHECK (NOT can_approve_diplomas OR role = 'UNIVERSITY');
ALTER TABLE diplomas ADD COLUMN issuing_campus_id uuid;
ALTER TABLE diplomas ADD CONSTRAINT diplomas_issuing_campus_id_fkey FOREIGN KEY (issuing_campus_id) REFERENCES campuses (id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE diplomas ADD CONSTRAINT diploma_issuer_scope FOREIGN KEY (issuing_campus_id, institution_id) REFERENCES campuses (id, institution_id);
CREATE INDEX diplomas_issuing_campus_id_idx ON diplomas (issuing_campus_id);
CREATE INDEX diplomas_institution_id_workflow_status_created_at_idx ON diplomas (institution_id, workflow_status, created_at);

UPDATE campuses c SET is_headquarters = true FROM institutions i WHERE c.institution_id = i.id AND i.code = 'TLU' AND c.code = 'ORG1';
UPDATE account_memberships m SET can_approve_diplomas = true FROM campuses c WHERE m.campus_id = c.id AND c.is_headquarters AND m.role = 'UNIVERSITY' AND m.active;

CREATE FUNCTION validate_diploma_approver_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.can_approve_diplomas AND NOT EXISTS (SELECT 1 FROM campuses WHERE id = NEW.campus_id AND is_headquarters) THEN
    RAISE EXCEPTION 'Diploma approvers must belong to headquarters' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER approver_membership_scope BEFORE INSERT OR UPDATE ON account_memberships FOR EACH ROW EXECUTE FUNCTION validate_diploma_approver_membership();

CREATE FUNCTION validate_headquarters_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.workflow_status = 'APPROVED' AND (NEW.issuing_campus_id IS DISTINCT FROM OLD.issuing_campus_id OR NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
    RAISE EXCEPTION 'Approved issuing authority is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.workflow_status = 'APPROVED' AND (TG_OP = 'INSERT' OR OLD.workflow_status IS DISTINCT FROM NEW.workflow_status) AND NOT EXISTS (
    SELECT 1 FROM account_memberships m JOIN accounts a ON a.id = m.account_id JOIN campuses c ON c.id = m.campus_id
    WHERE m.account_id = NEW.approved_by_id AND m.campus_id = NEW.issuing_campus_id AND m.role = 'UNIVERSITY' AND m.active AND m.can_approve_diplomas AND a.active AND c.is_headquarters AND c.institution_id = NEW.institution_id AND c.fabric_msp_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Approval requires an authorized headquarters membership' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER headquarters_approval BEFORE INSERT OR UPDATE ON diplomas FOR EACH ROW EXECUTE FUNCTION validate_headquarters_approval();

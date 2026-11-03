BEGIN;
CREATE TABLE diploma_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diploma_id uuid NOT NULL REFERENCES diplomas(id) ON DELETE RESTRICT,
  requester_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  status varchar(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION','RESOLVED','REJECTED','CANCELLED')),
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) BETWEEN 1 AND 4),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  resolved_diploma_id uuid REFERENCES diplomas(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((status = 'RESOLVED') = (resolved_diploma_id IS NOT NULL))
);
CREATE INDEX diploma_change_requests_diploma_id_status_idx ON diploma_change_requests(diploma_id, status);
CREATE INDEX diploma_change_requests_requester_id_updated_at_idx ON diploma_change_requests(requester_id, updated_at);
CREATE UNIQUE INDEX diploma_change_requests_one_active ON diploma_change_requests(diploma_id)
  WHERE status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION');
CREATE TABLE diploma_change_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES diploma_change_requests(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  status varchar(30) NOT NULL CHECK (status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION','RESOLVED','REJECTED','CANCELLED')),
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 2000),
  revision integer NOT NULL CHECK (revision > 0),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (request_id, revision)
);
CREATE FUNCTION protect_diploma_change_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' OR NEW.revision <> 1 OR NEW.resolved_diploma_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM diplomas d JOIN graduation_records g ON g.id = d.graduation_id
      JOIN accounts a ON a.student_id = g.student_id
      WHERE d.id = NEW.diploma_id AND a.id = NEW.requester_id AND a.active
    ) THEN
      RAISE EXCEPTION 'Correction request must belong to the student and start pending' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.diploma_id <> OLD.diploma_id OR NEW.requester_id <> OLD.requester_id
    OR NEW.changes <> OLD.changes OR NEW.reason <> OLD.reason OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Original correction request is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.revision <> OLD.revision + 1 OR NOT (
    (OLD.status = 'PENDING' AND NEW.status IN ('IN_REVIEW','REJECTED','CANCELLED')) OR
    (OLD.status = 'IN_REVIEW' AND NEW.status IN ('NEEDS_INFORMATION','RESOLVED','REJECTED')) OR
    (OLD.status = 'NEEDS_INFORMATION' AND NEW.status IN ('PENDING','REJECTED','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid correction request transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER diploma_change_request_guard BEFORE INSERT OR UPDATE ON diploma_change_requests
  FOR EACH ROW EXECUTE FUNCTION protect_diploma_change_request();
CREATE TRIGGER immutable_change_request_events BEFORE UPDATE OR DELETE ON diploma_change_request_events
  FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
GRANT SELECT, INSERT, UPDATE ON diploma_change_requests TO diplomachain_app;
GRANT SELECT, INSERT ON diploma_change_request_events TO diplomachain_app;
REVOKE DELETE ON diploma_change_requests FROM diplomachain_app;
REVOKE UPDATE, DELETE ON diploma_change_request_events FROM diplomachain_app;
COMMIT;

BEGIN;
CREATE TABLE inbox_receipts (
  membership_id uuid NOT NULL REFERENCES account_memberships(id) ON DELETE RESTRICT,
  key varchar(80) NOT NULL CHECK (key ~ '^[a-z-]{1,80}$'),
  fingerprint char(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  read_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (membership_id, key)
);
GRANT SELECT, INSERT, UPDATE ON inbox_receipts TO diplomachain_app;
REVOKE DELETE ON inbox_receipts FROM diplomachain_app;
COMMIT;

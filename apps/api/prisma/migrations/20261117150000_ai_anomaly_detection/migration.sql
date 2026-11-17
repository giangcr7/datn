ALTER TABLE integrity_alerts
  ADD COLUMN risk_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN severity VARCHAR(20) NOT NULL DEFAULT 'LOW',
  ADD COLUMN rule_version VARCHAR(40) NOT NULL DEFAULT 'rules-v1',
  ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'INTEGRITY',
  ADD COLUMN evidence JSONB,
  ADD COLUMN last_seen_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX integrity_alerts_severity_status_idx
  ON integrity_alerts (severity, resolved_at, last_seen_at);

CREATE INDEX integrity_alerts_rule_version_created_idx
  ON integrity_alerts (rule_version, created_at);

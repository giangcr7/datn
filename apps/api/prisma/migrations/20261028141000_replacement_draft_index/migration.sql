BEGIN;
DROP INDEX one_open_diploma_per_graduation;
CREATE UNIQUE INDEX one_open_diploma_per_graduation ON diplomas (graduation_id)
  WHERE (status = 'ACTIVE' OR (status = 'DRAFT' AND supersedes_id IS NULL))
    AND workflow_status <> 'REJECTED';
COMMIT;

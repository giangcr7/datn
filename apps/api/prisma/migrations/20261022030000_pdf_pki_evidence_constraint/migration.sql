ALTER TABLE diploma_pdf_signatures DROP CONSTRAINT pdf_validation_evidence_shape;
ALTER TABLE diploma_pdf_signatures ADD CONSTRAINT pdf_validation_evidence_shape CHECK (
  validation_evidence IS NULL OR (
    jsonb_typeof(validation_evidence) = 'object'
    AND validation_evidence->>'policy' = 'pades-bt-pki-v2'
    AND jsonb_typeof(validation_evidence->'timestamp') = 'object'
    AND validation_evidence->'timestamp'->'valid' = 'true'::jsonb
    AND validation_evidence->'timestamp'->>'tokenSha256' ~ '^[0-9a-f]{64}$'
    AND validation_evidence->>'trustAnchorSha256' ~ '^[0-9a-f]{64}$'
    AND CASE WHEN jsonb_typeof(validation_evidence->'revocation') = 'array'
      THEN jsonb_array_length(validation_evidence->'revocation') > 0 ELSE false END
    AND CASE WHEN jsonb_typeof(validation_evidence->'timestamp'->'revocation') = 'array'
      THEN jsonb_array_length(validation_evidence->'timestamp'->'revocation') > 0 ELSE false END
  ) IS TRUE
);

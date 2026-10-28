ALTER TABLE diploma_pdf_signatures ADD COLUMN validation_evidence jsonb;
ALTER TABLE diploma_pdf_signatures ADD CONSTRAINT pdf_validation_evidence_shape CHECK (
  validation_evidence IS NULL OR (
    jsonb_typeof(validation_evidence) = 'object' AND validation_evidence->>'policy' = 'pades-bt-pki-v2'
    AND validation_evidence->'timestamp'->>'valid' = 'true'
    AND jsonb_typeof(validation_evidence->'revocation') = 'array'
    AND jsonb_array_length(validation_evidence->'revocation') > 0
  )
);

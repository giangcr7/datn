CREATE TABLE "diploma_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diploma_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "recipient_email" VARCHAR(320) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "first_accessed_at" TIMESTAMPTZ(3),
    "last_accessed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diploma_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "diploma_shares_token_hash_key" ON "diploma_shares"("token_hash");
CREATE INDEX "diploma_shares_diploma_id_owner_id_revoked_at_idx" ON "diploma_shares"("diploma_id", "owner_id", "revoked_at");
CREATE INDEX "diploma_shares_recipient_email_expires_at_idx" ON "diploma_shares"("recipient_email", "expires_at");

ALTER TABLE "diploma_shares" ADD CONSTRAINT "diploma_shares_diploma_id_fkey"
  FOREIGN KEY ("diploma_id") REFERENCES "diplomas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "diploma_shares" ADD CONSTRAINT "diploma_shares_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "diploma_type_catalog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_en" VARCHAR(255),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diploma_type_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "diploma_type_catalog_institution_id_code_key"
    ON "diploma_type_catalog"("institution_id", "code");
CREATE INDEX "diploma_type_catalog_institution_id_active_idx"
    ON "diploma_type_catalog"("institution_id", "active");

ALTER TABLE "diploma_type_catalog"
    ADD CONSTRAINT "diploma_type_catalog_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "diploma_type_catalog" ("institution_id", "code", "name", "name_en")
SELECT institution."id", defaults."code", defaults."name", defaults."name_en"
FROM "institutions" AS institution
CROSS JOIN (
    VALUES
        ('BACHELOR', 'Cử nhân', 'Bachelor'),
        ('ENGINEER', 'Kỹ sư', 'Engineer'),
        ('MASTER', 'Thạc sĩ', 'Master'),
        ('DOCTOR', 'Tiến sĩ', 'Doctor'),
        ('OTHER', 'Loại khác', 'Other')
) AS defaults("code", "name", "name_en")
ON CONFLICT ("institution_id", "code") DO NOTHING;

CREATE TYPE "MunicipalFeeCalcKind" AS ENUM (
  'FIXED',
  'ANNUAL_MEMBERSHIP',
  'AREA_LEVY',
  'LATE_MEMBERSHIP',
  'LATE_AREA_LEVY'
);

ALTER TABLE "municipal_fees"
ADD COLUMN "calcKind" "MunicipalFeeCalcKind" NOT NULL DEFAULT 'FIXED';

CREATE INDEX "municipal_fees_calcKind_idx" ON "municipal_fees"("calcKind");

ALTER TABLE "job_types"
ADD COLUMN "annualAreaTariff" DECIMAL(18,0);

CREATE INDEX "job_types_annualAreaTariff_idx" ON "job_types"("annualAreaTariff");

ALTER TABLE "case_files"
ADD COLUMN "firstIssuedAt" DATE;

CREATE INDEX "case_files_firstIssuedAt_idx" ON "case_files"("firstIssuedAt");

UPDATE "case_files" cf
SET "firstIssuedAt" = sub.first_issued
FROM (
  SELECT cr."caseFileId" AS id, MIN(crt."currentIssuedAt") AS first_issued
  FROM "case_requests" cr
  JOIN "case_renewal_terms" crt ON crt."requestId" = cr.id
  GROUP BY cr."caseFileId"
) sub
WHERE cf.id = sub.id
  AND cf."firstIssuedAt" IS NULL;

UPDATE "case_files"
SET "firstIssuedAt" = "licenseIssuedAt"
WHERE "firstIssuedAt" IS NULL
  AND "licenseIssuedAt" IS NOT NULL;

ALTER TABLE "case_request_fees"
ADD COLUMN "calcKind" "MunicipalFeeCalcKind" NOT NULL DEFAULT 'FIXED',
ADD COLUMN "calcInputs" JSONB;

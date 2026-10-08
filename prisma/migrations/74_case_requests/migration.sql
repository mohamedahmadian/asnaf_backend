-- CreateEnum
CREATE TYPE "CaseRequestType" AS ENUM ('ISSUANCE', 'RENEWAL', 'STEWARDSHIP', 'AUCTION');

-- CreateEnum
CREATE TYPE "CaseRequestStatus" AS ENUM ('OPEN', 'ISSUED');

-- AlterTable
ALTER TABLE "case_files" ADD COLUMN "licenseNumber" TEXT,
ADD COLUMN "licenseIssuedAt" DATE,
ADD COLUMN "licenseExpiresAt" DATE;

-- CreateTable
CREATE TABLE "case_requests" (
    "id" TEXT NOT NULL,
    "caseFileId" TEXT NOT NULL,
    "type" "CaseRequestType" NOT NULL,
    "number" TEXT NOT NULL,
    "status" "CaseRequestStatus" NOT NULL DEFAULT 'OPEN',
    "formationStep" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_files_licenseNumber_key" ON "case_files"("licenseNumber");

-- CreateIndex
CREATE INDEX "case_files_licenseIssuedAt_idx" ON "case_files"("licenseIssuedAt");

-- CreateIndex
CREATE INDEX "case_files_licenseExpiresAt_idx" ON "case_files"("licenseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "case_requests_number_key" ON "case_requests"("number");

-- CreateIndex
CREATE INDEX "case_requests_caseFileId_idx" ON "case_requests"("caseFileId");

-- CreateIndex
CREATE INDEX "case_requests_type_idx" ON "case_requests"("type");

-- CreateIndex
CREATE INDEX "case_requests_status_idx" ON "case_requests"("status");

-- CreateIndex
CREATE INDEX "case_requests_formationStep_idx" ON "case_requests"("formationStep");

-- CreateIndex
CREATE INDEX "case_requests_createdAt_idx" ON "case_requests"("createdAt");

-- هر پرونده فقط یک درخواست صدور دارد
CREATE UNIQUE INDEX "case_requests_one_issuance" ON "case_requests"("caseFileId") WHERE "type" = 'ISSUANCE';

-- AddForeignKey
ALTER TABLE "case_requests" ADD CONSTRAINT "case_requests_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- پرونده‌های موجود: یک درخواست صدور، و اگر به صدور رسیده باشند شماره مجوز
WITH ranked AS (
    SELECT
        cf."id",
        cf."formationStep",
        cf."createdAt",
        cf."premiseOwnership",
        cf."leaseExpiresAt",
        (
            CASE
                WHEN EXTRACT(MONTH FROM cf."createdAt") < 3
                    OR (EXTRACT(MONTH FROM cf."createdAt") = 3 AND EXTRACT(DAY FROM cf."createdAt") < 21)
                THEN EXTRACT(YEAR FROM cf."createdAt")::int - 622
                ELSE EXTRACT(YEAR FROM cf."createdAt")::int - 621
            END
        ) AS jy,
        row_number() OVER (
            PARTITION BY (
                CASE
                    WHEN EXTRACT(MONTH FROM cf."createdAt") < 3
                        OR (EXTRACT(MONTH FROM cf."createdAt") = 3 AND EXTRACT(DAY FROM cf."createdAt") < 21)
                    THEN EXTRACT(YEAR FROM cf."createdAt")::int - 622
                    ELSE EXTRACT(YEAR FROM cf."createdAt")::int - 621
                END
            )
            ORDER BY cf."createdAt", cf."id"
        ) AS seq
    FROM "case_files" cf
    WHERE cf."formationStep" > 0
)
INSERT INTO "case_requests" (
    "id",
    "caseFileId",
    "type",
    "number",
    "status",
    "formationStep",
    "completedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    ranked."id",
    'ISSUANCE',
    'REQ-' || ranked.jy::text || '-' || lpad(ranked.seq::text, 6, '0'),
    CASE WHEN ranked."formationStep" >= 6 THEN 'ISSUED'::"CaseRequestStatus" ELSE 'OPEN'::"CaseRequestStatus" END,
    ranked."formationStep",
    CASE WHEN ranked."formationStep" >= 6 THEN CURRENT_TIMESTAMP ELSE NULL END,
    ranked."createdAt",
    CURRENT_TIMESTAMP
FROM ranked;

WITH issued AS (
    SELECT
        cf."id",
        cf."premiseOwnership",
        cf."leaseExpiresAt",
        (
            CASE
                WHEN EXTRACT(MONTH FROM cf."createdAt") < 3
                    OR (EXTRACT(MONTH FROM cf."createdAt") = 3 AND EXTRACT(DAY FROM cf."createdAt") < 21)
                THEN EXTRACT(YEAR FROM cf."createdAt")::int - 622
                ELSE EXTRACT(YEAR FROM cf."createdAt")::int - 621
            END
        ) AS jy,
        row_number() OVER (
            PARTITION BY (
                CASE
                    WHEN EXTRACT(MONTH FROM cf."createdAt") < 3
                        OR (EXTRACT(MONTH FROM cf."createdAt") = 3 AND EXTRACT(DAY FROM cf."createdAt") < 21)
                    THEN EXTRACT(YEAR FROM cf."createdAt")::int - 622
                    ELSE EXTRACT(YEAR FROM cf."createdAt")::int - 621
                END
            )
            ORDER BY cf."createdAt", cf."id"
        ) AS seq
    FROM "case_files" cf
    WHERE cf."formationStep" >= 6
)
UPDATE "case_files" AS cf
SET
    "licenseNumber" = issued.jy::text || '-' || lpad(issued.seq::text, 5, '0'),
    "licenseIssuedAt" = CURRENT_DATE,
    "licenseExpiresAt" = LEAST(
        (CURRENT_DATE + INTERVAL '1 year')::date,
        CASE
            WHEN issued."premiseOwnership" = 'RENTED' AND issued."leaseExpiresAt" IS NOT NULL THEN issued."leaseExpiresAt"
            ELSE (CURRENT_DATE + INTERVAL '1 year')::date
        END
    )
FROM issued
WHERE cf."id" = issued."id";

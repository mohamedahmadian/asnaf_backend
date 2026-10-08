CREATE TABLE "case_files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formationStep" INTEGER NOT NULL DEFAULT 0,
    "trackingCode" TEXT,
    "businessUnitTitle" TEXT,
    "activityJobId" TEXT,
    "previousOccupation" "PreviousOccupation",
    "posDeviceCount" INTEGER,
    "premiseCityId" TEXT,
    "premiseEstablishment" "PremiseEstablishment",
    "premiseComplexId" TEXT,
    "premiseAddress" TEXT,
    "premisePlaque" TEXT,
    "premisePlaqueSeries" TEXT,
    "premiseFloor" TEXT,
    "premiseUnitNo" TEXT,
    "premisePostalCode" TEXT,
    "premisePhone" TEXT,
    "premiseFax" TEXT,
    "premiseGeoPosition" "PremiseGeoPosition",
    "premisePublicAccess" "PremisePublicAccess",
    "registrationPlaceId" TEXT,
    "premiseOwnership" "PremiseOwnership",
    "premiseDeedNo" TEXT,
    "premiseArea" DECIMAL(12,2),
    "leaseIssuedAt" DATE,
    "leaseExpiresAt" DATE,
    "leaseAgency" TEXT,
    "premiseOwnerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_files_pkey" PRIMARY KEY ("id")
);

INSERT INTO "case_files" (
    "id",
    "userId",
    "formationStep",
    "trackingCode",
    "businessUnitTitle",
    "activityJobId",
    "previousOccupation",
    "posDeviceCount",
    "premiseCityId",
    "premiseEstablishment",
    "premiseComplexId",
    "premiseAddress",
    "premisePlaque",
    "premisePlaqueSeries",
    "premiseFloor",
    "premiseUnitNo",
    "premisePostalCode",
    "premisePhone",
    "premiseFax",
    "premiseGeoPosition",
    "premisePublicAccess",
    "registrationPlaceId",
    "premiseOwnership",
    "premiseDeedNo",
    "premiseArea",
    "leaseIssuedAt",
    "leaseExpiresAt",
    "leaseAgency",
    "premiseOwnerName",
    "createdAt",
    "updatedAt"
)
SELECT
    u."id",
    u."id",
    u."formationStep",
    u."caseTrackingCode",
    u."businessUnitTitle",
    u."activityJobId",
    u."previousOccupation",
    u."posDeviceCount",
    u."premiseCityId",
    u."premiseEstablishment",
    u."premiseComplexId",
    u."premiseAddress",
    u."premisePlaque",
    u."premisePlaqueSeries",
    u."premiseFloor",
    u."premiseUnitNo",
    u."premisePostalCode",
    u."premisePhone",
    u."premiseFax",
    u."premiseGeoPosition",
    u."premisePublicAccess",
    u."registrationPlaceId",
    u."premiseOwnership",
    u."premiseDeedNo",
    u."premiseArea",
    u."leaseIssuedAt",
    u."leaseExpiresAt",
    u."leaseAgency",
    u."premiseOwnerName",
    u."createdAt",
    u."updatedAt"
FROM "users" u
WHERE u."formationStep" > 0
   OR u."caseTrackingCode" IS NOT NULL
   OR u."activityJobId" IS NOT NULL
   OR u."businessUnitTitle" IS NOT NULL
   OR EXISTS (SELECT 1 FROM "case_inquiries" ci WHERE ci."userId" = u."id")
   OR EXISTS (SELECT 1 FROM "case_places_reviews" pr WHERE pr."userId" = u."id")
   OR EXISTS (SELECT 1 FROM "case_management_reviews" mr WHERE mr."userId" = u."id");

CREATE UNIQUE INDEX "case_files_trackingCode_key" ON "case_files"("trackingCode");
CREATE INDEX "case_files_userId_idx" ON "case_files"("userId");
CREATE INDEX "case_files_formationStep_idx" ON "case_files"("formationStep");
CREATE INDEX "case_files_activityJobId_idx" ON "case_files"("activityJobId");
CREATE INDEX "case_files_premiseCityId_idx" ON "case_files"("premiseCityId");
CREATE INDEX "case_files_premiseComplexId_idx" ON "case_files"("premiseComplexId");
CREATE INDEX "case_files_registrationPlaceId_idx" ON "case_files"("registrationPlaceId");
CREATE INDEX "case_files_createdAt_idx" ON "case_files"("createdAt");

ALTER TABLE "case_files" ADD CONSTRAINT "case_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_activityJobId_fkey" FOREIGN KEY ("activityJobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_premiseCityId_fkey" FOREIGN KEY ("premiseCityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_premiseComplexId_fkey" FOREIGN KEY ("premiseComplexId") REFERENCES "commercial_complexes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_registrationPlaceId_fkey" FOREIGN KEY ("registrationPlaceId") REFERENCES "registration_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_inquiries" ADD COLUMN "caseFileId" TEXT;
UPDATE "case_inquiries" SET "caseFileId" = "userId";
ALTER TABLE "case_inquiries" ALTER COLUMN "caseFileId" SET NOT NULL;
ALTER TABLE "case_inquiries" DROP CONSTRAINT "case_inquiries_userId_fkey";
DROP INDEX "case_inquiries_userId_inquiryCenterId_key";
DROP INDEX "case_inquiries_userId_idx";
ALTER TABLE "case_inquiries" DROP COLUMN "userId";
CREATE UNIQUE INDEX "case_inquiries_caseFileId_inquiryCenterId_key" ON "case_inquiries"("caseFileId", "inquiryCenterId");
CREATE INDEX "case_inquiries_caseFileId_idx" ON "case_inquiries"("caseFileId");
ALTER TABLE "case_inquiries" ADD CONSTRAINT "case_inquiries_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_places_reviews" ADD COLUMN "caseFileId" TEXT;
UPDATE "case_places_reviews" SET "caseFileId" = "userId";
ALTER TABLE "case_places_reviews" ALTER COLUMN "caseFileId" SET NOT NULL;
ALTER TABLE "case_places_reviews" DROP CONSTRAINT "case_places_reviews_userId_fkey";
DROP INDEX "case_places_reviews_userId_key";
ALTER TABLE "case_places_reviews" DROP COLUMN "userId";
CREATE UNIQUE INDEX "case_places_reviews_caseFileId_key" ON "case_places_reviews"("caseFileId");
ALTER TABLE "case_places_reviews" ADD CONSTRAINT "case_places_reviews_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_management_reviews" ADD COLUMN "caseFileId" TEXT;
UPDATE "case_management_reviews" SET "caseFileId" = "userId";
ALTER TABLE "case_management_reviews" ALTER COLUMN "caseFileId" SET NOT NULL;
ALTER TABLE "case_management_reviews" DROP CONSTRAINT "case_management_reviews_userId_fkey";
DROP INDEX "case_management_reviews_userId_workUnitId_roleId_key";
DROP INDEX "case_management_reviews_userId_idx";
ALTER TABLE "case_management_reviews" DROP COLUMN "userId";
CREATE UNIQUE INDEX "case_management_reviews_caseFileId_workUnitId_roleId_key" ON "case_management_reviews"("caseFileId", "workUnitId", "roleId");
CREATE INDEX "case_management_reviews_caseFileId_idx" ON "case_management_reviews"("caseFileId");
ALTER TABLE "case_management_reviews" ADD CONSTRAINT "case_management_reviews_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "violations" ADD COLUMN "caseFileId" TEXT;
UPDATE "violations" SET "caseFileId" = "caseUserId"
WHERE "caseUserId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "case_files" cf WHERE cf."id" = "violations"."caseUserId");
CREATE INDEX "violations_caseFileId_idx" ON "violations"("caseFileId");
ALTER TABLE "violations" ADD CONSTRAINT "violations_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "users_caseTrackingCode_key";
DROP INDEX "users_activityJobId_idx";
DROP INDEX "users_premiseCityId_idx";
DROP INDEX "users_premiseComplexId_idx";
DROP INDEX "users_registrationPlaceId_idx";

ALTER TABLE "users" DROP CONSTRAINT "users_activityJobId_fkey";
ALTER TABLE "users" DROP CONSTRAINT "users_premiseCityId_fkey";
ALTER TABLE "users" DROP CONSTRAINT "users_premiseComplexId_fkey";
ALTER TABLE "users" DROP CONSTRAINT "users_registrationPlaceId_fkey";

ALTER TABLE "users"
DROP COLUMN "formationStep",
DROP COLUMN "caseTrackingCode",
DROP COLUMN "businessUnitTitle",
DROP COLUMN "activityJobId",
DROP COLUMN "previousOccupation",
DROP COLUMN "posDeviceCount",
DROP COLUMN "premiseCityId",
DROP COLUMN "premiseEstablishment",
DROP COLUMN "premiseComplexId",
DROP COLUMN "premiseAddress",
DROP COLUMN "premisePlaque",
DROP COLUMN "premisePlaqueSeries",
DROP COLUMN "premiseFloor",
DROP COLUMN "premiseUnitNo",
DROP COLUMN "premisePostalCode",
DROP COLUMN "premisePhone",
DROP COLUMN "premiseFax",
DROP COLUMN "premiseGeoPosition",
DROP COLUMN "premisePublicAccess",
DROP COLUMN "registrationPlaceId",
DROP COLUMN "premiseOwnership",
DROP COLUMN "premiseDeedNo",
DROP COLUMN "premiseArea",
DROP COLUMN "leaseIssuedAt",
DROP COLUMN "leaseExpiresAt",
DROP COLUMN "leaseAgency",
DROP COLUMN "premiseOwnerName";

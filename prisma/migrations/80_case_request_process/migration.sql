-- مقادیر جدید enum در همین تراکنش استفاده نمی‌شوند.
ALTER TYPE "CaseRequestType" ADD VALUE 'LOCATION_CHANGE';
ALTER TYPE "CaseRequestStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "CaseRequestStatus" ADD VALUE 'REJECTED';
ALTER TYPE "CaseRequestStatus" ADD VALUE 'CANCELLED';

CREATE UNIQUE INDEX "case_requests_one_open" ON "case_requests" ("caseFileId") WHERE "status" = 'OPEN';

CREATE TABLE "case_request_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStatus" "CaseRequestStatus",
    "toStatus" "CaseRequestStatus" NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_request_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_renewal_terms" (
    "requestId" TEXT NOT NULL,
    "currentIssuedAt" DATE NOT NULL,
    "currentExpiresAt" DATE NOT NULL,
    "nextIssuedAt" DATE NOT NULL,
    "nextExpiresAt" DATE NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "case_renewal_terms_pkey" PRIMARY KEY ("requestId")
);

CREATE TABLE "case_location_drafts" (
    "requestId" TEXT NOT NULL,
    "premiseCityId" TEXT,
    "premiseEstablishment" "PremiseEstablishment",
    "premiseComplexId" TEXT,
    "premiseAddress" TEXT,
    "premiseAddressEn" TEXT,
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_location_drafts_pkey" PRIMARY KEY ("requestId")
);

CREATE TABLE "document_requirements" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "requestType" "CaseRequestType" NOT NULL,
    "jobId" TEXT,
    "gender" "DocumentGender" NOT NULL DEFAULT 'BOTH',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inquiry_requirements" (
    "id" TEXT NOT NULL,
    "inquiryCenterId" TEXT NOT NULL,
    "requestType" "CaseRequestType" NOT NULL,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inquiry_requirements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_requirements_scope" ON "document_requirements" ("documentId", "requestType", "jobId") NULLS NOT DISTINCT;
CREATE INDEX "document_requirements_documentId_idx" ON "document_requirements"("documentId");
CREATE INDEX "document_requirements_requestType_idx" ON "document_requirements"("requestType");
CREATE INDEX "document_requirements_jobId_idx" ON "document_requirements"("jobId");

CREATE UNIQUE INDEX "inquiry_requirements_scope" ON "inquiry_requirements" ("inquiryCenterId", "requestType", "jobId") NULLS NOT DISTINCT;
CREATE INDEX "inquiry_requirements_inquiryCenterId_idx" ON "inquiry_requirements"("inquiryCenterId");
CREATE INDEX "inquiry_requirements_requestType_idx" ON "inquiry_requirements"("requestType");
CREATE INDEX "inquiry_requirements_jobId_idx" ON "inquiry_requirements"("jobId");

INSERT INTO "document_requirements" ("id", "documentId", "requestType", "jobId", "gender", "isRequired", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'ISSUANCE', NULL, "gender", "isRequired", CURRENT_TIMESTAMP
FROM "documents"
WHERE "isFixed" = true;

INSERT INTO "document_requirements" ("id", "documentId", "requestType", "jobId", "gender", "isRequired", "updatedAt")
SELECT gen_random_uuid()::text, "documentId", 'ISSUANCE', "jobId", "gender", "isRequired", CURRENT_TIMESTAMP
FROM "job_documents";

INSERT INTO "inquiry_requirements" ("id", "inquiryCenterId", "requestType", "jobId", "updatedAt")
SELECT gen_random_uuid()::text, "inquiryCenterId", 'ISSUANCE', "jobId", CURRENT_TIMESTAMP
FROM "job_inquiry_centers";

ALTER TABLE "case_inquiries" ADD COLUMN "caseRequestId" TEXT;
UPDATE "case_inquiries" AS inquiry
SET "caseRequestId" = request."id"
FROM "case_requests" AS request
WHERE request."caseFileId" = inquiry."caseFileId" AND request."type" = 'ISSUANCE';
DELETE FROM "case_inquiry_files"
WHERE "caseInquiryId" IN (SELECT "id" FROM "case_inquiries" WHERE "caseRequestId" IS NULL);
DELETE FROM "case_inquiries" WHERE "caseRequestId" IS NULL;
ALTER TABLE "case_inquiries" ALTER COLUMN "caseRequestId" SET NOT NULL;
DROP INDEX "case_inquiries_caseFileId_inquiryCenterId_key";
CREATE UNIQUE INDEX "case_inquiries_caseRequestId_inquiryCenterId_key" ON "case_inquiries"("caseRequestId", "inquiryCenterId");
CREATE INDEX "case_inquiries_caseRequestId_idx" ON "case_inquiries"("caseRequestId");

ALTER TABLE "case_places_reviews" ADD COLUMN "caseRequestId" TEXT;
UPDATE "case_places_reviews" AS review
SET "caseRequestId" = request."id"
FROM "case_requests" AS request
WHERE request."caseFileId" = review."caseFileId" AND request."type" = 'ISSUANCE';
DELETE FROM "case_places_files"
WHERE "reviewId" IN (SELECT "id" FROM "case_places_reviews" WHERE "caseRequestId" IS NULL);
DELETE FROM "case_places_reviews" WHERE "caseRequestId" IS NULL;
ALTER TABLE "case_places_reviews" ALTER COLUMN "caseRequestId" SET NOT NULL;
DROP INDEX "case_places_reviews_caseFileId_key";
CREATE UNIQUE INDEX "case_places_reviews_caseRequestId_key" ON "case_places_reviews"("caseRequestId");
CREATE INDEX "case_places_reviews_caseFileId_idx" ON "case_places_reviews"("caseFileId");

ALTER TABLE "case_management_reviews" ADD COLUMN "caseRequestId" TEXT;
UPDATE "case_management_reviews" AS review
SET "caseRequestId" = request."id"
FROM "case_requests" AS request
WHERE request."caseFileId" = review."caseFileId" AND request."type" = 'ISSUANCE';
DELETE FROM "case_management_review_files"
WHERE "reviewId" IN (SELECT "id" FROM "case_management_reviews" WHERE "caseRequestId" IS NULL);
DELETE FROM "case_management_reviews" WHERE "caseRequestId" IS NULL;
ALTER TABLE "case_management_reviews" ALTER COLUMN "caseRequestId" SET NOT NULL;
DROP INDEX "case_management_reviews_caseFileId_workUnitId_roleId_key";
CREATE UNIQUE INDEX "case_management_reviews_caseRequestId_workUnitId_roleId_key" ON "case_management_reviews"("caseRequestId", "workUnitId", "roleId");
CREATE INDEX "case_management_reviews_caseRequestId_idx" ON "case_management_reviews"("caseRequestId");

ALTER TABLE "case_activity_documents" ADD COLUMN "caseRequestId" TEXT;
UPDATE "case_activity_documents" AS document
SET "caseRequestId" = request."id"
FROM "case_requests" AS request
WHERE request."caseFileId" = document."caseFileId" AND request."type" = 'ISSUANCE';
DELETE FROM "case_activity_document_versions"
WHERE "caseActivityDocumentId" IN (SELECT "id" FROM "case_activity_documents" WHERE "caseRequestId" IS NULL);
DELETE FROM "case_activity_documents" WHERE "caseRequestId" IS NULL;
ALTER TABLE "case_activity_documents" ALTER COLUMN "caseRequestId" SET NOT NULL;
DROP INDEX "case_activity_documents_caseFileId_documentId_key";
CREATE UNIQUE INDEX "case_activity_documents_caseRequestId_documentId_key" ON "case_activity_documents"("caseRequestId", "documentId");
CREATE INDEX "case_activity_documents_caseRequestId_idx" ON "case_activity_documents"("caseRequestId");

CREATE INDEX "case_request_events_requestId_idx" ON "case_request_events"("requestId");
CREATE INDEX "case_request_events_actorId_idx" ON "case_request_events"("actorId");
CREATE INDEX "case_request_events_createdAt_idx" ON "case_request_events"("createdAt");
CREATE INDEX "case_renewal_terms_currentExpiresAt_idx" ON "case_renewal_terms"("currentExpiresAt");
CREATE INDEX "case_location_drafts_premiseCityId_idx" ON "case_location_drafts"("premiseCityId");
CREATE INDEX "case_location_drafts_premiseComplexId_idx" ON "case_location_drafts"("premiseComplexId");
CREATE INDEX "case_location_drafts_registrationPlaceId_idx" ON "case_location_drafts"("registrationPlaceId");

ALTER TABLE "case_request_events" ADD CONSTRAINT "case_request_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "case_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_request_events" ADD CONSTRAINT "case_request_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_renewal_terms" ADD CONSTRAINT "case_renewal_terms_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "case_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_location_drafts" ADD CONSTRAINT "case_location_drafts_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "case_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_location_drafts" ADD CONSTRAINT "case_location_drafts_premiseCityId_fkey" FOREIGN KEY ("premiseCityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_location_drafts" ADD CONSTRAINT "case_location_drafts_premiseComplexId_fkey" FOREIGN KEY ("premiseComplexId") REFERENCES "commercial_complexes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_location_drafts" ADD CONSTRAINT "case_location_drafts_registrationPlaceId_fkey" FOREIGN KEY ("registrationPlaceId") REFERENCES "registration_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inquiry_requirements" ADD CONSTRAINT "inquiry_requirements_inquiryCenterId_fkey" FOREIGN KEY ("inquiryCenterId") REFERENCES "inquiry_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inquiry_requirements" ADD CONSTRAINT "inquiry_requirements_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_inquiries" ADD CONSTRAINT "case_inquiries_caseRequestId_fkey" FOREIGN KEY ("caseRequestId") REFERENCES "case_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_places_reviews" ADD CONSTRAINT "case_places_reviews_caseRequestId_fkey" FOREIGN KEY ("caseRequestId") REFERENCES "case_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_management_reviews" ADD CONSTRAINT "case_management_reviews_caseRequestId_fkey" FOREIGN KEY ("caseRequestId") REFERENCES "case_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_activity_documents" ADD CONSTRAINT "case_activity_documents_caseRequestId_fkey" FOREIGN KEY ("caseRequestId") REFERENCES "case_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

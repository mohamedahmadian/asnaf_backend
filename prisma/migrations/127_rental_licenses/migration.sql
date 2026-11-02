-- CreateEnum
CREATE TYPE "RentalRequestType" AS ENUM ('ISSUANCE', 'RENEWAL');

-- CreateEnum
CREATE TYPE "RentalRequestStatus" AS ENUM ('OPEN', 'ISSUED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RentalLicenseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED');

-- CreateTable
CREATE TABLE "rental_license_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "contractYears" INTEGER NOT NULL DEFAULT 1,
    "signerName" TEXT,
    "signerTitle" TEXT,
    "signatureId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_license_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_identity_documents" (
    "documentId" TEXT NOT NULL,
    "gender" "DocumentGender" NOT NULL DEFAULT 'BOTH',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_identity_documents_pkey" PRIMARY KEY ("documentId")
);

-- CreateTable
CREATE TABLE "rental_document_requirements" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "gender" "DocumentGender" NOT NULL DEFAULT 'BOTH',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_process_management_roles" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_process_management_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_licenses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RentalLicenseStatus" NOT NULL DEFAULT 'DRAFT',
    "formationStep" INTEGER NOT NULL DEFAULT 0,
    "trackingCode" TEXT,
    "licenseNumber" TEXT,
    "licenseIssuedAt" DATE,
    "firstIssuedAt" DATE,
    "licenseExpiresAt" DATE,
    "premiseCityId" TEXT,
    "premiseEstablishment" "PremiseEstablishment",
    "premiseComplexId" TEXT,
    "premiseAddress" TEXT,
    "premiseAddressEn" TEXT,
    "urbanZoneId" TEXT,
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
    "premiseOwnership" "PremiseOwnership" NOT NULL DEFAULT 'RENTED',
    "premiseDeedNo" TEXT,
    "premiseArea" DECIMAL(12,2),
    "leaseIssuedAt" DATE,
    "leaseExpiresAt" DATE,
    "leaseAgency" TEXT,
    "premiseOwnerName" TEXT,
    "premiseOwnerNationalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_premise_files" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "kind" "CasePremiseFileKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_premise_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_requests" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "type" "RentalRequestType" NOT NULL,
    "number" TEXT NOT NULL,
    "status" "RentalRequestStatus" NOT NULL DEFAULT 'OPEN',
    "formationStep" INTEGER NOT NULL DEFAULT 0,
    "intakeSubmittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_request_documents" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_request_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_request_document_versions" (
    "id" TEXT NOT NULL,
    "documentRowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "DocumentSource" NOT NULL DEFAULT 'MANUAL',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_request_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_management_reviews" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "CaseInquiryStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "CaseInquiryChannel",
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_management_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_management_review_files" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_management_review_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rental_license_settings_signatureId_key" ON "rental_license_settings"("signatureId");

-- CreateIndex
CREATE INDEX "rental_identity_documents_createdAt_idx" ON "rental_identity_documents"("createdAt");

-- CreateIndex
CREATE INDEX "rental_identity_documents_gender_idx" ON "rental_identity_documents"("gender");

-- CreateIndex
CREATE INDEX "rental_identity_documents_isRequired_idx" ON "rental_identity_documents"("isRequired");

-- CreateIndex
CREATE UNIQUE INDEX "rental_document_requirements_documentId_key" ON "rental_document_requirements"("documentId");

-- CreateIndex
CREATE INDEX "rental_document_requirements_createdAt_idx" ON "rental_document_requirements"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rental_process_management_roles_roleId_key" ON "rental_process_management_roles"("roleId");

-- CreateIndex
CREATE INDEX "rental_process_management_roles_createdAt_idx" ON "rental_process_management_roles"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rental_licenses_userId_key" ON "rental_licenses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "rental_licenses_trackingCode_key" ON "rental_licenses"("trackingCode");

-- CreateIndex
CREATE UNIQUE INDEX "rental_licenses_licenseNumber_key" ON "rental_licenses"("licenseNumber");

-- CreateIndex
CREATE INDEX "rental_licenses_status_idx" ON "rental_licenses"("status");

-- CreateIndex
CREATE INDEX "rental_licenses_formationStep_idx" ON "rental_licenses"("formationStep");

-- CreateIndex
CREATE INDEX "rental_licenses_premiseCityId_idx" ON "rental_licenses"("premiseCityId");

-- CreateIndex
CREATE INDEX "rental_licenses_premiseComplexId_idx" ON "rental_licenses"("premiseComplexId");

-- CreateIndex
CREATE INDEX "rental_licenses_urbanZoneId_idx" ON "rental_licenses"("urbanZoneId");

-- CreateIndex
CREATE INDEX "rental_licenses_registrationPlaceId_idx" ON "rental_licenses"("registrationPlaceId");

-- CreateIndex
CREATE INDEX "rental_licenses_licenseIssuedAt_idx" ON "rental_licenses"("licenseIssuedAt");

-- CreateIndex
CREATE INDEX "rental_licenses_licenseExpiresAt_idx" ON "rental_licenses"("licenseExpiresAt");

-- CreateIndex
CREATE INDEX "rental_licenses_createdAt_idx" ON "rental_licenses"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rental_premise_files_licenseId_kind_key" ON "rental_premise_files"("licenseId", "kind");

-- CreateIndex
CREATE INDEX "rental_premise_files_licenseId_idx" ON "rental_premise_files"("licenseId");

-- CreateIndex
CREATE INDEX "rental_premise_files_storageKey_idx" ON "rental_premise_files"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "rental_requests_number_key" ON "rental_requests"("number");

-- CreateIndex
CREATE INDEX "rental_requests_licenseId_idx" ON "rental_requests"("licenseId");

-- CreateIndex
CREATE INDEX "rental_requests_type_idx" ON "rental_requests"("type");

-- CreateIndex
CREATE INDEX "rental_requests_status_idx" ON "rental_requests"("status");

-- CreateIndex
CREATE INDEX "rental_requests_formationStep_idx" ON "rental_requests"("formationStep");

-- CreateIndex
CREATE INDEX "rental_requests_createdAt_idx" ON "rental_requests"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rental_request_documents_requestId_documentId_key" ON "rental_request_documents"("requestId", "documentId");

-- CreateIndex
CREATE INDEX "rental_request_documents_requestId_idx" ON "rental_request_documents"("requestId");

-- CreateIndex
CREATE INDEX "rental_request_documents_documentId_idx" ON "rental_request_documents"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "rental_request_document_versions_documentRowId_version_key" ON "rental_request_document_versions"("documentRowId", "version");

-- CreateIndex
CREATE INDEX "rental_request_document_versions_documentRowId_idx" ON "rental_request_document_versions"("documentRowId");

-- CreateIndex
CREATE INDEX "rental_request_document_versions_storageKey_idx" ON "rental_request_document_versions"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "rental_management_reviews_requestId_roleId_key" ON "rental_management_reviews"("requestId", "roleId");

-- CreateIndex
CREATE INDEX "rental_management_reviews_licenseId_idx" ON "rental_management_reviews"("licenseId");

-- CreateIndex
CREATE INDEX "rental_management_reviews_requestId_idx" ON "rental_management_reviews"("requestId");

-- CreateIndex
CREATE INDEX "rental_management_reviews_roleId_idx" ON "rental_management_reviews"("roleId");

-- CreateIndex
CREATE INDEX "rental_management_reviews_status_idx" ON "rental_management_reviews"("status");

-- CreateIndex
CREATE INDEX "rental_management_reviews_decidedById_idx" ON "rental_management_reviews"("decidedById");

-- CreateIndex
CREATE INDEX "rental_management_reviews_createdAt_idx" ON "rental_management_reviews"("createdAt");

-- CreateIndex
CREATE INDEX "rental_management_review_files_reviewId_idx" ON "rental_management_review_files"("reviewId");

-- CreateIndex
CREATE INDEX "rental_management_review_files_uploadedById_idx" ON "rental_management_review_files"("uploadedById");

-- AddForeignKey
ALTER TABLE "rental_license_settings" ADD CONSTRAINT "rental_license_settings_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "stored_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_identity_documents" ADD CONSTRAINT "rental_identity_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_document_requirements" ADD CONSTRAINT "rental_document_requirements_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_process_management_roles" ADD CONSTRAINT "rental_process_management_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_licenses" ADD CONSTRAINT "rental_licenses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_licenses" ADD CONSTRAINT "rental_licenses_premiseCityId_fkey" FOREIGN KEY ("premiseCityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_licenses" ADD CONSTRAINT "rental_licenses_premiseComplexId_fkey" FOREIGN KEY ("premiseComplexId") REFERENCES "commercial_complexes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_licenses" ADD CONSTRAINT "rental_licenses_urbanZoneId_fkey" FOREIGN KEY ("urbanZoneId") REFERENCES "urban_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_licenses" ADD CONSTRAINT "rental_licenses_registrationPlaceId_fkey" FOREIGN KEY ("registrationPlaceId") REFERENCES "registration_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_premise_files" ADD CONSTRAINT "rental_premise_files_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "rental_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_requests" ADD CONSTRAINT "rental_requests_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "rental_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_request_documents" ADD CONSTRAINT "rental_request_documents_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "rental_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_request_documents" ADD CONSTRAINT "rental_request_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_request_document_versions" ADD CONSTRAINT "rental_request_document_versions_documentRowId_fkey" FOREIGN KEY ("documentRowId") REFERENCES "rental_request_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_management_reviews" ADD CONSTRAINT "rental_management_reviews_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "rental_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_management_reviews" ADD CONSTRAINT "rental_management_reviews_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "rental_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_management_reviews" ADD CONSTRAINT "rental_management_reviews_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_management_reviews" ADD CONSTRAINT "rental_management_reviews_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_management_review_files" ADD CONSTRAINT "rental_management_review_files_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "rental_management_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_management_review_files" ADD CONSTRAINT "rental_management_review_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

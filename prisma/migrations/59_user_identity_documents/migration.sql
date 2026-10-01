-- CreateEnum
CREATE TYPE "ResidencyStatus" AS ENUM ('RESIDENT', 'NON_RESIDENT');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('ILLITERATE', 'ELEMENTARY', 'MIDDLE_SCHOOL', 'DIPLOMA', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE', 'SEMINARY', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('MANUAL', 'CITIZEN_SYSTEM', 'CIVIL_REGISTRY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "fatherName" TEXT,
ADD COLUMN "lastNameEn" TEXT,
ADD COLUMN "birthDate" DATE,
ADD COLUMN "passportNumber" TEXT,
ADD COLUMN "nationalCardExpiresAt" DATE,
ADD COLUMN "passportExpiresAt" DATE,
ADD COLUMN "identityCertificateNo" TEXT,
ADD COLUMN "birthPlace" TEXT,
ADD COLUMN "identityIssuedIn" TEXT,
ADD COLUMN "residencyStatus" "ResidencyStatus",
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "homePhone" TEXT,
ADD COLUMN "educationLevel" "EducationLevel",
ADD COLUMN "jobGroupId" TEXT,
ADD COLUMN "jobId" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "documents_code_key" ON "documents"("code");

-- CreateIndex
CREATE INDEX "documents_code_idx" ON "documents"("code");

-- CreateIndex
CREATE INDEX "users_jobGroupId_idx" ON "users"("jobGroupId");

-- CreateIndex
CREATE INDEX "users_jobId_idx" ON "users"("jobId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_jobGroupId_fkey" FOREIGN KEY ("jobGroupId") REFERENCES "job_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "person_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_document_versions" (
    "id" TEXT NOT NULL,
    "personDocumentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "DocumentSource" NOT NULL DEFAULT 'MANUAL',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_documents_userId_idx" ON "person_documents"("userId");

-- CreateIndex
CREATE INDEX "person_documents_documentId_idx" ON "person_documents"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "person_documents_userId_documentId_key" ON "person_documents"("userId", "documentId");

-- CreateIndex
CREATE INDEX "person_document_versions_personDocumentId_idx" ON "person_document_versions"("personDocumentId");

-- CreateIndex
CREATE INDEX "person_document_versions_createdAt_idx" ON "person_document_versions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "person_document_versions_personDocumentId_version_key" ON "person_document_versions"("personDocumentId", "version");

-- AddForeignKey
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_document_versions" ADD CONSTRAINT "person_document_versions_personDocumentId_fkey" FOREIGN KEY ("personDocumentId") REFERENCES "person_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- مدارک هویتی سیستمی؛ کد ثابت است و حذف نمی‌شوند
INSERT INTO "documents" ("id", "title", "isRequired", "gender", "isFixed", "code", "createdAt", "updatedAt")
SELECT v.id, v.title, v."isRequired", v.gender::"DocumentGender", v."isFixed", v.code, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('identity-doc-national-card', 'کارت ملی', true, 'BOTH', true, 'NATIONAL_CARD'),
    ('identity-doc-national-card-back', 'پشت کارت ملی', true, 'BOTH', true, 'NATIONAL_CARD_BACK'),
    ('identity-doc-booklet-1', 'شناسنامه صفحه اول', true, 'BOTH', true, 'IDENTITY_BOOKLET_PAGE_1'),
    ('identity-doc-booklet-2', 'شناسنامه صفحه دوم', true, 'BOTH', true, 'IDENTITY_BOOKLET_PAGE_2'),
    ('identity-doc-booklet-notes', 'شناسنامه صفحه توضیحات', false, 'BOTH', true, 'IDENTITY_BOOKLET_NOTES'),
    ('identity-doc-photo', 'عکس پرسنلی', true, 'BOTH', true, 'PERSONNEL_PHOTO'),
    ('identity-doc-signature', 'امضا', false, 'BOTH', true, 'SIGNATURE'),
    ('identity-doc-clearance', 'گواهی عدم سوءپیشینه', true, 'BOTH', true, 'CLEARANCE_CERTIFICATE'),
    ('identity-doc-postal', 'گواهی کد پستی', false, 'BOTH', true, 'POSTAL_CODE_CERTIFICATE'),
    ('identity-doc-sana', 'گواهی ثنا', false, 'BOTH', true, 'SANA_CERTIFICATE'),
    ('identity-doc-passport', 'گذرنامه', false, 'BOTH', true, 'PASSPORT'),
    ('identity-doc-military', 'کارت پایان خدمت', false, 'MALE', true, 'MILITARY_CARD')
) AS v(id, title, "isRequired", gender, "isFixed", code)
WHERE NOT EXISTS (
  SELECT 1 FROM "documents" d WHERE d.code = v.code OR d.title = v.title
);

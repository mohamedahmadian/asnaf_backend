-- CreateEnum
CREATE TYPE "CasePremiseFileKind" AS ENUM ('DEED', 'AUTHORIZATION_LETTER');

ALTER TABLE "case_files"
ADD COLUMN "premiseOwnerNationalId" TEXT;

ALTER TABLE "case_location_drafts"
ADD COLUMN "premiseOwnerNationalId" TEXT;

ALTER TABLE "case_premise_history"
ADD COLUMN "premiseOwnerNationalId" TEXT;

CREATE TABLE "case_premise_files" (
  "id" TEXT NOT NULL,
  "caseFileId" TEXT NOT NULL,
  "kind" "CasePremiseFileKind" NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "case_premise_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_premise_files_caseFileId_kind_key" ON "case_premise_files"("caseFileId", "kind");
CREATE INDEX "case_premise_files_caseFileId_idx" ON "case_premise_files"("caseFileId");
CREATE INDEX "case_premise_files_storageKey_idx" ON "case_premise_files"("storageKey");

ALTER TABLE "case_premise_files"
ADD CONSTRAINT "case_premise_files_caseFileId_fkey"
FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

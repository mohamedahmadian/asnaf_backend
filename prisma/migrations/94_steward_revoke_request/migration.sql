ALTER TABLE "case_files" ADD COLUMN "revokeRequestedAt" TIMESTAMP(3);

CREATE TABLE "case_steward_revoke_files" (
    "id" TEXT NOT NULL,
    "caseFileId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_steward_revoke_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_steward_revoke_files_caseFileId_key" ON "case_steward_revoke_files"("caseFileId");

ALTER TABLE "case_steward_revoke_files"
  ADD CONSTRAINT "case_steward_revoke_files_caseFileId_fkey"
  FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

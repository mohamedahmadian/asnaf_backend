CREATE TYPE "CaseFileKind" AS ENUM ('LICENSE', 'STEWARDSHIP');
CREATE TYPE "CaseRevokeSource" AS ENUM ('HOST', 'STEWARD', 'LICENSE');

ALTER TABLE "case_files" ADD COLUMN "kind" "CaseFileKind" NOT NULL DEFAULT 'LICENSE';
ALTER TABLE "case_files" ADD COLUMN "hostCaseFileId" TEXT;
ALTER TABLE "case_files" ADD COLUMN "revokeSource" "CaseRevokeSource";
ALTER TABLE "case_files" ADD COLUMN "cardNumber" TEXT;
ALTER TABLE "case_files" ADD COLUMN "cardIssuedAt" DATE;
ALTER TABLE "case_files" ADD COLUMN "cardExpiresAt" DATE;

CREATE UNIQUE INDEX "case_files_cardNumber_key" ON "case_files"("cardNumber");
CREATE INDEX "case_files_kind_idx" ON "case_files"("kind");
CREATE INDEX "case_files_hostCaseFileId_idx" ON "case_files"("hostCaseFileId");

ALTER TABLE "case_files"
  ADD CONSTRAINT "case_files_hostCaseFileId_fkey"
  FOREIGN KEY ("hostCaseFileId") REFERENCES "case_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

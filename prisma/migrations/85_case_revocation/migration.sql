ALTER TYPE "CaseFileStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

ALTER TABLE "case_files" ADD COLUMN IF NOT EXISTS "revokeReason" TEXT;
ALTER TABLE "case_files" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);
ALTER TABLE "case_files" ADD COLUMN IF NOT EXISTS "revokedById" TEXT;

CREATE INDEX IF NOT EXISTS "case_files_revokedById_idx" ON "case_files"("revokedById");

DO $$ BEGIN
  ALTER TABLE "case_files"
    ADD CONSTRAINT "case_files_revokedById_fkey"
    FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ADD VALUE cannot run inside Prisma's migration transaction on older PostgreSQL.
COMMIT;
ALTER TYPE "CaseFileStatus" ADD VALUE 'REVOKED';
BEGIN;

ALTER TABLE "case_files" ADD COLUMN "revokeReason" TEXT;
ALTER TABLE "case_files" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "case_files" ADD COLUMN "revokedById" TEXT;

CREATE INDEX "case_files_revokedById_idx" ON "case_files"("revokedById");

ALTER TABLE "case_files" ADD CONSTRAINT "case_files_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

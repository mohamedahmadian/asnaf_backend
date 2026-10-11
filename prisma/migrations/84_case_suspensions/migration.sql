CREATE TYPE "CaseFileStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "case_files" ADD COLUMN "status" "CaseFileStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE "case_suspensions" (
    "id" TEXT NOT NULL,
    "caseFileId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_suspensions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_files_status_idx" ON "case_files"("status");
CREATE INDEX "case_suspensions_caseFileId_idx" ON "case_suspensions"("caseFileId");
CREATE INDEX "case_suspensions_startsAt_idx" ON "case_suspensions"("startsAt");
CREATE INDEX "case_suspensions_endsAt_idx" ON "case_suspensions"("endsAt");
CREATE INDEX "case_suspensions_createdById_idx" ON "case_suspensions"("createdById");
CREATE INDEX "case_suspensions_createdAt_idx" ON "case_suspensions"("createdAt");

ALTER TABLE "case_suspensions" ADD CONSTRAINT "case_suspensions_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_suspensions" ADD CONSTRAINT "case_suspensions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

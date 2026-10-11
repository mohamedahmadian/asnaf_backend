CREATE TYPE "CaseSuspensionFileKind" AS ENUM ('SUSPEND', 'LIFT');

CREATE TABLE "case_suspension_files" (
    "id" TEXT NOT NULL,
    "suspensionId" TEXT NOT NULL,
    "kind" "CaseSuspensionFileKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_suspension_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_suspension_files_suspensionId_idx" ON "case_suspension_files"("suspensionId");
CREATE INDEX "case_suspension_files_kind_idx" ON "case_suspension_files"("kind");

ALTER TABLE "case_suspension_files"
  ADD CONSTRAINT "case_suspension_files_suspensionId_fkey"
  FOREIGN KEY ("suspensionId") REFERENCES "case_suspensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

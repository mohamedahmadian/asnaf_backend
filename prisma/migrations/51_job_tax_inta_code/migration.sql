-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "taxIntaCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "jobs_taxIntaCode_key" ON "jobs"("taxIntaCode");

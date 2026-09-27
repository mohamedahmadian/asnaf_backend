-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "annualFee" DECIMAL(18,0);

-- CreateIndex
CREATE INDEX "jobs_annualFee_idx" ON "jobs"("annualFee");

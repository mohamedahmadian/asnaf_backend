-- AlterTable
ALTER TABLE "job_types" ADD COLUMN "annualFee" DECIMAL(18,0);

-- CreateIndex
CREATE INDEX "job_types_annualFee_idx" ON "job_types"("annualFee");

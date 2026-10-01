-- AlterTable
ALTER TABLE "violations" ADD COLUMN "caseUserId" TEXT;

-- CreateIndex
CREATE INDEX "violations_caseUserId_idx" ON "violations"("caseUserId");

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_caseUserId_fkey" FOREIGN KEY ("caseUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

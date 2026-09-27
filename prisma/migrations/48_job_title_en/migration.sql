-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "titleEn" TEXT;

UPDATE "jobs" SET "titleEn" = "title" WHERE "titleEn" IS NULL;

ALTER TABLE "jobs" ALTER COLUMN "titleEn" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "jobs_groupId_titleEn_key" ON "jobs"("groupId", "titleEn");

-- CreateIndex
CREATE INDEX "jobs_titleEn_idx" ON "jobs"("titleEn");

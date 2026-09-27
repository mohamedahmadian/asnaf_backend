-- AlterTable
ALTER TABLE "job_groups" ADD COLUMN "titleEn" TEXT;

UPDATE "job_groups" SET "titleEn" = "title" WHERE "titleEn" IS NULL;

ALTER TABLE "job_groups" ALTER COLUMN "titleEn" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "job_groups_titleEn_key" ON "job_groups"("titleEn");

-- CreateIndex
CREATE INDEX "job_groups_titleEn_idx" ON "job_groups"("titleEn");

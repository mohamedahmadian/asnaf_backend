-- Backfill empty titles from the English title before the column becomes required
UPDATE "jobs"
SET "title" = "titleEn"
WHERE "title" IS NULL OR btrim("title") = '';

UPDATE "jobs"
SET "titleEn" = NULL
WHERE "titleEn" IS NOT NULL AND btrim("titleEn") = '';

ALTER TABLE "jobs" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "jobs" ALTER COLUMN "titleEn" DROP NOT NULL;

ALTER TABLE "case_places_office" ADD COLUMN "responseDays" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "case_places_reviews" ADD COLUMN "referredAt" TIMESTAMP(3);

CREATE INDEX "case_places_reviews_referredAt_idx" ON "case_places_reviews"("referredAt");
CREATE INDEX "case_places_reviews_status_referredAt_idx" ON "case_places_reviews"("status", "referredAt");

-- پرونده‌هایی که قبلاً به مرحلهٔ اماکن رسیده‌اند یا پاسخ گرفته‌اند؛ createdAt نزدیک‌ترین زمان موجود است.
UPDATE "case_places_reviews" AS review
SET "referredAt" = review."createdAt"
FROM "case_requests" AS request
JOIN "case_files" AS file ON file."id" = request."caseFileId"
WHERE review."caseRequestId" = request."id"
  AND review."referredAt" IS NULL
  AND (
    review."status" <> 'PENDING'
    OR review."decidedAt" IS NOT NULL
    OR (request."type" = 'ISSUANCE' AND (request."formationStep" >= 4 OR file."formationStep" >= 4))
    OR (request."type" IN ('RENEWAL', 'LOCATION_CHANGE') AND request."formationStep" >= 3)
    OR (request."type" = 'STEWARDSHIP' AND (request."formationStep" >= 2 OR file."formationStep" >= 2))
  );

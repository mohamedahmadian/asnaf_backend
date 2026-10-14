ALTER TABLE "case_general_settings" ADD COLUMN "inquiryResponseDays" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "case_inquiries" ADD COLUMN "referredAt" TIMESTAMP(3);

CREATE INDEX "case_inquiries_referredAt_idx" ON "case_inquiries"("referredAt");
CREATE INDEX "case_inquiries_status_referredAt_idx" ON "case_inquiries"("status", "referredAt");

-- استعلام‌هایی که پرونده‌شان به مرحلهٔ استعلام رسیده یا پاسخ گرفته‌اند.
UPDATE "case_inquiries" AS inquiry
SET "referredAt" = inquiry."createdAt"
FROM "case_requests" AS request
JOIN "case_files" AS file ON file."id" = request."caseFileId"
WHERE inquiry."caseRequestId" = request."id"
  AND inquiry."referredAt" IS NULL
  AND (
    inquiry."status" <> 'PENDING'
    OR inquiry."decidedAt" IS NOT NULL
    OR (request."type" = 'ISSUANCE' AND (request."formationStep" >= 3 OR file."formationStep" >= 3))
    OR (request."type" IN ('RENEWAL', 'LOCATION_CHANGE') AND request."formationStep" >= 2)
    OR (request."type" = 'STEWARDSHIP' AND (request."formationStep" >= 1 OR file."formationStep" >= 1))
  );

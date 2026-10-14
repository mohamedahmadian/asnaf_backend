-- درخواست مجوز حراج تمام‌شده مثل بقیه درخواست‌ها «تکمیل شده» است، نه «صادر شده».
UPDATE "case_request_events" AS event
SET "toStatus" = 'COMPLETED'
FROM "case_requests" AS request
WHERE event."requestId" = request."id"
  AND request."type" = 'AUCTION'
  AND event."toStatus" = 'ISSUED';

UPDATE "case_request_events" AS event
SET "fromStatus" = 'COMPLETED'
FROM "case_requests" AS request
WHERE event."requestId" = request."id"
  AND request."type" = 'AUCTION'
  AND event."fromStatus" = 'ISSUED';

UPDATE "case_requests"
SET
  "status" = 'COMPLETED',
  "completedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP)
WHERE "type" = 'AUCTION'
  AND "status" = 'ISSUED';

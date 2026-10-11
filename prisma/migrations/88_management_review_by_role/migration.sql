-- نقش، نه واحد سازمانی، مبنای تایید مدیریتی هر درخواست است.
ALTER TABLE "case_management_reviews" ALTER COLUMN "workUnitId" DROP NOT NULL;

DELETE FROM "case_management_reviews" AS older
USING "case_management_reviews" AS newer
WHERE older."caseRequestId" = newer."caseRequestId"
  AND older."roleId" = newer."roleId"
  AND older."createdAt" > newer."createdAt";

DELETE FROM "case_management_reviews" AS older
USING "case_management_reviews" AS newer
WHERE older."caseRequestId" = newer."caseRequestId"
  AND older."roleId" = newer."roleId"
  AND older.id > newer.id;

DROP INDEX "case_management_reviews_caseRequestId_workUnitId_roleId_key";

CREATE UNIQUE INDEX "case_management_reviews_caseRequestId_roleId_key" ON "case_management_reviews"("caseRequestId", "roleId");

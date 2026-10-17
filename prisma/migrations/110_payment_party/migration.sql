-- پرداخت می‌تواند بدون پرونده، به نام شخص حقیقی یا شرکت ثبت شود.

ALTER TABLE "payments" ADD COLUMN "payerUserId" TEXT;
ALTER TABLE "payments" ADD COLUMN "personType" "PersonType" NOT NULL DEFAULT 'NATURAL';
ALTER TABLE "payments" ADD COLUMN "companyName" TEXT;
ALTER TABLE "payments" ADD COLUMN "companyNationalId" TEXT;
ALTER TABLE "payments" ADD COLUMN "companyRegistrationNo" TEXT;

UPDATE "payments" AS payment
SET "payerUserId" = case_file."userId"
FROM "case_files" AS case_file
WHERE payment."caseFileId" = case_file."id"
  AND payment."payerUserId" IS NULL;

ALTER TABLE "payments" ALTER COLUMN "caseFileId" DROP NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "nationalId" DROP NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "payerUserId" SET NOT NULL;

CREATE INDEX "payments_payerUserId_idx" ON "payments"("payerUserId");
CREATE INDEX "payments_personType_idx" ON "payments"("personType");
CREATE INDEX "payments_companyNationalId_idx" ON "payments"("companyNationalId");

ALTER TABLE "payments"
ADD CONSTRAINT "payments_payerUserId_fkey"
FOREIGN KEY ("payerUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

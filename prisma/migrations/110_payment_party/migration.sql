-- پرداخت می‌تواند بدون پرونده، به نام شخص حقیقی یا شرکت ثبت شود.
-- این مهاجرت قبل از 110_user_person_type اجرا می‌شود و باید تکرارپذیر بماند.

DO $$
BEGIN
  CREATE TYPE "PersonType" AS ENUM ('NATURAL', 'LEGAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payerUserId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "personType" "PersonType" NOT NULL DEFAULT 'NATURAL';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "companyNationalId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "companyRegistrationNo" TEXT;

UPDATE "payments" AS payment
SET "payerUserId" = case_file."userId"
FROM "case_files" AS case_file
WHERE payment."caseFileId" = case_file."id"
  AND payment."payerUserId" IS NULL;

ALTER TABLE "payments" ALTER COLUMN "caseFileId" DROP NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "nationalId" DROP NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "payerUserId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "payments_payerUserId_idx" ON "payments"("payerUserId");
CREATE INDEX IF NOT EXISTS "payments_personType_idx" ON "payments"("personType");
CREATE INDEX IF NOT EXISTS "payments_companyNationalId_idx" ON "payments"("companyNationalId");

DO $$
BEGIN
  ALTER TABLE "payments"
  ADD CONSTRAINT "payments_payerUserId_fkey"
  FOREIGN KEY ("payerUserId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

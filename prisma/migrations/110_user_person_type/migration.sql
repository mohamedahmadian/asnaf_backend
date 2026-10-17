-- نوع شخص: حقیقی (پیش‌فرض کاربران فعلی) و حقوقی
-- enum ممکن است قبلاً در 110_payment_party ساخته شده باشد.

DO $$
BEGIN
  CREATE TYPE "PersonType" AS ENUM ('NATURAL', 'LEGAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "personType" "PersonType" NOT NULL DEFAULT 'NATURAL';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyNationalId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyRegistrationNo" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyRegisteredAt" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "economicCode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_companyNationalId_key" ON "users"("companyNationalId");
CREATE INDEX IF NOT EXISTS "users_personType_idx" ON "users"("personType");

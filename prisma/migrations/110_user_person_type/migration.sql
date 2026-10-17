-- نوع شخص: حقیقی (پیش‌فرض کاربران فعلی) و حقوقی

CREATE TYPE "PersonType" AS ENUM ('NATURAL', 'LEGAL');

ALTER TABLE "users" ADD COLUMN "personType" "PersonType" NOT NULL DEFAULT 'NATURAL';
ALTER TABLE "users" ADD COLUMN "companyName" TEXT;
ALTER TABLE "users" ADD COLUMN "companyNationalId" TEXT;
ALTER TABLE "users" ADD COLUMN "companyRegistrationNo" TEXT;
ALTER TABLE "users" ADD COLUMN "companyRegisteredAt" DATE;
ALTER TABLE "users" ADD COLUMN "economicCode" TEXT;

CREATE UNIQUE INDEX "users_companyNationalId_key" ON "users"("companyNationalId");
CREATE INDEX "users_personType_idx" ON "users"("personType");

-- شناسه پرداخت از سرفصل به خود حساب بانکی منتقل می‌شود.
-- اگر یک حساب چند شناسه داشته باشد، جدیدترین مقدار غیرخالی می‌ماند.
ALTER TABLE "bank_accounts" ADD COLUMN "paymentId" TEXT;

UPDATE "bank_accounts" account
SET "paymentId" = latest."paymentId"
FROM (
    SELECT DISTINCT ON ("bankAccountId")
        "bankAccountId",
        "paymentId"
    FROM "financial_headings"
    WHERE "paymentId" IS NOT NULL
    ORDER BY "bankAccountId", "updatedAt" DESC
) latest
WHERE account."id" = latest."bankAccountId";

CREATE UNIQUE INDEX "bank_accounts_paymentId_key" ON "bank_accounts"("paymentId");
CREATE INDEX "bank_accounts_paymentId_idx" ON "bank_accounts"("paymentId");

-- هزینه مستقیم به حساب بانکی همان سرفصل وصل می‌شود.
ALTER TABLE "municipal_fees" ADD COLUMN "bankAccountId" TEXT;

UPDATE "municipal_fees" fee
SET "bankAccountId" = heading."bankAccountId"
FROM "financial_headings" heading
WHERE fee."financialHeadingId" = heading."id";

ALTER TABLE "municipal_fees" ALTER COLUMN "bankAccountId" SET NOT NULL;

ALTER TABLE "municipal_fees" DROP CONSTRAINT "municipal_fees_financialHeadingId_fkey";
DROP INDEX "municipal_fees_financialHeadingId_idx";
ALTER TABLE "municipal_fees" DROP COLUMN "financialHeadingId";

CREATE INDEX "municipal_fees_bankAccountId_idx" ON "municipal_fees"("bankAccountId");

ALTER TABLE "municipal_fees"
ADD CONSTRAINT "municipal_fees_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId")
REFERENCES "bank_accounts"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

DROP TABLE "financial_headings";

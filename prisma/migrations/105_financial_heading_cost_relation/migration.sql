-- Allow migrated headings to be completed later without inventing a payment identifier.
ALTER TABLE "financial_headings" ALTER COLUMN "paymentId" DROP NOT NULL;

-- Add the new relation as nullable while existing costs are migrated.
ALTER TABLE "municipal_fees" ADD COLUMN "financialHeadingId" TEXT;

-- Preserve existing costs by creating one transitional heading for each bank account.
INSERT INTO "financial_headings" (
    "id",
    "title",
    "description",
    "bankAccountId",
    "paymentId",
    "createdAt",
    "updatedAt"
)
SELECT
    SUBSTRING(MD5('financial-heading:' || account."id"), 1, 8) || '-' ||
    SUBSTRING(MD5('financial-heading:' || account."id"), 9, 4) || '-' ||
    SUBSTRING(MD5('financial-heading:' || account."id"), 13, 4) || '-' ||
    SUBSTRING(MD5('financial-heading:' || account."id"), 17, 4) || '-' ||
    SUBSTRING(MD5('financial-heading:' || account."id"), 21, 12),
    'سرفصل انتقالی - ' || account."bankName" || ' - ' || account."accountNumber",
    'این سرفصل هنگام تغییر ساختار هزینه‌ها به‌صورت خودکار ایجاد شده است.',
    account."id",
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "bank_accounts" account
WHERE EXISTS (
    SELECT 1
    FROM "municipal_fees" fee
    WHERE fee."bankAccountId" = account."id"
);

UPDATE "municipal_fees" fee
SET "financialHeadingId" =
    SUBSTRING(MD5('financial-heading:' || fee."bankAccountId"), 1, 8) || '-' ||
    SUBSTRING(MD5('financial-heading:' || fee."bankAccountId"), 9, 4) || '-' ||
    SUBSTRING(MD5('financial-heading:' || fee."bankAccountId"), 13, 4) || '-' ||
    SUBSTRING(MD5('financial-heading:' || fee."bankAccountId"), 17, 4) || '-' ||
    SUBSTRING(MD5('financial-heading:' || fee."bankAccountId"), 21, 12);

ALTER TABLE "municipal_fees" ALTER COLUMN "financialHeadingId" SET NOT NULL;

DROP INDEX "municipal_fees_bankAccountId_idx";
ALTER TABLE "municipal_fees" DROP CONSTRAINT "municipal_fees_bankAccountId_fkey";
ALTER TABLE "municipal_fees" DROP COLUMN "bankAccountId";

CREATE INDEX "municipal_fees_financialHeadingId_idx" ON "municipal_fees"("financialHeadingId");

ALTER TABLE "municipal_fees"
ADD CONSTRAINT "municipal_fees_financialHeadingId_fkey"
FOREIGN KEY ("financialHeadingId")
REFERENCES "financial_headings"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

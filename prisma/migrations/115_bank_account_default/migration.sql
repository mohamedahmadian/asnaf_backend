ALTER TABLE "bank_accounts" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "bank_accounts_single_default_key"
ON "bank_accounts"("isDefault")
WHERE "isDefault" = true;

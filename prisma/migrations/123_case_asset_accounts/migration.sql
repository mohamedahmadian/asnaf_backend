CREATE TABLE "case_asset_accounts" (
  "id" TEXT NOT NULL,
  "caseFileId" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "iban" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "case_asset_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_asset_accounts_caseFileId_iban_key" ON "case_asset_accounts"("caseFileId", "iban");
CREATE INDEX "case_asset_accounts_caseFileId_idx" ON "case_asset_accounts"("caseFileId");

ALTER TABLE "case_asset_accounts"
ADD CONSTRAINT "case_asset_accounts_caseFileId_fkey"
FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

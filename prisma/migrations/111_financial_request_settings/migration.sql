CREATE TABLE "financial_request_settings" (
    "requestType" "CaseRequestType" NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_request_settings_pkey" PRIMARY KEY ("requestType")
);

CREATE INDEX "financial_request_settings_bankAccountId_idx"
ON "financial_request_settings"("bankAccountId");

ALTER TABLE "financial_request_settings"
ADD CONSTRAINT "financial_request_settings_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId")
REFERENCES "bank_accounts"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

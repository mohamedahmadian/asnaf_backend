CREATE TABLE "case_request_finances" (
    "requestId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_request_finances_pkey" PRIMARY KEY ("requestId")
);

CREATE INDEX "case_request_finances_bankAccountId_idx" ON "case_request_finances"("bankAccountId");

ALTER TABLE "case_request_finances"
ADD CONSTRAINT "case_request_finances_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "case_requests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_request_finances"
ADD CONSTRAINT "case_request_finances_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "case_request_fees" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "municipalFeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_request_fees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_request_fees_requestId_municipalFeeId_key"
ON "case_request_fees"("requestId", "municipalFeeId");
CREATE INDEX "case_request_fees_municipalFeeId_idx" ON "case_request_fees"("municipalFeeId");

ALTER TABLE "case_request_fees"
ADD CONSTRAINT "case_request_fees_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "case_request_finances"("requestId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_request_fees"
ADD CONSTRAINT "case_request_fees_municipalFeeId_fkey"
FOREIGN KEY ("municipalFeeId") REFERENCES "municipal_fees"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

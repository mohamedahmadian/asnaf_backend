-- CreateTable
CREATE TABLE "financial_headings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "bankAccountId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_headings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_headings_title_key" ON "financial_headings"("title");

-- CreateIndex
CREATE UNIQUE INDEX "financial_headings_paymentId_key" ON "financial_headings"("paymentId");

-- CreateIndex
CREATE INDEX "financial_headings_title_idx" ON "financial_headings"("title");

-- CreateIndex
CREATE INDEX "financial_headings_bankAccountId_idx" ON "financial_headings"("bankAccountId");

-- CreateIndex
CREATE INDEX "financial_headings_paymentId_idx" ON "financial_headings"("paymentId");

-- CreateIndex
CREATE INDEX "financial_headings_createdAt_idx" ON "financial_headings"("createdAt");

-- AddForeignKey
ALTER TABLE "financial_headings" ADD CONSTRAINT "financial_headings_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "municipal_fees" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipal_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "municipal_fees_title_key" ON "municipal_fees"("title");

-- CreateIndex
CREATE INDEX "municipal_fees_bankAccountId_idx" ON "municipal_fees"("bankAccountId");

-- CreateIndex
CREATE INDEX "municipal_fees_title_idx" ON "municipal_fees"("title");

-- CreateIndex
CREATE INDEX "municipal_fees_isActive_idx" ON "municipal_fees"("isActive");

-- CreateIndex
CREATE INDEX "municipal_fees_createdAt_idx" ON "municipal_fees"("createdAt");

-- AddForeignKey
ALTER TABLE "municipal_fees" ADD CONSTRAINT "municipal_fees_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

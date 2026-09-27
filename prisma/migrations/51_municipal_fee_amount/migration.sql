-- AlterTable
ALTER TABLE "municipal_fees" ADD COLUMN "amount" DECIMAL(18,0) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "municipal_fees_amount_idx" ON "municipal_fees"("amount");

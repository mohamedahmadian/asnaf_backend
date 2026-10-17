CREATE TABLE "payment_receipts" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "originalName" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_receipts_paymentId_createdAt_idx" ON "payment_receipts"("paymentId", "createdAt");
CREATE INDEX "payment_receipts_imageId_idx" ON "payment_receipts"("imageId");
CREATE INDEX "payment_receipts_uploadedById_idx" ON "payment_receipts"("uploadedById");

ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

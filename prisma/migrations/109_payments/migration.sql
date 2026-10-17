-- پرداخت، گروه پرداخت و تاریخچهٔ مبالغ

CREATE TYPE "PaymentDiscountMode" AS ENUM ('MANUAL', 'CATALOG');

CREATE TABLE "payment_groups" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_group_items" (
    "id" TEXT NOT NULL,
    "paymentGroupId" TEXT NOT NULL,
    "municipalFeeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_group_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "caseFileId" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "description" TEXT,
    "paymentGroupId" TEXT,
    "paymentGroupTitle" TEXT,
    "bankAccountId" TEXT NOT NULL,
    "discountMode" "PaymentDiscountMode" NOT NULL,
    "discountId" TEXT,
    "discountTitle" TEXT,
    "discountPercent" DECIMAL(5,2),
    "feeCount" INTEGER NOT NULL,
    "subtotal" DECIMAL(18,0) NOT NULL,
    "discountAmount" DECIMAL(18,0) NOT NULL,
    "finalAmount" DECIMAL(18,0) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_lines" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "municipalFeeId" TEXT,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_groups_bankAccountId_idx" ON "payment_groups"("bankAccountId");
CREATE INDEX "payment_groups_title_idx" ON "payment_groups"("title");
CREATE INDEX "payment_groups_createdAt_idx" ON "payment_groups"("createdAt");

CREATE UNIQUE INDEX "payment_group_items_paymentGroupId_municipalFeeId_key" ON "payment_group_items"("paymentGroupId", "municipalFeeId");
CREATE INDEX "payment_group_items_municipalFeeId_idx" ON "payment_group_items"("municipalFeeId");
CREATE INDEX "payment_group_items_sortOrder_idx" ON "payment_group_items"("sortOrder");

CREATE INDEX "payments_caseFileId_idx" ON "payments"("caseFileId");
CREATE INDEX "payments_nationalId_idx" ON "payments"("nationalId");
CREATE INDEX "payments_recordedById_idx" ON "payments"("recordedById");
CREATE INDEX "payments_paymentGroupId_idx" ON "payments"("paymentGroupId");
CREATE INDEX "payments_bankAccountId_idx" ON "payments"("bankAccountId");
CREATE INDEX "payments_discountId_idx" ON "payments"("discountId");
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");
CREATE INDEX "payments_finalAmount_idx" ON "payments"("finalAmount");
CREATE INDEX "payments_subtotal_idx" ON "payments"("subtotal");
CREATE INDEX "payments_feeCount_idx" ON "payments"("feeCount");
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

CREATE INDEX "payment_lines_paymentId_idx" ON "payment_lines"("paymentId");
CREATE INDEX "payment_lines_municipalFeeId_idx" ON "payment_lines"("municipalFeeId");
CREATE INDEX "payment_lines_sortOrder_idx" ON "payment_lines"("sortOrder");

ALTER TABLE "payment_groups" ADD CONSTRAINT "payment_groups_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_group_items" ADD CONSTRAINT "payment_group_items_paymentGroupId_fkey" FOREIGN KEY ("paymentGroupId") REFERENCES "payment_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_group_items" ADD CONSTRAINT "payment_group_items_municipalFeeId_fkey" FOREIGN KEY ("municipalFeeId") REFERENCES "municipal_fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentGroupId_fkey" FOREIGN KEY ("paymentGroupId") REFERENCES "payment_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_municipalFeeId_fkey" FOREIGN KEY ("municipalFeeId") REFERENCES "municipal_fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

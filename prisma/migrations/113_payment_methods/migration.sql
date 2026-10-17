CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'POS', 'BANK_RECEIPT');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');
CREATE TYPE "PaymentGatewayChannel" AS ENUM ('OPERATOR', 'PUBLIC_LINK');
CREATE TYPE "PaymentGatewayStatus" AS ENUM ('INITIATED', 'VERIFIED', 'SETTLED', 'FAILED', 'REVERSED');

CREATE SEQUENCE "payment_receipt_seq" START 1;
CREATE SEQUENCE "payment_gateway_order_seq" START 100000;

ALTER TABLE "payments"
    ADD COLUMN "method" "PaymentMethod",
    ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    ADD COLUMN "trackingCode" TEXT,
    ADD COLUMN "receiptNumber" TEXT,
    ADD COLUMN "caseRequestId" TEXT,
    ADD COLUMN "payLinkToken" TEXT,
    ADD COLUMN "payLinkExpiresAt" TIMESTAMP(3),
    ADD COLUMN "payLinkSentAt" TIMESTAMP(3),
    ADD COLUMN "deletedAt" TIMESTAMP(3),
    ADD COLUMN "deletedById" TEXT,
    ADD COLUMN "deleteReason" TEXT;

UPDATE "payments" SET "method" = 'POS' WHERE "method" IS NULL;

WITH ordered AS (
    SELECT
        "id",
        ("paidAt" + INTERVAL '3 hours 30 minutes') AS local_at
    FROM "payments"
    ORDER BY "paidAt", "id"
)
UPDATE "payments" p
SET "receiptNumber" =
    (EXTRACT(YEAR FROM o.local_at)::int
        - CASE WHEN to_char(o.local_at, 'MMDD') >= '0321' THEN 621 ELSE 622 END)::text
    || '-' || lpad(nextval('payment_receipt_seq')::text, 6, '0')
FROM ordered o
WHERE p."id" = o."id";

ALTER TABLE "payments" ALTER COLUMN "method" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "receiptNumber" SET NOT NULL;

CREATE UNIQUE INDEX "payments_receiptNumber_key" ON "payments"("receiptNumber");
CREATE UNIQUE INDEX "payments_payLinkToken_key" ON "payments"("payLinkToken");
CREATE INDEX "payments_method_idx" ON "payments"("method");
CREATE INDEX "payments_status_idx" ON "payments"("status");
CREATE INDEX "payments_trackingCode_idx" ON "payments"("trackingCode");
CREATE INDEX "payments_caseRequestId_idx" ON "payments"("caseRequestId");
CREATE INDEX "payments_deletedAt_idx" ON "payments"("deletedAt");

ALTER TABLE "payments" ADD CONSTRAINT "payments_caseRequestId_fkey" FOREIGN KEY ("caseRequestId") REFERENCES "case_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payment_gateway_transactions" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "channel" "PaymentGatewayChannel" NOT NULL,
    "orderId" BIGINT NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "status" "PaymentGatewayStatus" NOT NULL DEFAULT 'INITIATED',
    "refId" TEXT,
    "resCode" TEXT,
    "saleReferenceId" TEXT,
    "cardHolderPan" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "payment_gateway_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_gateway_transactions_orderId_key" ON "payment_gateway_transactions"("orderId");
CREATE INDEX "payment_gateway_transactions_paymentId_createdAt_idx" ON "payment_gateway_transactions"("paymentId", "createdAt");
CREATE INDEX "payment_gateway_transactions_status_createdAt_idx" ON "payment_gateway_transactions"("status", "createdAt");
CREATE INDEX "payment_gateway_transactions_refId_idx" ON "payment_gateway_transactions"("refId");

ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

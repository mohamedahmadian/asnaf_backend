-- CreateEnum
CREATE TYPE "SmsMessageStatus" AS ENUM ('SKIPPED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SmsMessageSource" AS ENUM ('MANUAL', 'PASSWORD', 'PAYMENT_LINK', 'STEWARDSHIP');

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SmsMessageStatus" NOT NULL,
    "source" "SmsMessageSource" NOT NULL DEFAULT 'MANUAL',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_messages_createdAt_idx" ON "sms_messages"("createdAt");

-- CreateIndex
CREATE INDEX "sms_messages_phone_idx" ON "sms_messages"("phone");

-- CreateIndex
CREATE INDEX "sms_messages_status_idx" ON "sms_messages"("status");

-- CreateIndex
CREATE INDEX "sms_messages_source_idx" ON "sms_messages"("source");

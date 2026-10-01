CREATE TYPE "CaseInquiryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "CaseInquiryChannel" AS ENUM ('MANUAL', 'SYSTEM');

CREATE TABLE "case_inquiries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inquiryCenterId" TEXT NOT NULL,
    "status" "CaseInquiryStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "CaseInquiryChannel",
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_inquiries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_inquiry_files" (
    "id" TEXT NOT NULL,
    "caseInquiryId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_inquiry_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_inquiries_userId_inquiryCenterId_key" ON "case_inquiries"("userId", "inquiryCenterId");
CREATE INDEX "case_inquiries_userId_idx" ON "case_inquiries"("userId");
CREATE INDEX "case_inquiries_inquiryCenterId_idx" ON "case_inquiries"("inquiryCenterId");
CREATE INDEX "case_inquiries_status_idx" ON "case_inquiries"("status");
CREATE INDEX "case_inquiries_decidedById_idx" ON "case_inquiries"("decidedById");
CREATE INDEX "case_inquiries_createdAt_idx" ON "case_inquiries"("createdAt");
CREATE INDEX "case_inquiry_files_caseInquiryId_idx" ON "case_inquiry_files"("caseInquiryId");
CREATE INDEX "case_inquiry_files_uploadedById_idx" ON "case_inquiry_files"("uploadedById");

ALTER TABLE "case_inquiries" ADD CONSTRAINT "case_inquiries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_inquiries" ADD CONSTRAINT "case_inquiries_inquiryCenterId_fkey" FOREIGN KEY ("inquiryCenterId") REFERENCES "inquiry_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_inquiries" ADD CONSTRAINT "case_inquiries_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_inquiry_files" ADD CONSTRAINT "case_inquiry_files_caseInquiryId_fkey" FOREIGN KEY ("caseInquiryId") REFERENCES "case_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_inquiry_files" ADD CONSTRAINT "case_inquiry_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

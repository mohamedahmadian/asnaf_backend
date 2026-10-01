-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('REGISTERED', 'UNDER_REVIEW', 'NOTICE', 'REFERRED', 'VERDICT_ISSUED', 'CLOSED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ViolationAttachmentKind" AS ENUM ('IMAGE', 'FILE');

-- CreateTable
CREATE TABLE "violations" (
    "id" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "violationTypeId" TEXT NOT NULL,
    "occurredAt" DATE NOT NULL,
    "description" TEXT,
    "status" "ViolationStatus" NOT NULL DEFAULT 'REGISTERED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violation_attachments" (
    "id" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "kind" "ViolationAttachmentKind" NOT NULL,
    "imageId" TEXT,
    "fileId" TEXT,
    "originalName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "violation_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violation_proceedings" (
    "id" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "occurredAt" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violation_proceedings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violation_proceeding_attachments" (
    "id" TEXT NOT NULL,
    "proceedingId" TEXT NOT NULL,
    "kind" "ViolationAttachmentKind" NOT NULL,
    "imageId" TEXT,
    "fileId" TEXT,
    "originalName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "violation_proceeding_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "violations_nationalId_idx" ON "violations"("nationalId");

-- CreateIndex
CREATE INDEX "violations_violationTypeId_idx" ON "violations"("violationTypeId");

-- CreateIndex
CREATE INDEX "violations_status_idx" ON "violations"("status");

-- CreateIndex
CREATE INDEX "violations_occurredAt_idx" ON "violations"("occurredAt");

-- CreateIndex
CREATE INDEX "violations_createdById_idx" ON "violations"("createdById");

-- CreateIndex
CREATE INDEX "violations_createdAt_idx" ON "violations"("createdAt");

-- CreateIndex
CREATE INDEX "violation_attachments_violationId_sortOrder_idx" ON "violation_attachments"("violationId", "sortOrder");

-- CreateIndex
CREATE INDEX "violation_attachments_imageId_idx" ON "violation_attachments"("imageId");

-- CreateIndex
CREATE INDEX "violation_attachments_fileId_idx" ON "violation_attachments"("fileId");

-- CreateIndex
CREATE INDEX "violation_proceedings_violationId_occurredAt_idx" ON "violation_proceedings"("violationId", "occurredAt");

-- CreateIndex
CREATE INDEX "violation_proceedings_title_idx" ON "violation_proceedings"("title");

-- CreateIndex
CREATE INDEX "violation_proceedings_createdById_idx" ON "violation_proceedings"("createdById");

-- CreateIndex
CREATE INDEX "violation_proceedings_createdAt_idx" ON "violation_proceedings"("createdAt");

-- CreateIndex
CREATE INDEX "violation_proceeding_attachments_proceedingId_sortOrder_idx" ON "violation_proceeding_attachments"("proceedingId", "sortOrder");

-- CreateIndex
CREATE INDEX "violation_proceeding_attachments_imageId_idx" ON "violation_proceeding_attachments"("imageId");

-- CreateIndex
CREATE INDEX "violation_proceeding_attachments_fileId_idx" ON "violation_proceeding_attachments"("fileId");

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_violationTypeId_fkey" FOREIGN KEY ("violationTypeId") REFERENCES "violation_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_attachments" ADD CONSTRAINT "violation_attachments_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "violations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_attachments" ADD CONSTRAINT "violation_attachments_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_attachments" ADD CONSTRAINT "violation_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_proceedings" ADD CONSTRAINT "violation_proceedings_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "violations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_proceedings" ADD CONSTRAINT "violation_proceedings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_proceeding_attachments" ADD CONSTRAINT "violation_proceeding_attachments_proceedingId_fkey" FOREIGN KEY ("proceedingId") REFERENCES "violation_proceedings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_proceeding_attachments" ADD CONSTRAINT "violation_proceeding_attachments_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_proceeding_attachments" ADD CONSTRAINT "violation_proceeding_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

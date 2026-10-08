CREATE TABLE "case_management_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workUnitId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "CaseInquiryStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "CaseInquiryChannel",
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_management_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_management_review_files" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_management_review_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_management_reviews_userId_idx" ON "case_management_reviews"("userId");
CREATE INDEX "case_management_reviews_workUnitId_idx" ON "case_management_reviews"("workUnitId");
CREATE INDEX "case_management_reviews_roleId_idx" ON "case_management_reviews"("roleId");
CREATE INDEX "case_management_reviews_status_idx" ON "case_management_reviews"("status");
CREATE INDEX "case_management_reviews_decidedById_idx" ON "case_management_reviews"("decidedById");
CREATE INDEX "case_management_reviews_createdAt_idx" ON "case_management_reviews"("createdAt");
CREATE UNIQUE INDEX "case_management_reviews_userId_workUnitId_roleId_key" ON "case_management_reviews"("userId", "workUnitId", "roleId");
CREATE INDEX "case_management_review_files_reviewId_idx" ON "case_management_review_files"("reviewId");
CREATE INDEX "case_management_review_files_uploadedById_idx" ON "case_management_review_files"("uploadedById");

ALTER TABLE "case_management_reviews" ADD CONSTRAINT "case_management_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_management_reviews" ADD CONSTRAINT "case_management_reviews_workUnitId_fkey" FOREIGN KEY ("workUnitId") REFERENCES "work_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_management_reviews" ADD CONSTRAINT "case_management_reviews_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_management_reviews" ADD CONSTRAINT "case_management_reviews_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_management_review_files" ADD CONSTRAINT "case_management_review_files_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "case_management_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_management_review_files" ADD CONSTRAINT "case_management_review_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

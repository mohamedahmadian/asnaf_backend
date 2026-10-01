CREATE TABLE "case_places_office" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "phone" TEXT,
    "officerId" TEXT,
    "letterTitle" TEXT,
    "letterBody" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_places_office_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_places_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CaseInquiryStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "CaseInquiryChannel",
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_places_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_places_files" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_places_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_places_office_officerId_key" ON "case_places_office"("officerId");
CREATE INDEX "case_places_office_officerId_idx" ON "case_places_office"("officerId");
CREATE UNIQUE INDEX "case_places_reviews_userId_key" ON "case_places_reviews"("userId");
CREATE INDEX "case_places_reviews_status_idx" ON "case_places_reviews"("status");
CREATE INDEX "case_places_reviews_decidedById_idx" ON "case_places_reviews"("decidedById");
CREATE INDEX "case_places_reviews_createdAt_idx" ON "case_places_reviews"("createdAt");
CREATE INDEX "case_places_files_reviewId_idx" ON "case_places_files"("reviewId");
CREATE INDEX "case_places_files_uploadedById_idx" ON "case_places_files"("uploadedById");

ALTER TABLE "case_places_office" ADD CONSTRAINT "case_places_office_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_places_reviews" ADD CONSTRAINT "case_places_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_places_reviews" ADD CONSTRAINT "case_places_reviews_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_places_files" ADD CONSTRAINT "case_places_files_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "case_places_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_places_files" ADD CONSTRAINT "case_places_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "case_places_office" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);

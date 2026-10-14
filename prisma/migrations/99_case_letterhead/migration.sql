CREATE TABLE "case_letterheads" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "organizationName" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "signerName" TEXT,
    "signerTitle" TEXT,
    "logoId" TEXT,
    "signatureId" TEXT,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_letterheads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_letterheads_logoId_key" ON "case_letterheads"("logoId");

CREATE UNIQUE INDEX "case_letterheads_signatureId_key" ON "case_letterheads"("signatureId");

ALTER TABLE "case_letterheads" ADD CONSTRAINT "case_letterheads_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "stored_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_letterheads" ADD CONSTRAINT "case_letterheads_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "stored_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_inquiries" ADD COLUMN "letterNo" TEXT;
ALTER TABLE "case_inquiries" ADD COLUMN "issuedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "case_inquiries_letterNo_key" ON "case_inquiries"("letterNo");

ALTER TABLE "case_places_reviews" ADD COLUMN "letterNo" TEXT;
ALTER TABLE "case_places_reviews" ADD COLUMN "issuedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "case_places_reviews_letterNo_key" ON "case_places_reviews"("letterNo");

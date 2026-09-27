-- CreateTable
CREATE TABLE "inquiry_centers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "phone" TEXT,
    "officerId" TEXT,
    "letterTitle" TEXT,
    "letterBody" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiry_centers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_centers_name_key" ON "inquiry_centers"("name");

-- CreateIndex
CREATE INDEX "inquiry_centers_name_idx" ON "inquiry_centers"("name");

-- CreateIndex
CREATE INDEX "inquiry_centers_phone_idx" ON "inquiry_centers"("phone");

-- CreateIndex
CREATE INDEX "inquiry_centers_officerId_idx" ON "inquiry_centers"("officerId");

-- CreateIndex
CREATE INDEX "inquiry_centers_isActive_idx" ON "inquiry_centers"("isActive");

-- CreateIndex
CREATE INDEX "inquiry_centers_createdAt_idx" ON "inquiry_centers"("createdAt");

-- AddForeignKey
ALTER TABLE "inquiry_centers" ADD CONSTRAINT "inquiry_centers_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

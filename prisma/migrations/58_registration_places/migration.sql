-- CreateTable
CREATE TABLE "registration_places" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_places_title_key" ON "registration_places"("title");

-- CreateIndex
CREATE INDEX "registration_places_title_idx" ON "registration_places"("title");

-- CreateIndex
CREATE INDEX "registration_places_isActive_idx" ON "registration_places"("isActive");

-- CreateIndex
CREATE INDEX "registration_places_createdAt_idx" ON "registration_places"("createdAt");

-- CreateTable
CREATE TABLE "discounts" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discounts_year_title_key" ON "discounts"("year", "title");

-- CreateIndex
CREATE INDEX "discounts_year_idx" ON "discounts"("year");

-- CreateIndex
CREATE INDEX "discounts_title_idx" ON "discounts"("title");

-- CreateIndex
CREATE INDEX "discounts_isActive_idx" ON "discounts"("isActive");

-- CreateIndex
CREATE INDEX "discounts_createdAt_idx" ON "discounts"("createdAt");

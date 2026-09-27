-- CreateTable
CREATE TABLE "violation_types" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violation_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "violation_types_title_key" ON "violation_types"("title");

-- CreateIndex
CREATE INDEX "violation_types_title_idx" ON "violation_types"("title");

-- CreateIndex
CREATE INDEX "violation_types_isActive_idx" ON "violation_types"("isActive");

-- CreateIndex
CREATE INDEX "violation_types_createdAt_idx" ON "violation_types"("createdAt");

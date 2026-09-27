-- CreateEnum
CREATE TYPE "DocumentGender" AS ENUM ('MALE', 'FEMALE', 'BOTH');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "gender" "DocumentGender" NOT NULL DEFAULT 'BOTH',
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_title_key" ON "documents"("title");

-- CreateIndex
CREATE INDEX "documents_title_idx" ON "documents"("title");

-- CreateIndex
CREATE INDEX "documents_isRequired_idx" ON "documents"("isRequired");

-- CreateIndex
CREATE INDEX "documents_gender_idx" ON "documents"("gender");

-- CreateIndex
CREATE INDEX "documents_isFixed_idx" ON "documents"("isFixed");

-- CreateIndex
CREATE INDEX "documents_createdAt_idx" ON "documents"("createdAt");

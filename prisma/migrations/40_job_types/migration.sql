-- CreateTable
CREATE TABLE "job_types" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_types_title_key" ON "job_types"("title");

-- CreateIndex
CREATE INDEX "job_types_title_idx" ON "job_types"("title");

-- CreateIndex
CREATE INDEX "job_types_createdAt_idx" ON "job_types"("createdAt");

-- Seed
INSERT INTO "job_types" ("id", "title", "description", "createdAt", "updatedAt")
VALUES
  ('8f3c1e20-4a7b-4d91-9c2e-1b6d8a0f0001', 'خدماتی', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8f3c1e20-4a7b-4d91-9c2e-1b6d8a0f0002', 'اقتصادی', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8f3c1e20-4a7b-4d91-9c2e-1b6d8a0f0003', 'توزیعی', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("title") DO NOTHING;

CREATE TABLE IF NOT EXISTS "urban_zones" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "urban_zones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "urban_zones_title_key" ON "urban_zones"("title");
CREATE INDEX IF NOT EXISTS "urban_zones_title_idx" ON "urban_zones"("title");
CREATE INDEX IF NOT EXISTS "urban_zones_isActive_idx" ON "urban_zones"("isActive");
CREATE INDEX IF NOT EXISTS "urban_zones_createdAt_idx" ON "urban_zones"("createdAt");

ALTER TABLE "case_files"
ADD COLUMN "urbanZoneId" TEXT;

ALTER TABLE "case_location_drafts"
ADD COLUMN "urbanZoneId" TEXT;

ALTER TABLE "case_premise_history"
ADD COLUMN "urbanZoneId" TEXT;

CREATE INDEX "case_files_urbanZoneId_idx" ON "case_files"("urbanZoneId");
CREATE INDEX "case_location_drafts_urbanZoneId_idx" ON "case_location_drafts"("urbanZoneId");
CREATE INDEX "case_premise_history_urbanZoneId_idx" ON "case_premise_history"("urbanZoneId");

ALTER TABLE "case_files"
ADD CONSTRAINT "case_files_urbanZoneId_fkey"
FOREIGN KEY ("urbanZoneId") REFERENCES "urban_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_location_drafts"
ADD CONSTRAINT "case_location_drafts_urbanZoneId_fkey"
FOREIGN KEY ("urbanZoneId") REFERENCES "urban_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_premise_history"
ADD CONSTRAINT "case_premise_history_urbanZoneId_fkey"
FOREIGN KEY ("urbanZoneId") REFERENCES "urban_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

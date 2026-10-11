ALTER TABLE "case_places_office" ADD COLUMN "officerRoleId" TEXT;

CREATE UNIQUE INDEX "case_places_office_officerRoleId_key" ON "case_places_office"("officerRoleId");
CREATE INDEX "case_places_office_officerRoleId_idx" ON "case_places_office"("officerRoleId");

ALTER TABLE "case_places_office" ADD CONSTRAINT "case_places_office_officerRoleId_fkey" FOREIGN KEY ("officerRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_places_office" DROP CONSTRAINT "case_places_office_officerId_fkey";
DROP INDEX "case_places_office_officerId_key";
DROP INDEX "case_places_office_officerId_idx";
ALTER TABLE "case_places_office" DROP COLUMN "officerId";

CREATE TYPE "PremiseEstablishment" AS ENUM ('INDEPENDENT', 'COMMERCIAL_COMPLEX', 'RESIDENTIAL_COMPLEX');
CREATE TYPE "PremiseGeoPosition" AS ENUM ('MAIN_FRONTAGE', 'SIDE_FRONTAGE', 'ALLEY');
CREATE TYPE "PremisePublicAccess" AS ENUM ('MEN', 'WOMEN', 'PUBLIC', 'SEPARATE');
CREATE TYPE "PremiseOwnership" AS ENUM ('OWNED', 'RENTED');

ALTER TABLE "users"
ADD COLUMN "premiseCityId" TEXT,
ADD COLUMN "premiseEstablishment" "PremiseEstablishment",
ADD COLUMN "premiseComplexId" TEXT,
ADD COLUMN "premiseAddress" TEXT,
ADD COLUMN "premisePlaque" TEXT,
ADD COLUMN "premisePlaqueSeries" TEXT,
ADD COLUMN "premiseFloor" TEXT,
ADD COLUMN "premiseUnitNo" TEXT,
ADD COLUMN "premisePostalCode" TEXT,
ADD COLUMN "premisePhone" TEXT,
ADD COLUMN "premiseFax" TEXT,
ADD COLUMN "premiseGeoPosition" "PremiseGeoPosition",
ADD COLUMN "premisePublicAccess" "PremisePublicAccess",
ADD COLUMN "registrationPlaceId" TEXT,
ADD COLUMN "premiseOwnership" "PremiseOwnership",
ADD COLUMN "premiseDeedNo" TEXT,
ADD COLUMN "premiseArea" DECIMAL(12,2),
ADD COLUMN "leaseIssuedAt" DATE,
ADD COLUMN "leaseExpiresAt" DATE,
ADD COLUMN "leaseAgency" TEXT,
ADD COLUMN "premiseOwnerName" TEXT;

CREATE INDEX "users_premiseCityId_idx" ON "users"("premiseCityId");
CREATE INDEX "users_premiseComplexId_idx" ON "users"("premiseComplexId");
CREATE INDEX "users_registrationPlaceId_idx" ON "users"("registrationPlaceId");

ALTER TABLE "users" ADD CONSTRAINT "users_premiseCityId_fkey" FOREIGN KEY ("premiseCityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_premiseComplexId_fkey" FOREIGN KEY ("premiseComplexId") REFERENCES "commercial_complexes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_registrationPlaceId_fkey" FOREIGN KEY ("registrationPlaceId") REFERENCES "registration_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "case_premise_history" (
    "id" TEXT NOT NULL,
    "caseFileId" TEXT NOT NULL,
    "replacedByRequestId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "premiseCityId" TEXT,
    "premiseEstablishment" "PremiseEstablishment",
    "premiseComplexId" TEXT,
    "premiseAddress" TEXT,
    "premiseAddressEn" TEXT,
    "premisePlaque" TEXT,
    "premisePlaqueSeries" TEXT,
    "premiseFloor" TEXT,
    "premiseUnitNo" TEXT,
    "premisePostalCode" TEXT,
    "premisePhone" TEXT,
    "premiseFax" TEXT,
    "premiseGeoPosition" "PremiseGeoPosition",
    "premisePublicAccess" "PremisePublicAccess",
    "registrationPlaceId" TEXT,
    "premiseOwnership" "PremiseOwnership",
    "premiseDeedNo" TEXT,
    "premiseArea" DECIMAL(12,2),
    "leaseIssuedAt" DATE,
    "leaseExpiresAt" DATE,
    "leaseAgency" TEXT,
    "premiseOwnerName" TEXT,
    CONSTRAINT "case_premise_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_premise_history_replacedByRequestId_key" ON "case_premise_history"("replacedByRequestId");
CREATE INDEX "case_premise_history_caseFileId_endedAt_idx" ON "case_premise_history"("caseFileId", "endedAt");
CREATE INDEX "case_premise_history_premiseCityId_idx" ON "case_premise_history"("premiseCityId");
CREATE INDEX "case_premise_history_premiseComplexId_idx" ON "case_premise_history"("premiseComplexId");
CREATE INDEX "case_premise_history_registrationPlaceId_idx" ON "case_premise_history"("registrationPlaceId");

ALTER TABLE "case_premise_history" ADD CONSTRAINT "case_premise_history_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_premise_history" ADD CONSTRAINT "case_premise_history_replacedByRequestId_fkey" FOREIGN KEY ("replacedByRequestId") REFERENCES "case_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_premise_history" ADD CONSTRAINT "case_premise_history_premiseCityId_fkey" FOREIGN KEY ("premiseCityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_premise_history" ADD CONSTRAINT "case_premise_history_premiseComplexId_fkey" FOREIGN KEY ("premiseComplexId") REFERENCES "commercial_complexes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_premise_history" ADD CONSTRAINT "case_premise_history_registrationPlaceId_fkey" FOREIGN KEY ("registrationPlaceId") REFERENCES "registration_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

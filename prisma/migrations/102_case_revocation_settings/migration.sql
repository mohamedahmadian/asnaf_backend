CREATE TABLE "case_revocation_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "fixedAmount" DECIMAL(18,0),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_revocation_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_revocation_organizations" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL DEFAULT 'default',
    "inquiryCenterId" TEXT NOT NULL,
    "letterTitle" TEXT,
    "letterBody" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_revocation_organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_revocation_organizations_settingsId_inquiryCenterId_key" ON "case_revocation_organizations"("settingsId", "inquiryCenterId");
CREATE INDEX "case_revocation_organizations_inquiryCenterId_idx" ON "case_revocation_organizations"("inquiryCenterId");
CREATE INDEX "case_revocation_organizations_sortOrder_idx" ON "case_revocation_organizations"("sortOrder");

ALTER TABLE "case_revocation_organizations" ADD CONSTRAINT "case_revocation_organizations_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "case_revocation_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_revocation_organizations" ADD CONSTRAINT "case_revocation_organizations_inquiryCenterId_fkey" FOREIGN KEY ("inquiryCenterId") REFERENCES "inquiry_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "case_revocation_settings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);

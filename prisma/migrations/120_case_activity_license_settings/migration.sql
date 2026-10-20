CREATE TABLE "case_activity_license_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "signerName" TEXT,
    "signerTitle" TEXT,
    "signatureId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_activity_license_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_activity_license_settings_signatureId_key" ON "case_activity_license_settings"("signatureId");

ALTER TABLE "case_activity_license_settings" ADD CONSTRAINT "case_activity_license_settings_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "stored_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

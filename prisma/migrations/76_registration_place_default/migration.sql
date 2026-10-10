ALTER TABLE "registration_places" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "registration_places_isDefault_idx" ON "registration_places"("isDefault");

CREATE UNIQUE INDEX "registration_places_one_default" ON "registration_places"("isDefault") WHERE "isDefault" = true;

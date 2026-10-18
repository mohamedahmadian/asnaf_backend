ALTER TABLE "payment_groups" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "payment_groups_single_default_key"
ON "payment_groups"("isDefault")
WHERE "isDefault" = true;

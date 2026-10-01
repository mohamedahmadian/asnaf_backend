ALTER TABLE "users" ADD COLUMN "caseTrackingCode" TEXT;

CREATE UNIQUE INDEX "users_caseTrackingCode_key" ON "users"("caseTrackingCode");

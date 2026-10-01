CREATE TYPE "PreviousOccupation" AS ENUM ('OTHER', 'ACTIVE_MILITARY', 'RETIRED_MILITARY', 'ACTIVE_EMPLOYEE', 'RETIRED_EMPLOYEE');

ALTER TABLE "users" ADD COLUMN "businessUnitTitle" TEXT,
ADD COLUMN "activityJobId" TEXT,
ADD COLUMN "previousOccupation" "PreviousOccupation",
ADD COLUMN "posDeviceCount" INTEGER;

CREATE INDEX "users_activityJobId_idx" ON "users"("activityJobId");

ALTER TABLE "users" ADD CONSTRAINT "users_activityJobId_fkey" FOREIGN KEY ("activityJobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

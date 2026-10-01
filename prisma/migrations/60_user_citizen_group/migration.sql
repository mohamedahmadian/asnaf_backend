ALTER TABLE "users" DROP CONSTRAINT "users_jobGroupId_fkey";

DROP INDEX "users_jobGroupId_idx";

ALTER TABLE "users" DROP COLUMN "jobGroupId";

ALTER TABLE "users" ADD COLUMN "citizenGroup" TEXT;

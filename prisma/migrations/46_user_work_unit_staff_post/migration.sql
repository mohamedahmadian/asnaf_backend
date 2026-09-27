-- AlterTable
ALTER TABLE "users" ADD COLUMN "workUnitId" TEXT,
ADD COLUMN "staffPostId" TEXT;

-- CreateIndex
CREATE INDEX "users_workUnitId_idx" ON "users"("workUnitId");

-- CreateIndex
CREATE INDEX "users_staffPostId_idx" ON "users"("staffPostId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_workUnitId_fkey" FOREIGN KEY ("workUnitId") REFERENCES "work_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_staffPostId_fkey" FOREIGN KEY ("staffPostId") REFERENCES "staff_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

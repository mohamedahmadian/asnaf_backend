-- CreateTable
CREATE TABLE "case_management_approvers" (
    "id" TEXT NOT NULL,
    "workUnitId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_management_approvers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_management_approvers_workUnitId_idx" ON "case_management_approvers"("workUnitId");

-- CreateIndex
CREATE INDEX "case_management_approvers_roleId_idx" ON "case_management_approvers"("roleId");

-- CreateIndex
CREATE INDEX "case_management_approvers_createdAt_idx" ON "case_management_approvers"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "case_management_approvers_workUnitId_roleId_key" ON "case_management_approvers"("workUnitId", "roleId");

-- AddForeignKey
ALTER TABLE "case_management_approvers" ADD CONSTRAINT "case_management_approvers_workUnitId_fkey" FOREIGN KEY ("workUnitId") REFERENCES "work_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_management_approvers" ADD CONSTRAINT "case_management_approvers_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

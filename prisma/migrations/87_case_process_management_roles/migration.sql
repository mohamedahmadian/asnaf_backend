-- CreateTable
CREATE TABLE "case_process_management_roles" (
    "id" TEXT NOT NULL,
    "requestType" "CaseRequestType" NOT NULL,
    "roleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_process_management_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_process_management_roles_requestType_idx" ON "case_process_management_roles"("requestType");

-- CreateIndex
CREATE INDEX "case_process_management_roles_roleId_idx" ON "case_process_management_roles"("roleId");

-- CreateIndex
CREATE INDEX "case_process_management_roles_createdAt_idx" ON "case_process_management_roles"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "case_process_management_roles_requestType_roleId_key" ON "case_process_management_roles"("requestType", "roleId");

-- AddForeignKey
ALTER TABLE "case_process_management_roles" ADD CONSTRAINT "case_process_management_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

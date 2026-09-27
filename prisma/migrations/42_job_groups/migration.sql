-- CreateTable
CREATE TABLE "job_groups" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "jobTypeId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_inquiry_centers" (
    "jobId" TEXT NOT NULL,
    "inquiryCenterId" TEXT NOT NULL,

    CONSTRAINT "job_inquiry_centers_pkey" PRIMARY KEY ("jobId","inquiryCenterId")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_groups_title_key" ON "job_groups"("title");

-- CreateIndex
CREATE UNIQUE INDEX "job_groups_code_key" ON "job_groups"("code");

-- CreateIndex
CREATE INDEX "job_groups_title_idx" ON "job_groups"("title");

-- CreateIndex
CREATE INDEX "job_groups_code_idx" ON "job_groups"("code");

-- CreateIndex
CREATE INDEX "job_groups_isActive_idx" ON "job_groups"("isActive");

-- CreateIndex
CREATE INDEX "job_groups_createdAt_idx" ON "job_groups"("createdAt");

-- CreateIndex
CREATE INDEX "jobs_groupId_idx" ON "jobs"("groupId");

-- CreateIndex
CREATE INDEX "jobs_jobTypeId_idx" ON "jobs"("jobTypeId");

-- CreateIndex
CREATE INDEX "jobs_title_idx" ON "jobs"("title");

-- CreateIndex
CREATE INDEX "jobs_isActive_idx" ON "jobs"("isActive");

-- CreateIndex
CREATE INDEX "jobs_createdAt_idx" ON "jobs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_groupId_code_key" ON "jobs"("groupId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_groupId_title_key" ON "jobs"("groupId", "title");

-- CreateIndex
CREATE INDEX "job_inquiry_centers_inquiryCenterId_idx" ON "job_inquiry_centers"("inquiryCenterId");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "job_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_jobTypeId_fkey" FOREIGN KEY ("jobTypeId") REFERENCES "job_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_inquiry_centers" ADD CONSTRAINT "job_inquiry_centers_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_inquiry_centers" ADD CONSTRAINT "job_inquiry_centers_inquiryCenterId_fkey" FOREIGN KEY ("inquiryCenterId") REFERENCES "inquiry_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

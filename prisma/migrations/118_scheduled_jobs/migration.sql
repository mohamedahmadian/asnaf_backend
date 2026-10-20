-- CreateEnum
CREATE TYPE "ScheduledJobTrigger" AS ENUM ('SYSTEM', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScheduledJobRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" "ScheduledJobRunStatus",
    "lastMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "scheduled_job_runs" (
    "id" TEXT NOT NULL,
    "jobCode" TEXT NOT NULL,
    "trigger" "ScheduledJobTrigger" NOT NULL,
    "status" "ScheduledJobRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "message" TEXT,
    "detail" JSONB,
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_job_runs_jobCode_startedAt_idx" ON "scheduled_job_runs"("jobCode", "startedAt");

-- CreateIndex
CREATE INDEX "scheduled_job_runs_status_idx" ON "scheduled_job_runs"("status");

-- CreateIndex
CREATE INDEX "scheduled_job_runs_triggeredById_idx" ON "scheduled_job_runs"("triggeredById");

-- AddForeignKey
ALTER TABLE "scheduled_job_runs" ADD CONSTRAINT "scheduled_job_runs_jobCode_fkey" FOREIGN KEY ("jobCode") REFERENCES "scheduled_jobs"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_job_runs" ADD CONSTRAINT "scheduled_job_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

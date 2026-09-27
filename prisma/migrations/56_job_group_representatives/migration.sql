-- CreateTable
CREATE TABLE "job_group_representatives" (
    "jobGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_group_representatives_pkey" PRIMARY KEY ("jobGroupId","userId")
);

-- CreateIndex
CREATE INDEX "job_group_representatives_userId_idx" ON "job_group_representatives"("userId");

-- CreateIndex
CREATE INDEX "job_group_representatives_createdAt_idx" ON "job_group_representatives"("createdAt");

-- AddForeignKey
ALTER TABLE "job_group_representatives" ADD CONSTRAINT "job_group_representatives_jobGroupId_fkey" FOREIGN KEY ("jobGroupId") REFERENCES "job_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_group_representatives" ADD CONSTRAINT "job_group_representatives_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "roles" ("id", "code", "name", "description", "isSystem", "createdAt", "updatedAt")
VALUES (
    gen_random_uuid(),
    'JOB_GROUP_REP',
    'نماینده گروه',
    'نماینده یک گروه شغلی؛ با کد ملی و رمز عبور وارد سامانه می‌شود',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET "isSystem" = true;

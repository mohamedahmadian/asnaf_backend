ALTER TABLE "case_suspensions" ADD COLUMN IF NOT EXISTS "liftNote" TEXT;
ALTER TABLE "case_suspensions" ADD COLUMN IF NOT EXISTS "liftedAt" TIMESTAMP(3);

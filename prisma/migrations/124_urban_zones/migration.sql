CREATE TABLE IF NOT EXISTS "urban_zones" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "urban_zones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "urban_zones_title_key" ON "urban_zones"("title");
CREATE INDEX IF NOT EXISTS "urban_zones_title_idx" ON "urban_zones"("title");
CREATE INDEX IF NOT EXISTS "urban_zones_isActive_idx" ON "urban_zones"("isActive");
CREATE INDEX IF NOT EXISTS "urban_zones_createdAt_idx" ON "urban_zones"("createdAt");

-- CreateTable
CREATE TABLE "work_units" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_units_title_key" ON "work_units"("title");

-- CreateIndex
CREATE INDEX "work_units_title_idx" ON "work_units"("title");

-- CreateIndex
CREATE INDEX "work_units_isActive_idx" ON "work_units"("isActive");

-- CreateIndex
CREATE INDEX "work_units_createdAt_idx" ON "work_units"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_posts_title_key" ON "staff_posts"("title");

-- CreateIndex
CREATE INDEX "staff_posts_title_idx" ON "staff_posts"("title");

-- CreateIndex
CREATE INDEX "staff_posts_isActive_idx" ON "staff_posts"("isActive");

-- CreateIndex
CREATE INDEX "staff_posts_createdAt_idx" ON "staff_posts"("createdAt");

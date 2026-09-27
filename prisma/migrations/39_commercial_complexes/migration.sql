-- CreateTable
CREATE TABLE "commercial_complexes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "address" TEXT,
    "postalCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_complexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_floors" (
    "id" TEXT NOT NULL,
    "complexId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_lanes" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_lanes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_units" (
    "id" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "plaque" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_complexes_isActive_idx" ON "commercial_complexes"("isActive");

-- CreateIndex
CREATE INDEX "commercial_complexes_name_idx" ON "commercial_complexes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_floors_complexId_code_key" ON "commercial_floors"("complexId", "code");

-- CreateIndex
CREATE INDEX "commercial_floors_complexId_idx" ON "commercial_floors"("complexId");

-- CreateIndex
CREATE INDEX "commercial_floors_title_idx" ON "commercial_floors"("title");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_lanes_floorId_code_key" ON "commercial_lanes"("floorId", "code");

-- CreateIndex
CREATE INDEX "commercial_lanes_floorId_idx" ON "commercial_lanes"("floorId");

-- CreateIndex
CREATE INDEX "commercial_lanes_title_idx" ON "commercial_lanes"("title");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_units_laneId_code_key" ON "commercial_units"("laneId", "code");

-- CreateIndex
CREATE INDEX "commercial_units_laneId_isActive_idx" ON "commercial_units"("laneId", "isActive");

-- CreateIndex
CREATE INDEX "commercial_units_plaque_idx" ON "commercial_units"("plaque");

-- AddForeignKey
ALTER TABLE "commercial_floors" ADD CONSTRAINT "commercial_floors_complexId_fkey" FOREIGN KEY ("complexId") REFERENCES "commercial_complexes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_lanes" ADD CONSTRAINT "commercial_lanes_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "commercial_floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_units" ADD CONSTRAINT "commercial_units_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "commercial_lanes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

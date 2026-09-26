-- AlterTable
ALTER TABLE "products" ADD COLUMN     "spotId" TEXT;

-- CreateTable
CREATE TABLE "store_maps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "aspect" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_spots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'teal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_spots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_maps_tenantId_name_key" ON "store_maps"("tenantId", "name");

-- CreateIndex
CREATE INDEX "map_spots_mapId_idx" ON "map_spots"("mapId");

-- CreateIndex
CREATE INDEX "products_spotId_idx" ON "products"("spotId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "map_spots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_maps" ADD CONSTRAINT "store_maps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_spots" ADD CONSTRAINT "map_spots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_spots" ADD CONSTRAINT "map_spots_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "store_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;


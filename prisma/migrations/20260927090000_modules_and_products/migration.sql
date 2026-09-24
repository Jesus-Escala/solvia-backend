-- CreateEnum
CREATE TYPE "TenantModule" AS ENUM ('sales', 'inventory');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('unit', 'kg', 'liter', 'box', 'pack', 'dozen', 'meter');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "modules" "TenantModule"[] DEFAULT ARRAY[]::"TenantModule"[];

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "unit" "ProductUnit" NOT NULL DEFAULT 'unit',
    "price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2),
    "trackStock" BOOLEAN NOT NULL DEFAULT true,
    "minStock" DECIMAL(12,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_tenantId_active_name_idx" ON "products"("tenantId", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_code_key" ON "products"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

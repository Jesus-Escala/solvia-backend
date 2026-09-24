-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "shortage" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "hasShortage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "balanceAfter" DECIMAL(12,3),
ADD COLUMN     "shortage" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "sales_tenantId_hasShortage_idx" ON "sales"("tenantId", "hasShortage");


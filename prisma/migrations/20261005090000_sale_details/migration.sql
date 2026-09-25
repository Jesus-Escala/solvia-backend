-- Sale discount and note; free lines (not in the catalog) have no product.
ALTER TABLE "sales" ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "notes" TEXT;
ALTER TABLE "sale_items" ALTER COLUMN "productId" DROP NOT NULL;

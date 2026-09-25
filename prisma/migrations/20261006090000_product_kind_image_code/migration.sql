-- Products or services, a picture, and an internal code for every product without one.
CREATE TYPE "ProductKind" AS ENUM ('product', 'service');

ALTER TABLE "products" ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'product',
  ADD COLUMN "imageUrl" TEXT;

-- Internal codes: "2" + 7 digits, numbered per business after the highest one already used.
WITH base AS (
  SELECT "tenantId", MAX(CAST(SUBSTRING("code" FROM 2) AS INTEGER)) AS top
  FROM "products"
  WHERE "code" ~ '^2[0-9]{7}$'
  GROUP BY "tenantId"
), numbered AS (
  SELECT p."id", p."tenantId",
         ROW_NUMBER() OVER (PARTITION BY p."tenantId" ORDER BY p."createdAt", p."id") AS n
  FROM "products" p
  WHERE p."code" IS NULL
)
UPDATE "products" p
SET "code" = '2' || LPAD((COALESCE(b.top, 0) + n.n)::text, 7, '0')
FROM numbered n
LEFT JOIN base b ON b."tenantId" = n."tenantId"
WHERE p."id" = n."id";

-- The main payment method of each purchase (to sort and filter; the parts are in purchase_payments).
-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "method" "PaymentMethod";


-- The method that paid the most of each purchase recorded so far.
UPDATE "purchases" pu SET "method" = top."method"
FROM (
  SELECT DISTINCT ON (p."purchaseId") p."purchaseId", p."method"
  FROM "purchase_payments" p
  ORDER BY p."purchaseId", p."amount" DESC, p."position" ASC
) top
WHERE top."purchaseId" = pu."id";

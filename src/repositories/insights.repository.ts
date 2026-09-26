import type { PaymentMethod, Prisma, SalePaymentType } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import { sqlDate } from './sql';

/**
 * Sales and purchases analysis: the detail of every ticket and purchase, and sales and purchases
 * grouped by day, hour, method, category, seller, supplier and product. Aggregated in SQL.
 *
 * TENANT ISOLATION: `$queryRaw` bypasses the tenant-scope extension, so every query filters by
 * `requireTenantId()` explicitly (`tests/insightsRepository.test.ts` checks each one).
 */

type Decimal = Prisma.Decimal | null;

export const insightsRepository = {
  /** Every sale of the range (voided too), with its lines and payments summarized. */
  salesDetail(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        id: string;
        number: number;
        date: Date;
        createdAt: Date;
        customer: string | null;
        seller: string | null;
        paymentType: SalePaymentType;
        status: string;
        docType: string;
        docNumber: string | null;
        items: string | null;
        units: Decimal;
        discount: Decimal;
        total: Decimal;
        methods: string | null;
        outstanding: Decimal;
      }>
    >`
      SELECT s."id", s."number", s."date", s."createdAt", c."name" AS "customer",
             u."name" AS "seller", s."paymentType", s."status"::text AS "status",
             s."docType"::text AS "docType", s."docNumber",
             (SELECT string_agg(i."description" || ' x' || trim_scale(i."quantity")::text, ', '
                                ORDER BY i."position")
                FROM "sale_items" i WHERE i."saleId" = s."id") AS "items",
             (SELECT SUM(i."quantity") FROM "sale_items" i WHERE i."saleId" = s."id") AS "units",
             s."discount", s."total",
             (SELECT string_agg(p."method"::text || ':' || p."amount"::text, ';'
                                ORDER BY p."position")
                FROM "sale_payments" p WHERE p."saleId" = s."id") AS "methods",
             r."totalAmount" - r."paidAmount" AS "outstanding"
      FROM "sales" s
      LEFT JOIN "customers" c ON c."id" = s."customerId"
      LEFT JOIN "users" u ON u."id" = s."createdById"
      LEFT JOIN "receivables" r ON r."saleId" = s."id"
      WHERE s."tenantId" = ${tenantId}
        AND s."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      ORDER BY s."date" DESC, s."number" DESC
    `;
  },

  /** Completed sales per day: count, cash, credit, discounts and total. */
  salesByDay(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        date: Date;
        sales: number;
        total: Decimal;
        cash: Decimal;
        credit: Decimal;
        discount: Decimal;
      }>
    >`
      SELECT s."date" AS "date", COUNT(*)::int AS "sales", SUM(s."total") AS "total",
             SUM(s."total") FILTER (WHERE s."paymentType" = 'cash') AS "cash",
             SUM(s."total") FILTER (WHERE s."paymentType" = 'credit') AS "credit",
             SUM(s."discount") AS "discount"
      FROM "sales" s
      WHERE s."tenantId" = ${tenantId}
        AND s."status" = 'completed'
        AND s."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY s."date"
      ORDER BY s."date" ASC
    `;
  },

  /** Completed sales per local hour of the day (when the business sells most). */
  salesByHour(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<Array<{ hour: number; sales: number; total: Decimal }>>`
      SELECT EXTRACT(HOUR FROM ((s."createdAt" AT TIME ZONE 'UTC')
               AT TIME ZONE ${env.APP_TIMEZONE}))::int AS "hour",
             COUNT(*)::int AS "sales", SUM(s."total") AS "total"
      FROM "sales" s
      WHERE s."tenantId" = ${tenantId}
        AND s."status" = 'completed'
        AND s."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY 1
      ORDER BY 1
    `;
  },

  /** How cash sales were paid (each method of each sale) and how much was sold on credit. */
  salesByMethod(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{ method: PaymentMethod | null; sales: number; amount: Decimal }>
    >`
      SELECT p."method" AS "method", COUNT(DISTINCT s."id")::int AS "sales",
             SUM(p."amount") AS "amount"
      FROM "sale_payments" p
      JOIN "sales" s ON s."id" = p."saleId"
      WHERE s."tenantId" = ${tenantId}
        AND s."status" = 'completed'
        AND s."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY p."method"
      UNION ALL
      SELECT NULL AS "method", COUNT(*)::int AS "sales", SUM(s."total") AS "amount"
      FROM "sales" s
      WHERE s."tenantId" = ${tenantId}
        AND s."status" = 'completed'
        AND s."paymentType" = 'credit'
        AND s."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      HAVING COUNT(*) > 0
      ORDER BY "amount" DESC
    `;
  },

  /** Units, revenue and estimated cost per product category (null: without one). */
  salesByCategory(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        categoryId: string | null;
        name: string | null;
        products: number;
        quantity: Decimal;
        revenue: Decimal;
        cost: Decimal;
        sales: number;
      }>
    >`
      SELECT cat."id" AS "categoryId", cat."name" AS "name",
             COUNT(DISTINCT i."productId")::int AS "products",
             SUM(i."quantity") AS "quantity", SUM(i."subtotal") AS "revenue",
             SUM(i."quantity" * pr."cost") AS "cost",
             COUNT(DISTINCT s."id")::int AS "sales"
      FROM "sale_items" i
      JOIN "sales" s ON s."id" = i."saleId"
      LEFT JOIN "products" pr ON pr."id" = i."productId"
      LEFT JOIN "product_categories" cat ON cat."id" = pr."categoryId"
      WHERE s."tenantId" = ${tenantId}
        AND s."status" = 'completed'
        AND s."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY cat."id", cat."name"
      ORDER BY "revenue" DESC
    `;
  },

  /** Completed sales per user who recorded them. */
  salesBySeller(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{ userId: string | null; name: string | null; sales: number; total: Decimal }>
    >`
      SELECT u."id" AS "userId", u."name" AS "name", COUNT(*)::int AS "sales",
             SUM(s."total") AS "total"
      FROM "sales" s
      LEFT JOIN "users" u ON u."id" = s."createdById"
      WHERE s."tenantId" = ${tenantId}
        AND s."status" = 'completed'
        AND s."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY u."id", u."name"
      ORDER BY "total" DESC
    `;
  },

  /** Every purchase of the range (voided too), with its lines and payments summarized. */
  purchasesDetail(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        id: string;
        number: number;
        date: Date;
        supplier: string | null;
        status: string;
        docType: string;
        docNumber: string | null;
        items: string | null;
        units: Decimal;
        total: Decimal;
        methods: string | null;
        user: string | null;
      }>
    >`
      SELECT pu."id", pu."number", pu."date", su."name" AS "supplier",
             pu."status"::text AS "status", pu."docType"::text AS "docType", pu."docNumber",
             (SELECT string_agg(i."description" || ' x' || trim_scale(i."quantity")::text, ', '
                                ORDER BY i."position")
                FROM "purchase_items" i WHERE i."purchaseId" = pu."id") AS "items",
             (SELECT SUM(i."quantity") FROM "purchase_items" i
                WHERE i."purchaseId" = pu."id") AS "units",
             pu."total",
             (SELECT string_agg(p."method"::text || ':' || p."amount"::text, ';'
                                ORDER BY p."position")
                FROM "purchase_payments" p WHERE p."purchaseId" = pu."id") AS "methods",
             u."name" AS "user"
      FROM "purchases" pu
      LEFT JOIN "suppliers" su ON su."id" = pu."supplierId"
      LEFT JOIN "users" u ON u."id" = pu."createdById"
      WHERE pu."tenantId" = ${tenantId}
        AND pu."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      ORDER BY pu."date" DESC, pu."number" DESC
    `;
  },

  /** Completed purchases per day. */
  purchasesByDay(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<Array<{ date: Date; purchases: number; total: Decimal }>>`
      SELECT pu."date" AS "date", COUNT(*)::int AS "purchases", SUM(pu."total") AS "total"
      FROM "purchases" pu
      WHERE pu."tenantId" = ${tenantId}
        AND pu."status" = 'completed'
        AND pu."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY pu."date"
      ORDER BY pu."date" ASC
    `;
  },

  /** Completed purchases per supplier (null: without one). */
  purchasesBySupplier(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        supplierId: string | null;
        name: string | null;
        purchases: number;
        total: Decimal;
        lastPurchase: Date;
      }>
    >`
      SELECT su."id" AS "supplierId", su."name" AS "name", COUNT(*)::int AS "purchases",
             SUM(pu."total") AS "total", MAX(pu."date") AS "lastPurchase"
      FROM "purchases" pu
      LEFT JOIN "suppliers" su ON su."id" = pu."supplierId"
      WHERE pu."tenantId" = ${tenantId}
        AND pu."status" = 'completed'
        AND pu."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY su."id", su."name"
      ORDER BY "total" DESC
    `;
  },

  /** What was bought of each product: quantity, cost, average and last unit cost. */
  purchasesByProduct(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        productId: string;
        name: string;
        unit: string;
        quantity: Decimal;
        total: Decimal;
        purchases: number;
        lastCost: Decimal;
        lastPurchase: Date;
      }>
    >`
      SELECT pr."id" AS "productId", pr."name" AS "name", pr."unit"::text AS "unit",
             SUM(i."quantity") AS "quantity", SUM(i."subtotal") AS "total",
             COUNT(DISTINCT pu."id")::int AS "purchases",
             (ARRAY_AGG(i."unitCost" ORDER BY pu."date" DESC, pu."number" DESC))[1] AS "lastCost",
             MAX(pu."date") AS "lastPurchase"
      FROM "purchase_items" i
      JOIN "purchases" pu ON pu."id" = i."purchaseId"
      JOIN "products" pr ON pr."id" = i."productId"
      WHERE pu."tenantId" = ${tenantId}
        AND pu."status" = 'completed'
        AND pu."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY pr."id", pr."name", pr."unit"
      ORDER BY "total" DESC
    `;
  },

  /** How purchases were paid to suppliers, per method (only the ones that recorded it). */
  purchasesByMethod(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<Array<{ method: PaymentMethod; purchases: number; amount: Decimal }>>`
      SELECT p."method" AS "method", COUNT(DISTINCT pu."id")::int AS "purchases",
             SUM(p."amount") AS "amount"
      FROM "purchase_payments" p
      JOIN "purchases" pu ON pu."id" = p."purchaseId"
      WHERE pu."tenantId" = ${tenantId}
        AND pu."status" = 'completed'
        AND pu."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY p."method"
      ORDER BY "amount" DESC
    `;
  },
};

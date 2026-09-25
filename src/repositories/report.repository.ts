import type { Prisma, SaleStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import { sqlDate } from './sql';

/**
 * Tabular reports (`/reports/*`). Aggregated in SQL.
 *
 * TENANT ISOLATION: `$queryRaw` bypasses the tenant-scope extension, so every query filters by
 * `requireTenantId()` explicitly (`tests/reportRepository.test.ts` checks each one).
 */

type Decimal = Prisma.Decimal | null;

export const reportRepository = {
  /** Completed sales per customer (walk-in sales grouped under a null customer). */
  salesByCustomer(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        customerId: string | null;
        name: string | null;
        sales: number;
        total: Decimal;
        cash: Decimal;
        credit: Decimal;
        lastSale: Date;
      }>
    >`
      SELECT s."customerId" AS "customerId", c."name" AS "name",
             COUNT(*)::int AS "sales",
             SUM(s."total") AS "total",
             SUM(s."total") FILTER (WHERE s."paymentType" = 'cash') AS "cash",
             SUM(s."total") FILTER (WHERE s."paymentType" = 'credit') AS "credit",
             MAX(s."date") AS "lastSale"
      FROM "sales" s
      LEFT JOIN "customers" c ON c."id" = s."customerId"
      WHERE s."tenantId" = ${tenantId}
        AND s."status" = 'completed'
        AND s."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY s."customerId", c."name"
      ORDER BY "total" DESC, c."name" ASC NULLS LAST
    `;
  },

  /** Payments of receivables per customer and method, dated within the range. */
  collectionsByCustomer(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        customerId: string;
        name: string;
        payments: number;
        amount: Decimal;
        yape: Decimal;
        plin: Decimal;
        cash: Decimal;
        bankTransfer: Decimal;
        lastPayment: Date;
      }>
    >`
      SELECT c."id" AS "customerId", c."name" AS "name",
             COUNT(*)::int AS "payments",
             SUM(p."amount") AS "amount",
             SUM(p."amount") FILTER (WHERE p."method" = 'yape') AS "yape",
             SUM(p."amount") FILTER (WHERE p."method" = 'plin') AS "plin",
             SUM(p."amount") FILTER (WHERE p."method" = 'cash') AS "cash",
             SUM(p."amount") FILTER (WHERE p."method" = 'bank_transfer') AS "bankTransfer",
             MAX(p."date") AS "lastPayment"
      FROM "payments" p
      JOIN "receivables" r ON r."id" = p."receivableId"
      JOIN "customers" c ON c."id" = r."customerId"
      WHERE r."tenantId" = ${tenantId}
        AND p."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY c."id", c."name"
      ORDER BY "amount" DESC, c."name" ASC
    `;
  },

  /** Units and revenue per product in completed sales; cost estimated with the current cost. */
  salesByProduct(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        productId: string | null;
        name: string;
        unit: string;
        quantity: Decimal;
        revenue: Decimal;
        cost: Decimal;
        sales: number;
      }>
    >`
      SELECT pr."id" AS "productId", COALESCE(pr."name", i."description") AS "name",
             COALESCE(pr."unit"::text, 'unit') AS "unit",
             SUM(i."quantity") AS "quantity",
             SUM(i."subtotal") AS "revenue",
             SUM(i."quantity" * pr."cost") AS "cost",
             COUNT(DISTINCT s."id")::int AS "sales"
      FROM "sale_items" i
      JOIN "sales" s ON s."id" = i."saleId"
      LEFT JOIN "products" pr ON pr."id" = i."productId"
      WHERE s."tenantId" = ${tenantId}
        AND s."status" = 'completed'
        AND s."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY pr."id", COALESCE(pr."name", i."description"), COALESCE(pr."unit"::text, 'unit')
      ORDER BY "revenue" DESC, "name" ASC
    `;
  },

  /** Counted, active products with their stock, cost and price (for the stock valuation). */
  stock() {
    return prisma.product.findMany({
      where: { active: true, trackStock: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        code: true,
        unit: true,
        stock: true,
        minStock: true,
        cost: true,
        price: true,
      },
    });
  },

  /**
   * Sale lines that left without stock to cover them: when, which sale, what, how much was sold
   * and how much of it had no stock, and the balance it left (traceability of differences).
   */
  shortages(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        movementId: string;
        createdAt: Date;
        saleId: string;
        saleNumber: number;
        saleDate: Date;
        saleStatus: SaleStatus;
        customer: string | null;
        productId: string;
        product: string;
        quantity: Decimal;
        shortage: Decimal;
        balanceAfter: Decimal;
      }>
    >`
      SELECT m."id" AS "movementId", m."createdAt" AS "createdAt",
             s."id" AS "saleId", s."number" AS "saleNumber", s."date" AS "saleDate",
             s."status" AS "saleStatus", c."name" AS "customer",
             pr."id" AS "productId", pr."name" AS "product",
             -m."quantity" AS "quantity", m."shortage" AS "shortage",
             m."balanceAfter" AS "balanceAfter"
      FROM "stock_movements" m
      JOIN "sales" s ON s."id" = m."saleId"
      JOIN "products" pr ON pr."id" = m."productId"
      LEFT JOIN "customers" c ON c."id" = s."customerId"
      WHERE m."tenantId" = ${tenantId}
        AND m."type" = 'sale'
        AND m."shortage" > 0
        AND s."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      ORDER BY m."createdAt" DESC, m."id" DESC
    `;
  },
};

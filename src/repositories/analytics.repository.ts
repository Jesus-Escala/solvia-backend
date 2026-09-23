import type { MessageTemplateType, NotificationStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import { sqlDate, sqlLocalDay, sqlLocalDayWithin } from './sql';

/**
 * Aggregations for the business dashboard (`/dashboard/analytics`, `/summary`, `/cash-flow`).
 *
 * TENANT ISOLATION: `$queryRaw` bypasses the tenant-scope extension of `prisma`, so EVERY raw
 * query below filters by `requireTenantId()` explicitly (`r."tenantId"` / `c."tenantId"`), and
 * fails closed when no tenant context is active. Payments have no `tenantId`: they are always
 * joined through their receivable. `tests/analyticsRepository.test.ts` checks every raw query.
 * Model queries (`groupBy`, `count`) go through the extension and are scoped automatically.
 */

type Decimal = Prisma.Decimal | null;

export const analyticsRepository = {
  /** Payments per calendar day within [from, to]: amount, count and summed days since issue. */
  paymentsByDay(from: Date, to: Date) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{ day: Date; amount: Decimal; count: number; daysToPay: number | null }>
    >`
      SELECT p."date" AS "day",
             SUM(p."amount") AS "amount",
             COUNT(*)::int AS "count",
             SUM(p."date" - r."issueDate")::int AS "daysToPay"
      FROM "payments" p
      JOIN "receivables" r ON r."id" = p."receivableId"
      WHERE r."tenantId" = ${tenantId}
        AND p."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY p."date"
    `;
  },

  /** Payments within [from, to] grouped by method (scoped by the extension). */
  paymentsByMethod(from: Date, to: Date) {
    return prisma.payment.groupBy({
      by: ['method'],
      where: { date: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
    });
  },

  /** Customers with the largest payments within [from, to]. */
  topPayers(from: Date, to: Date, limit: number) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{ customerId: string; name: string; amount: Decimal; payments: number }>
    >`
      SELECT c."id" AS "customerId", c."name" AS "name",
             SUM(p."amount") AS "amount", COUNT(*)::int AS "payments"
      FROM "payments" p
      JOIN "receivables" r ON r."id" = p."receivableId"
      JOIN "customers" c ON c."id" = r."customerId"
      WHERE r."tenantId" = ${tenantId}
        AND p."date" BETWEEN ${sqlDate(from)} AND ${sqlDate(to)}
      GROUP BY c."id", c."name"
      ORDER BY "amount" DESC, c."name" ASC, c."id" ASC
      LIMIT ${limit}
    `;
  },

  /** Receivables issued per day within [from, to] (scoped by the extension). */
  issuedByDay(from: Date, to: Date) {
    return prisma.receivable.groupBy({
      by: ['issueDate'],
      where: { issueDate: { gte: from, lte: to } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    });
  },

  /** Receivables due per day within [from, to] with their paid amounts (scoped by the extension). */
  dueByDay(from: Date, to: Date) {
    return prisma.receivable.groupBy({
      by: ['dueDate'],
      where: { dueDate: { gte: from, lte: to } },
      _sum: { totalAmount: true, paidAmount: true },
    });
  },

  /** Customers created per local calendar day (in `timeZone`) within [from, to]. */
  customersCreatedByDay(from: Date, to: Date, timeZone: string) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<Array<{ day: Date; count: number }>>`
      SELECT ${sqlLocalDay('c."createdAt"', timeZone)} AS "day", COUNT(*)::int AS "count"
      FROM "customers" c
      WHERE c."tenantId" = ${tenantId}
        AND ${sqlLocalDayWithin('c."createdAt"', from, to, timeZone)}
      GROUP BY 1
    `;
  },

  /** Notification send attempts per local day (in `timeZone`) of `sentAt`, status and type. */
  notificationsByDay(from: Date, to: Date, timeZone: string) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        day: Date;
        status: NotificationStatus;
        type: MessageTemplateType | null;
        count: number;
      }>
    >`
      SELECT ${sqlLocalDay('n."sentAt"', timeZone)} AS "day", n."status" AS "status",
             n."templateType" AS "type", COUNT(*)::int AS "count"
      FROM "notifications" n
      JOIN "receivables" r ON r."id" = n."receivableId"
      WHERE r."tenantId" = ${tenantId}
        AND ${sqlLocalDayWithin('n."sentAt"', from, to, timeZone)}
      GROUP BY 1, 2, 3
    `;
  },

  /**
   * Reminder effectiveness for [from, to] (`current`) and [previousFrom, from - 1]: receivables
   * with a successfully sent reminder (pre-due, due or overdue template; statements excluded)
   * and how many of them received a payment dated on the reminder day or up to `withinDays`
   * days later.
   */
  remindedReceivables(
    previousFrom: Date,
    from: Date,
    to: Date,
    withinDays: number,
    timeZone: string,
  ) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<Array<{ current: boolean; reminded: number; paid: number }>>`
      WITH reminders AS (
        SELECT n."receivableId", ${sqlLocalDay('n."sentAt"', timeZone)} AS "day"
        FROM "notifications" n
        JOIN "receivables" r ON r."id" = n."receivableId"
        WHERE r."tenantId" = ${tenantId}
          AND n."status" = 'sent'
          AND n."templateType" IN ('pre_due_reminder', 'due_reminder', 'overdue_reminder')
          AND ${sqlLocalDayWithin('n."sentAt"', previousFrom, to, timeZone)}
      ),
      outcomes AS (
        SELECT rm."receivableId", rm."day" >= ${sqlDate(from)} AS "current",
               EXISTS (
                 SELECT 1 FROM "payments" p
                 WHERE p."receivableId" = rm."receivableId"
                   AND p."date" BETWEEN rm."day" AND rm."day" + ${withinDays}::int
               ) AS "paid"
        FROM reminders rm
      )
      SELECT "current",
             COUNT(DISTINCT "receivableId")::int AS "reminded",
             (COUNT(DISTINCT "receivableId") FILTER (WHERE "paid"))::int AS "paid"
      FROM outcomes
      GROUP BY "current"
    `;
  },

  countCustomers() {
    return prisma.customer.count();
  },

  /**
   * Open balance of unpaid receivables per due date. `openCount` counts receivables with a
   * positive balance; `count` every unpaid one (same semantics as the former in-memory code).
   */
  openBalancesByDueDate() {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{ dueDate: Date; outstanding: Decimal; openCount: number; count: number }>
    >`
      SELECT r."dueDate" AS "dueDate",
             SUM(GREATEST(r."totalAmount" - r."paidAmount", 0)) AS "outstanding",
             (COUNT(*) FILTER (WHERE r."totalAmount" > r."paidAmount"))::int AS "openCount",
             COUNT(*)::int AS "count"
      FROM "receivables" r
      WHERE r."tenantId" = ${tenantId} AND r."status" <> 'paid'
      GROUP BY r."dueDate"
    `;
  },

  /** Customers ranked by open balance (unpaid receivables with a positive balance). */
  topDebtors(limit: number) {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<
      Array<{
        customerId: string;
        name: string;
        outstanding: Decimal;
        overdue: Decimal;
        receivables: number;
      }>
    >`
      SELECT c."id" AS "customerId", c."name" AS "name",
             SUM(r."totalAmount" - r."paidAmount") AS "outstanding",
             COALESCE(SUM(r."totalAmount" - r."paidAmount") FILTER (WHERE r."status" = 'overdue'), 0)
               AS "overdue",
             COUNT(*)::int AS "receivables"
      FROM "receivables" r
      JOIN "customers" c ON c."id" = r."customerId"
      WHERE r."tenantId" = ${tenantId}
        AND r."status" <> 'paid'
        AND r."totalAmount" > r."paidAmount"
      GROUP BY c."id", c."name"
      ORDER BY "outstanding" DESC, c."name" ASC, c."id" ASC
      LIMIT ${limit}
    `;
  },

  /**
   * Due date and settlement date of every receivable, the only inputs the risk score needs.
   * The settlement date is computed in SQL exactly like `riskScore.ts` does: the date of the
   * payment that brings the running total to the receivable amount; when the balance says
   * "paid" but the payment history is incomplete, the latest payment date (or the due date).
   */
  riskOutcomes() {
    const tenantId = requireTenantId();
    return prisma.$queryRaw<Array<{ customerId: string; dueDate: Date; settledOn: Date | null }>>`
      WITH running AS (
        SELECT p."receivableId", p."date", r."totalAmount",
               SUM(p."amount") OVER (
                 -- Byte-order collation: same grouping, much cheaper sort than the locale's.
                 PARTITION BY p."receivableId" COLLATE "C" ORDER BY p."date", p."id" COLLATE "C"
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS "cumulative"
        FROM "payments" p
        JOIN "receivables" r ON r."id" = p."receivableId"
        WHERE r."tenantId" = ${tenantId}
      ),
      per_receivable AS (
        SELECT "receivableId",
               MIN("date") FILTER (WHERE "cumulative" >= "totalAmount" - 0.005) AS "settledOn",
               MAX("date") AS "lastPayment"
        FROM running
        GROUP BY "receivableId"
      )
      SELECT r."customerId" AS "customerId", r."dueDate" AS "dueDate",
             COALESCE(
               pr."settledOn",
               CASE WHEN r."paidAmount" >= r."totalAmount" - 0.005
                    THEN COALESCE(pr."lastPayment", r."dueDate") END
             ) AS "settledOn"
      FROM "receivables" r
      LEFT JOIN per_receivable pr ON pr."receivableId" = r."id"
      WHERE r."tenantId" = ${tenantId}
    `;
  },
};

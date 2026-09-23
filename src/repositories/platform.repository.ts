import { Prisma, type TenantPlan, type TenantStatus } from '@prisma/client';
import { basePrisma } from '../lib/prisma';
import { tenantUserSelect } from './user.repository';

/**
 * Cross-tenant queries for the platform backoffice. Deliberately uses the unscoped client:
 * these reads span every tenant and never run inside a tenant context.
 */

export interface TenantFilters {
  search?: string;
  plan?: TenantPlan;
  status?: TenantStatus;
}

export type TenantOrderField = 'name' | 'createdAt' | 'users' | 'customers';

const tenantCountSelect = {
  _count: { select: { users: true, customers: true, receivables: true } },
} as const;

function buildWhere(filters: TenantFilters): Prisma.TenantWhereInput {
  const where: Prisma.TenantWhereInput = {};
  if (filters.plan) where.plan = filters.plan;
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { users: { some: { email: { contains: filters.search, mode: 'insensitive' } } } },
    ];
  }
  return where;
}

function buildOrderBy(
  field: TenantOrderField,
  dir: Prisma.SortOrder,
): Prisma.TenantOrderByWithRelationInput[] {
  const primary: Prisma.TenantOrderByWithRelationInput =
    field === 'users' || field === 'customers' ? { [field]: { _count: dir } } : { [field]: dir };
  // Stable secondary order so pagination never repeats or skips rows.
  return [primary, { createdAt: 'desc' }, { id: 'asc' }];
}

const tenantIdFilter = (tenantIds?: string[]) => (tenantIds ? { tenantId: { in: tenantIds } } : {});

export const platformRepository = {
  /** Tenants with user/customer/receivable counts. Omit `pagination` to fetch every match. */
  findTenants(
    filters: TenantFilters,
    orderBy: { field: TenantOrderField; dir: Prisma.SortOrder },
    pagination?: { page: number; pageSize: number },
  ) {
    const where = buildWhere(filters);
    return basePrisma.$transaction([
      basePrisma.tenant.findMany({
        where,
        include: tenantCountSelect,
        orderBy: buildOrderBy(orderBy.field, orderBy.dir),
        ...(pagination && {
          skip: (pagination.page - 1) * pagination.pageSize,
          take: pagination.pageSize,
        }),
      }),
      basePrisma.tenant.count({ where }),
    ]);
  },

  findTenantById(id: string) {
    return basePrisma.tenant.findUnique({
      where: { id },
      include: {
        ...tenantCountSelect,
        users: { select: tenantUserSelect, orderBy: { createdAt: 'asc' } },
      },
    });
  },

  tenantExists(id: string) {
    return basePrisma.tenant.count({ where: { id } }).then((count) => count > 0);
  },

  updateTenant(id: string, data: { plan?: TenantPlan; status?: TenantStatus }) {
    return basePrisma.tenant.update({ where: { id }, data });
  },

  /** Receivable totals of unpaid receivables grouped by tenant and status. */
  openBalances(tenantIds?: string[]) {
    return basePrisma.receivable.groupBy({
      by: ['tenantId', 'status'],
      where: { status: { not: 'paid' }, ...tenantIdFilter(tenantIds) },
      _sum: { totalAmount: true, paidAmount: true },
    });
  },

  /** Creation date of the most recent receivable per tenant. */
  latestReceivables(tenantIds?: string[]) {
    return basePrisma.receivable.groupBy({
      by: ['tenantId'],
      where: tenantIdFilter(tenantIds),
      _max: { createdAt: true },
    });
  },

  /**
   * Per tenant: date of the latest payment and the sum of payments dated within [from, to].
   * Payments have no `tenantId` column, so they are grouped through their receivable.
   */
  async paymentStats(from: Date, to: Date, tenantIds?: string[]) {
    if (tenantIds?.length === 0) return [];
    const filter = tenantIds
      ? Prisma.sql`WHERE r."tenantId" IN (${Prisma.join(tenantIds)})`
      : Prisma.empty;
    return basePrisma.$queryRaw<
      Array<{ tenantId: string; lastPaymentDate: Date | null; collected: Prisma.Decimal | null }>
    >`
      SELECT r."tenantId" AS "tenantId",
             MAX(p."date") AS "lastPaymentDate",
             SUM(p."amount") FILTER (WHERE p."date" BETWEEN ${from} AND ${to}) AS "collected"
      FROM "payments" p
      JOIN "receivables" r ON r."id" = p."receivableId"
      ${filter}
      GROUP BY r."tenantId"
    `;
  },

  /** Amounts and dates of payments (all tenants) dated within [from, to]. */
  paymentsBetween(from: Date, to: Date) {
    return basePrisma.payment.findMany({
      where: { date: { gte: from, lte: to } },
      select: { amount: true, date: true },
    });
  },

  tenantCountsByStatus() {
    return basePrisma.tenant.groupBy({ by: ['status'], _count: { _all: true } });
  },

  tenantCountsByPlan() {
    return basePrisma.tenant.groupBy({ by: ['plan'], _count: { _all: true } });
  },

  /** Creation timestamps of tenants created on or after `from`. */
  tenantSignupsSince(from: Date) {
    return basePrisma.tenant.findMany({
      where: { createdAt: { gte: from } },
      select: { createdAt: true },
    });
  },

  /** Names and customer counts of every tenant (used to rank tenants by balance). */
  tenantSummaries() {
    return basePrisma.tenant.findMany({
      select: { id: true, name: true, _count: { select: { customers: true } } },
    });
  },

  countUsers() {
    return basePrisma.user.count();
  },

  countCustomers() {
    return basePrisma.customer.count();
  },

  countReceivables() {
    return basePrisma.receivable.count();
  },
};

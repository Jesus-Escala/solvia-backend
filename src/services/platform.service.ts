import type { Tenant } from '@prisma/client';
import { env } from '../config/env';
import {
  RECENT_COLLECTION_DAYS,
  lastActivityAt,
  monthlyAmounts,
  monthlyCounts,
  planBreakdown,
  sortBy,
  tenantBalances,
  topTenantsByOutstanding,
} from '../domain/platform';
import { AppError } from '../errors/AppError';
import { addDays, addMonths, startOfMonth, todayInTimezone } from '../lib/dates';
import { roundMoney, toNumber } from '../lib/money';
import { platformRepository } from '../repositories/platform.repository';
import { paginate } from '../validators/common.schemas';
import type { ListTenantsQuery, UpdateTenantInput } from '../validators/platform.schemas';

const SIGNUP_MONTHS = 12;
const COLLECTION_MONTHS = 6;
const TOP_TENANTS = 5;

type TenantWithCounts = Tenant & {
  _count: { users: number; customers: number; receivables: number };
};

function tenantNotFound() {
  return new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
}

/** Balances, latest receivable and payment activity of the given tenants. */
async function activityStats(tenantIds: string[], today: Date) {
  const recentFrom = addDays(today, -(RECENT_COLLECTION_DAYS - 1));
  const [balances, latestReceivables, payments] = await Promise.all([
    platformRepository.openBalances(tenantIds),
    platformRepository.latestReceivables(tenantIds),
    platformRepository.paymentStats(recentFrom, today, tenantIds),
  ]);
  return {
    balances: tenantBalances(
      balances.map((row) => ({
        tenantId: row.tenantId,
        status: row.status,
        totalAmount: toNumber(row._sum.totalAmount),
        paidAmount: toNumber(row._sum.paidAmount),
      })),
    ),
    latestReceivables: new Map(latestReceivables.map((row) => [row.tenantId, row._max.createdAt])),
    payments: new Map(payments.map((row) => [row.tenantId, row])),
  };
}

type ActivityStats = Awaited<ReturnType<typeof activityStats>>;

function toTenantRow(tenant: TenantWithCounts, stats: ActivityStats) {
  const payment = stats.payments.get(tenant.id);
  return {
    id: tenant.id,
    name: tenant.name,
    industry: tenant.industry,
    plan: tenant.plan,
    status: tenant.status,
    createdAt: tenant.createdAt.toISOString(),
    users: tenant._count.users,
    customers: tenant._count.customers,
    receivables: tenant._count.receivables,
    outstanding: stats.balances.get(tenant.id)?.outstanding ?? 0,
    collectedLast30Days: roundMoney(toNumber(payment?.collected)),
    lastActivityAt: lastActivityAt(tenant.createdAt, [
      payment?.lastPaymentDate,
      stats.latestReceivables.get(tenant.id),
    ]).toISOString(),
  };
}

/** Cross-tenant metrics and tenant management for the platform backoffice. */
export const platformService = {
  async overview() {
    const today = todayInTimezone(env.APP_TIMEZONE);
    const signupStart = addMonths(startOfMonth(today), -(SIGNUP_MONTHS - 1));
    const collectionStart = addMonths(startOfMonth(today), -(COLLECTION_MONTHS - 1));
    const recentFrom = addDays(today, -(RECENT_COLLECTION_DAYS - 1));

    const [byStatus, byPlan, users, customers, receivables, balances, signups, payments, tenants] =
      await Promise.all([
        platformRepository.tenantCountsByStatus(),
        platformRepository.tenantCountsByPlan(),
        platformRepository.countUsers(),
        platformRepository.countCustomers(),
        platformRepository.countReceivables(),
        platformRepository.openBalances(),
        // One extra day so sign-ups late on the last day (UTC) before the window are bucketed
        // by their local date below.
        platformRepository.tenantSignupsSince(addDays(signupStart, -1)),
        platformRepository.paymentsBetween(collectionStart, today),
        platformRepository.tenantSummaries(),
      ]);

    const countByStatus = (status: 'active' | 'suspended') =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    const balanceByTenant = tenantBalances(
      balances.map((row) => ({
        tenantId: row.tenantId,
        status: row.status,
        totalAmount: toNumber(row._sum.totalAmount),
        paidAmount: toNumber(row._sum.paidAmount),
      })),
    );
    const outstanding = roundMoney(
      [...balanceByTenant.values()].reduce((sum, balance) => sum + balance.outstanding, 0),
    );

    const paymentPoints = payments.map((payment) => ({
      date: payment.date,
      amount: toNumber(payment.amount),
    }));
    const collectedLast30Days = roundMoney(
      paymentPoints
        .filter((payment) => payment.date.getTime() >= recentFrom.getTime())
        .reduce((sum, payment) => sum + payment.amount, 0),
    );

    const signupSeries = monthlyCounts(
      signups.map((tenant) => todayInTimezone(env.APP_TIMEZONE, tenant.createdAt)),
      today,
      SIGNUP_MONTHS,
    );

    return {
      totals: {
        tenants: byStatus.reduce((sum, row) => sum + row._count._all, 0),
        activeTenants: countByStatus('active'),
        suspendedTenants: countByStatus('suspended'),
        users,
        customers,
        receivables,
        outstanding,
        collectedLast30Days,
        newTenantsThisMonth: signupSeries.at(-1)?.count ?? 0,
      },
      tenantsByPlan: planBreakdown(
        byPlan.map((row) => ({ plan: row.plan, count: row._count._all })),
      ),
      signups: signupSeries,
      collections: monthlyAmounts(paymentPoints, today, COLLECTION_MONTHS),
      topTenants: topTenantsByOutstanding(
        tenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          outstanding: balanceByTenant.get(tenant.id)?.outstanding ?? 0,
          customers: tenant._count.customers,
        })),
        TOP_TENANTS,
      ),
      generatedAt: new Date().toISOString(),
    };
  },

  async listTenants(query: ListTenantsQuery) {
    const today = todayInTimezone(env.APP_TIMEZONE);
    // The outstanding balance is computed, so sorting by it needs every match.
    const inMemory = query.sortBy === 'outstanding';
    const [tenants, total] = await platformRepository.findTenants(
      { search: query.search, plan: query.plan, status: query.status },
      {
        field: query.sortBy === 'outstanding' ? 'createdAt' : query.sortBy,
        dir: inMemory ? 'desc' : query.sortDir,
      },
      inMemory ? undefined : query,
    );

    const stats = await activityStats(
      tenants.map((tenant) => tenant.id),
      today,
    );
    const rows = tenants.map((tenant) => toTenantRow(tenant, stats));
    if (!inMemory) {
      return paginate(rows, total, query);
    }

    const sorted = sortBy(rows, (row) => row.outstanding, query.sortDir);
    const start = (query.page - 1) * query.pageSize;
    return paginate(sorted.slice(start, start + query.pageSize), sorted.length, query);
  },

  async getTenant(id: string) {
    const tenant = await platformRepository.findTenantById(id);
    if (!tenant) throw tenantNotFound();

    const stats = await activityStats([id], todayInTimezone(env.APP_TIMEZONE));
    return {
      ...toTenantRow(tenant, stats),
      overdue: stats.balances.get(id)?.overdue ?? 0,
      users: tenant.users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        hasGoogle: user.googleId !== null,
      })),
    };
  },

  async updateTenant(id: string, input: UpdateTenantInput) {
    if (!(await platformRepository.tenantExists(id))) throw tenantNotFound();
    await platformRepository.updateTenant(id, input);
    return this.getTenant(id);
  },
};

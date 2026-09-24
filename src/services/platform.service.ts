import type { Tenant } from '@prisma/client';
import { env } from '../config/env';
import {
  bucketSeries,
  moneyMetric,
  sumWithin,
  type AnalyticsPeriod,
  type DateRange,
} from '../domain/analytics';
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
import { addDays, addMonths, formatDateOnly, startOfMonth, todayInTimezone } from '../lib/dates';
import { roundMoney, toNumber } from '../lib/money';
import { runWithTenant } from '../lib/tenantContext';
import { platformRepository, type TenantOrderField } from '../repositories/platform.repository';
import { tenantRepository } from '../repositories/tenant.repository';
import { userRepository } from '../repositories/user.repository';
import { paginate } from '../validators/common.schemas';
import type {
  CreateTenantInput,
  ListTenantsQuery,
  UpdateTenantInput,
} from '../validators/platform.schemas';
import type { CreateTeamUserInput, UpdateTeamUserInput } from '../validators/user.schemas';
import { accessRequestService } from './accessRequest.service';
import { toTenantUserDto } from './dto';
import { emailTaken, newTemporaryPassword, userManagementService } from './userManagement.service';

const SIGNUP_MONTHS = 12;
const COLLECTION_MONTHS = 6;
const TOP_TENANTS = 5;

type TenantWithCounts = Tenant & {
  _count: { users: number; customers: number; receivables: number };
};

function tenantNotFound() {
  return new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
}

async function assertTenantExists(id: string) {
  if (!(await platformRepository.tenantExists(id))) throw tenantNotFound();
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

/** Collected amount, payments and new tenants of `period` (and the previous one), all tenants. */
async function periodStats(period: AnalyticsPeriod) {
  const { previous } = period;
  const [paymentRows, tenantRows] = await Promise.all([
    platformRepository.paymentsByDay(previous.from, period.to),
    platformRepository.tenantsCreatedByDay(previous.from, period.to, env.APP_TIMEZONE),
  ]);
  const payments = paymentRows.map((row) => ({
    day: row.date,
    amount: toNumber(row._sum.amount),
    count: row._count._all,
  }));
  const newTenants = tenantRows.map((row) => ({ day: row.day, count: row.count }));
  const current: DateRange = { from: period.from, to: period.to };

  return {
    period: {
      from: formatDateOnly(period.from),
      to: formatDateOnly(period.to),
      granularity: period.granularity,
      previous: { from: formatDateOnly(previous.from), to: formatDateOnly(previous.to) },
    },
    periodTotals: {
      collected: moneyMetric(
        sumWithin(payments, current, 'amount'),
        sumWithin(payments, previous, 'amount'),
      ),
      newTenants: {
        value: sumWithin(newTenants, current, 'count'),
        previous: sumWithin(newTenants, previous, 'count'),
      },
      payments: {
        value: sumWithin(payments, current, 'count'),
        previous: sumWithin(payments, previous, 'count'),
      },
    },
    periodSeries: bucketSeries(
      period,
      ['collected', 'newTenants'],
      [
        ...payments.map((row) => ({ day: row.day, collected: row.amount })),
        ...newTenants.map((row) => ({ day: row.day, newTenants: row.count })),
      ],
    ),
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
    modules: tenant.modules,
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
  /**
   * Platform-wide dashboard. With a `period`, it also returns the collected amount, payments and
   * new tenants of that period vs the previous one, and their series per bucket.
   */
  async overview(period: AnalyticsPeriod | null = null) {
    const today = todayInTimezone(env.APP_TIMEZONE);
    const signupStart = addMonths(startOfMonth(today), -(SIGNUP_MONTHS - 1));
    const collectionStart = addMonths(startOfMonth(today), -(COLLECTION_MONTHS - 1));
    const recentFrom = addDays(today, -(RECENT_COLLECTION_DAYS - 1));

    const [
      byStatus,
      byPlan,
      users,
      customers,
      receivables,
      balances,
      signups,
      payments,
      tenants,
      pendingAccessRequests,
      periodData,
      modules,
    ] = await Promise.all([
      platformRepository.tenantCountsByStatus(),
      platformRepository.tenantCountsByPlan(),
      platformRepository.countUsers(),
      platformRepository.countCustomers(),
      platformRepository.countReceivables(),
      platformRepository.openBalances(),
      // One extra day so sign-ups late on the last day (UTC) before the window are bucketed
      // by their local date below.
      platformRepository.tenantSignupsSince(addDays(signupStart, -1)),
      platformRepository.paymentsByDay(collectionStart, today),
      platformRepository.tenantSummaries(),
      accessRequestService.countPending(),
      period ? periodStats(period) : null,
      platformRepository.activeModuleCounts(),
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

    const paymentPoints = payments.map((row) => ({
      date: row.date,
      amount: toNumber(row._sum.amount),
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
        pendingAccessRequests,
      },
      modules,
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
      ...periodData,
      generatedAt: new Date().toISOString(),
    };
  },

  async listTenants(query: ListTenantsQuery) {
    const today = todayInTimezone(env.APP_TIMEZONE);
    // Balances and activity are computed, so sorting by them needs every match.
    const inMemory = ['outstanding', 'collected', 'lastActivity'].includes(query.sortBy);
    const [tenants, total] = await platformRepository.findTenants(
      { search: query.search, plan: query.plan, status: query.status, module: query.module },
      {
        field: inMemory ? 'createdAt' : (query.sortBy as TenantOrderField),
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

    const sorted = sortBy(
      rows,
      (row) =>
        query.sortBy === 'collected'
          ? row.collectedLast30Days
          : query.sortBy === 'lastActivity'
            ? row.lastActivityAt
              ? Date.parse(row.lastActivityAt)
              : 0
            : row.outstanding,
      query.sortDir,
    );
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
      users: tenant.users.map(toTenantUserDto),
    };
  },

  async updateTenant(id: string, input: UpdateTenantInput) {
    await assertTenantExists(id);
    await platformRepository.updateTenant(id, input);
    return this.getTenant(id);
  },

  /**
   * Managed onboarding: creates a business with the same defaults as self-service sign-up
   * (message templates, reminder rules) and its first admin with a temporary password. When it
   * comes from an access request, that request is marked as converted.
   */
  async createTenant(input: CreateTenantInput) {
    if (await userRepository.emailExists(input.admin.email)) throw emailTaken();
    if (input.accessRequestId) {
      await accessRequestService.assertConvertible(input.accessRequestId);
    }

    const { temporaryPassword, passwordHash } = await newTemporaryPassword();
    const { tenant } = await tenantRepository.createWithAdmin({
      tenant: {
        name: input.name,
        industry: input.industry ?? null,
        plan: input.plan,
        modules: input.modules,
      },
      admin: {
        name: input.admin.name,
        email: input.admin.email,
        passwordHash,
        mustChangePassword: true,
      },
      accessRequestId: input.accessRequestId,
    });
    return { tenant: await this.getTenant(tenant.id), temporaryPassword };
  },

  async createTenantUser(tenantId: string, input: CreateTeamUserInput) {
    await assertTenantExists(tenantId);
    return runWithTenant(tenantId, () => userManagementService.create(input));
  },

  /** Platform admins are not tenant users, so only the last-admin rule applies. */
  async updateTenantUser(tenantId: string, userId: string, input: UpdateTeamUserInput) {
    await assertTenantExists(tenantId);
    return runWithTenant(tenantId, () => userManagementService.update(null, userId, input));
  },

  async resetTenantUserPassword(tenantId: string, userId: string) {
    await assertTenantExists(tenantId);
    return runWithTenant(tenantId, () => userManagementService.resetPassword(null, userId));
  },
};

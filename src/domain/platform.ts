import type { ReceivableStatus, TenantPlan } from '@prisma/client';
import { roundMoney } from '../lib/money';
import { outstandingAmount } from './receivableStatus';
import { monthlySeries } from './portfolio';

/**
 * Pure aggregation helpers for the platform backoffice (cross-tenant metrics).
 * Services fetch raw rows through `basePrisma` and shape them here.
 */

export const TENANT_PLANS: TenantPlan[] = ['free', 'starter', 'pro'];

/** Days covered by "collected in the last 30 days", today included. */
export const RECENT_COLLECTION_DAYS = 30;

export interface PeriodCount {
  period: string;
  count: number;
}

export interface PeriodAmount {
  period: string;
  amount: number;
}

/** Number of dates per calendar month for the `months` months ending with the month of `today`. */
export function monthlyCounts(dates: Date[], today: Date, months: number): PeriodCount[] {
  return monthlySeries(
    dates.map((date) => ({ date, amount: 0 })),
    today,
    months,
  ).map(({ period, count }) => ({ period, count }));
}

/** Money totals per calendar month for the `months` months ending with the month of `today`. */
export function monthlyAmounts(
  items: Array<{ date: Date; amount: number }>,
  today: Date,
  months: number,
): PeriodAmount[] {
  return monthlySeries(items, today, months).map(({ period, amount }) => ({ period, amount }));
}

/** Tenant count for every plan (plans without tenants are reported with 0), in plan order. */
export function planBreakdown(
  rows: Array<{ plan: TenantPlan; count: number }>,
): Array<{ plan: TenantPlan; count: number }> {
  return TENANT_PLANS.map((plan) => ({
    plan,
    count: rows.filter((row) => row.plan === plan).reduce((sum, row) => sum + row.count, 0),
  }));
}

/** Latest of the tenant creation date and its most recent receivable/payment dates. */
export function lastActivityAt(createdAt: Date, activity: Array<Date | null | undefined>): Date {
  return activity.reduce<Date>(
    (latest, date) => (date && date.getTime() > latest.getTime() ? date : latest),
    createdAt,
  );
}

export interface TenantBalance {
  outstanding: number;
  overdue: number;
}

/**
 * Open balances per tenant from receivable totals grouped by tenant and status. Uses the same
 * definition as the tenant dashboard: total minus paid of every receivable that is not paid.
 */
export function tenantBalances(
  rows: Array<{
    tenantId: string;
    status: ReceivableStatus;
    totalAmount: number;
    paidAmount: number;
  }>,
): Map<string, TenantBalance> {
  const balances = new Map<string, TenantBalance>();
  for (const row of rows) {
    if (row.status === 'paid') continue;
    const balance = balances.get(row.tenantId) ?? { outstanding: 0, overdue: 0 };
    const open = outstandingAmount(row);
    balance.outstanding += open;
    if (row.status === 'overdue') balance.overdue += open;
    balances.set(row.tenantId, balance);
  }
  for (const balance of balances.values()) {
    balance.outstanding = roundMoney(balance.outstanding);
    balance.overdue = roundMoney(balance.overdue);
  }
  return balances;
}

/** Stable sort by a numeric or string key (ties keep their original order). */
export function sortBy<T>(rows: T[], key: (row: T) => number | string, dir: 'asc' | 'desc'): T[] {
  const direction = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = key(a);
    const right = key(b);
    return (left < right ? -1 : left > right ? 1 : 0) * direction;
  });
}

export interface TopTenant {
  id: string;
  name: string;
  outstanding: number;
  customers: number;
}

/** Tenants with the largest open balance (tenants with nothing outstanding are left out). */
export function topTenantsByOutstanding(rows: TopTenant[], limit: number): TopTenant[] {
  return sortBy(
    rows.filter((row) => row.outstanding > 0),
    (row) => row.outstanding,
    'desc',
  ).slice(0, limit);
}

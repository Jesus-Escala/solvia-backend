import { addMonths, diffInDays, formatPeriod, startOfMonth } from '../lib/dates';
import { roundMoney } from '../lib/money';

export type AgingBucketKey = 'current' | 'days1to30' | 'days31to60' | 'days61to90' | 'days90plus';

export interface AgingBucket {
  key: AgingBucketKey;
  amount: number;
  count: number;
}

export const AGING_BUCKETS: AgingBucketKey[] = [
  'current',
  'days1to30',
  'days31to60',
  'days61to90',
  'days90plus',
];

function agingKey(daysOverdue: number): AgingBucketKey {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'days1to30';
  if (daysOverdue <= 60) return 'days31to60';
  if (daysOverdue <= 90) return 'days61to90';
  return 'days90plus';
}

/** Classic receivables aging: outstanding balance grouped by days past the due date. */
export function agingBuckets(
  items: Array<{ dueDate: Date; outstanding: number }>,
  today: Date,
): AgingBucket[] {
  const buckets = new Map<AgingBucketKey, AgingBucket>(
    AGING_BUCKETS.map((key) => [key, { key, amount: 0, count: 0 }]),
  );
  for (const item of items) {
    if (item.outstanding <= 0) continue;
    const bucket = buckets.get(agingKey(diffInDays(today, item.dueDate)))!;
    bucket.amount += item.outstanding;
    bucket.count += 1;
  }
  return AGING_BUCKETS.map((key) => {
    const bucket = buckets.get(key)!;
    return { ...bucket, amount: roundMoney(bucket.amount) };
  });
}

export interface MonthlyPoint {
  period: string;
  amount: number;
  count: number;
}

/** Totals per calendar month for the `months` months ending with the month of `today` (oldest first). */
export function monthlySeries(
  items: Array<{ date: Date; amount: number }>,
  today: Date,
  months: number,
): MonthlyPoint[] {
  const firstMonth = addMonths(startOfMonth(today), -(months - 1));
  const points = new Map<string, MonthlyPoint>();
  for (let index = 0; index < months; index += 1) {
    const period = formatPeriod(addMonths(firstMonth, index));
    points.set(period, { period, amount: 0, count: 0 });
  }
  for (const item of items) {
    const point = points.get(formatPeriod(item.date));
    if (!point) continue;
    point.amount += item.amount;
    point.count += 1;
  }
  return [...points.values()].map((point) => ({ ...point, amount: roundMoney(point.amount) }));
}

export interface DebtorTotal {
  customerId: string;
  name: string;
  outstanding: number;
  overdue: number;
  receivables: number;
}

/** Customers ranked by outstanding balance (largest first). */
export function topDebtors(
  items: Array<{ customerId: string; name: string; outstanding: number; isOverdue: boolean }>,
  limit: number,
): DebtorTotal[] {
  const totals = new Map<string, DebtorTotal>();
  for (const item of items) {
    if (item.outstanding <= 0) continue;
    const entry = totals.get(item.customerId) ?? {
      customerId: item.customerId,
      name: item.name,
      outstanding: 0,
      overdue: 0,
      receivables: 0,
    };
    entry.outstanding += item.outstanding;
    if (item.isOverdue) entry.overdue += item.outstanding;
    entry.receivables += 1;
    totals.set(item.customerId, entry);
  }
  return [...totals.values()]
    .map((entry) => ({
      ...entry,
      outstanding: roundMoney(entry.outstanding),
      overdue: roundMoney(entry.overdue),
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, limit);
}

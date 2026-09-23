import {
  addDays,
  addMonths,
  formatDateOnly,
  formatPeriod,
  startOfIsoWeek,
  startOfMonth,
} from '../lib/dates';
import { roundMoney } from '../lib/money';

export type CashFlowGrouping = 'week' | 'month';

export interface CashFlowItem {
  dueDate: Date;
  outstanding: number;
  /** Receivables this item stands for (default 1), e.g. balances pre-aggregated per due date. */
  count?: number;
}

export interface CashFlowBucket {
  key: string;
  label: string;
  start: string;
  end: string;
  amount: number;
  count: number;
}

export interface CashFlowProjection {
  groupBy: CashFlowGrouping;
  /** Outstanding amount already past due. */
  overdue: { amount: number; count: number };
  buckets: CashFlowBucket[];
  /** Outstanding amount due after the last bucket. */
  later: { amount: number; count: number };
  totalOutstanding: number;
}

const monthLabel = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  year: 'numeric',
});
const dayLabel = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});

function buildBuckets(groupBy: CashFlowGrouping, today: Date, periods: number) {
  const buckets: Array<CashFlowBucket & { startDate: Date; endDate: Date }> = [];
  for (let index = 0; index < periods; index += 1) {
    const startDate =
      groupBy === 'week'
        ? addDays(startOfIsoWeek(today), index * 7)
        : addMonths(startOfMonth(today), index);
    const nextStart = groupBy === 'week' ? addDays(startDate, 7) : addMonths(startDate, 1);
    const endDate = addDays(nextStart, -1);
    buckets.push({
      key: groupBy === 'week' ? formatDateOnly(startDate) : formatPeriod(startDate),
      label:
        groupBy === 'week' ? `Week of ${dayLabel.format(startDate)}` : monthLabel.format(startDate),
      start: formatDateOnly(startDate),
      end: formatDateOnly(endDate),
      amount: 0,
      count: 0,
      startDate,
      endDate,
    });
  }
  return buckets;
}

/**
 * Groups outstanding receivables by the week or month of their due date, starting with the
 * current period. Past-due amounts are reported separately as `overdue`.
 */
export function projectCashFlow(
  items: CashFlowItem[],
  groupBy: CashFlowGrouping,
  today: Date,
  periods: number,
): CashFlowProjection {
  const buckets = buildBuckets(groupBy, today, periods);
  const overdue = { amount: 0, count: 0 };
  const later = { amount: 0, count: 0 };
  let totalOutstanding = 0;

  for (const item of items) {
    if (item.outstanding <= 0) continue;
    const count = item.count ?? 1;
    totalOutstanding += item.outstanding;

    if (item.dueDate.getTime() < today.getTime()) {
      overdue.amount += item.outstanding;
      overdue.count += count;
      continue;
    }

    const bucket = buckets.find(
      (candidate) =>
        item.dueDate.getTime() >= candidate.startDate.getTime() &&
        item.dueDate.getTime() <= candidate.endDate.getTime(),
    );
    if (bucket) {
      bucket.amount += item.outstanding;
      bucket.count += count;
    } else {
      later.amount += item.outstanding;
      later.count += count;
    }
  }

  return {
    groupBy,
    overdue: { amount: roundMoney(overdue.amount), count: overdue.count },
    buckets: buckets.map(({ startDate: _startDate, endDate: _endDate, ...bucket }) => ({
      ...bucket,
      amount: roundMoney(bucket.amount),
    })),
    later: { amount: roundMoney(later.amount), count: later.count },
    totalOutstanding: roundMoney(totalOutstanding),
  };
}

import {
  addDays,
  diffInDays,
  formatDateOnly,
  startOfIsoWeek,
  startOfMonth,
  toDateOnly,
} from '../lib/dates';
import { roundMoney } from '../lib/money';

/**
 * Pure helpers for period-based analytics (business dashboard and platform overview).
 * Repositories aggregate rows per calendar day in SQL; these functions pick the requested
 * period, split current vs previous period and group days into zero-filled buckets.
 */

export type Granularity = 'day' | 'week' | 'month';

export const GRANULARITIES: Granularity[] = ['day', 'week', 'month'];

/** Longest range accepted: `to` may be at most this many calendar years after `from`. */
export const MAX_RANGE_YEARS = 3;

/** Auto granularity thresholds (inclusive day counts). */
export const AUTO_GRANULARITY = { day: 31, week: 120 } as const;

export interface DateRange {
  from: Date;
  to: Date;
}

export interface AnalyticsPeriod extends DateRange {
  granularity: Granularity;
  previous: DateRange;
}

export interface Metric {
  value: number | null;
  previous: number | null;
}

/** Calendar days in the inclusive range [from, to]. */
export function dayCount({ from, to }: DateRange): number {
  return diffInDays(to, from) + 1;
}

/** Latest `to` accepted for a range starting on `from`. */
export function maxRangeEnd(from: Date): Date {
  const start = toDateOnly(from);
  return new Date(
    Date.UTC(start.getUTCFullYear() + MAX_RANGE_YEARS, start.getUTCMonth(), start.getUTCDate()),
  );
}

/** Returns an English error message when the range is invalid, or null when it is fine. */
export function periodRangeError({ from, to }: DateRange): string | null {
  if (from.getTime() > to.getTime()) return '"from" must be on or before "to"';
  if (to.getTime() > maxRangeEnd(from).getTime()) {
    return `The range cannot be longer than ${MAX_RANGE_YEARS} years`;
  }
  return null;
}

/** day for up to 31 days, week (ISO) for up to 120 days, month beyond that. */
export function autoGranularity(range: DateRange): Granularity {
  const days = dayCount(range);
  if (days <= AUTO_GRANULARITY.day) return 'day';
  if (days <= AUTO_GRANULARITY.week) return 'week';
  return 'month';
}

/** The same number of days immediately before `from`. */
export function previousPeriod(range: DateRange): DateRange {
  const days = dayCount(range);
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

/**
 * Fills the defaults of a period request: `to` defaults to today and `from` to the first day of
 * the month of `to` (so no parameters means month-to-date), granularity to `autoGranularity`.
 */
export function resolvePeriod(
  input: { from?: Date; to?: Date; granularity?: Granularity },
  today: Date,
): AnalyticsPeriod {
  const to = input.to ?? today;
  const from = input.from ?? startOfMonth(to);
  const range = { from, to };
  return {
    from,
    to,
    granularity: input.granularity ?? autoGranularity(range),
    previous: previousPeriod(range),
  };
}

/** Start of the bucket containing `day`, clipped so the first bucket starts on `from`. */
export function bucketStart(day: Date, granularity: Granularity, from: Date): Date {
  const date = toDateOnly(day);
  const start =
    granularity === 'day'
      ? date
      : granularity === 'week'
        ? startOfIsoWeek(date)
        : startOfMonth(date);
  return start.getTime() < from.getTime() ? toDateOnly(from) : start;
}

/** Start dates (YYYY-MM-DD) of every bucket inside [from, to], oldest first. */
export function bucketKeys({ from, to }: DateRange, granularity: Granularity): string[] {
  const keys: string[] = [];
  let cursor = bucketStart(from, granularity, from);
  while (cursor.getTime() <= to.getTime()) {
    keys.push(formatDateOnly(cursor));
    const next =
      granularity === 'day'
        ? addDays(cursor, 1)
        : granularity === 'week'
          ? addDays(startOfIsoWeek(cursor), 7)
          : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    cursor = next;
  }
  return keys;
}

export function isWithin(day: Date, { from, to }: DateRange): boolean {
  return day.getTime() >= from.getTime() && day.getTime() <= to.getTime();
}

/** A row aggregated for one calendar day. */
export type DailyRow<K extends string> = { day: Date } & Record<K, number>;

/** Sums `field` over the rows whose day falls within `range`. */
export function sumWithin<K extends string>(
  rows: Array<DailyRow<K>>,
  range: DateRange,
  field: K,
): number {
  return rows.reduce((sum, row) => (isWithin(row.day, range) ? sum + row[field] : sum), 0);
}

/**
 * Groups daily points into the zero-filled buckets of the period (oldest first). Points outside
 * [from, to] are ignored; missing fields count as 0. Every field is rounded to 2 decimals.
 */
export function bucketSeries<K extends string>(
  period: DateRange & { granularity: Granularity },
  fields: K[],
  points: Array<{ day: Date } & Partial<Record<K, number>>>,
): Array<{ bucket: string } & Record<K, number>> {
  const buckets = new Map<string, Record<K, number>>();
  for (const key of bucketKeys(period, period.granularity)) {
    buckets.set(key, Object.fromEntries(fields.map((field) => [field, 0])) as Record<K, number>);
  }
  for (const point of points) {
    if (!isWithin(point.day, period)) continue;
    const bucket = buckets.get(
      formatDateOnly(bucketStart(point.day, period.granularity, period.from)),
    );
    if (!bucket) continue;
    for (const field of fields) {
      bucket[field] += (point as Partial<Record<K, number>>)[field] ?? 0;
    }
  }
  return [...buckets.entries()].map(([bucket, values]) => {
    const rounded = Object.fromEntries(
      fields.map((field) => [field, roundMoney(values[field])]),
    ) as Record<K, number>;
    return { bucket, ...rounded };
  });
}

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** ISO weekday of a date-only value: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(day: Date): IsoWeekday {
  const weekday = toDateOnly(day).getUTCDay(); // 0 = Sunday
  return (weekday === 0 ? 7 : weekday) as IsoWeekday;
}

/** Amount and count per ISO weekday (all 7, Monday first) for the days within `range`. */
export function weekdayTotals(
  rows: Array<DailyRow<'amount' | 'count'>>,
  range: DateRange,
): Array<{ weekday: IsoWeekday; amount: number; count: number }> {
  const totals = ([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).map((weekday) => ({
    weekday,
    amount: 0,
    count: 0,
  }));
  for (const row of rows) {
    if (!isWithin(row.day, range)) continue;
    const entry = totals[isoWeekday(row.day) - 1]!;
    entry.amount += row.amount;
    entry.count += row.count;
  }
  return totals.map((entry) => ({ ...entry, amount: roundMoney(entry.amount) }));
}

/** Outstanding amount and number of open receivables whose due date falls within `range`. */
export function openBalanceWithin(
  rows: Array<{ dueDate: Date; outstanding: number; count: number }>,
  range: DateRange,
): { amount: number; count: number } {
  let amount = 0;
  let count = 0;
  for (const row of rows) {
    if (!isWithin(row.dueDate, range)) continue;
    amount += row.outstanding;
    count += row.count;
  }
  return { amount: roundMoney(amount), count };
}

/** `numerator / denominator`, or null when the denominator is 0. */
export function ratio(numerator: number, denominator: number, decimals = 4): number | null {
  if (denominator === 0) return null;
  const factor = 10 ** decimals;
  return Math.round((numerator / denominator + Number.EPSILON) * factor) / factor;
}

/** Builds a metric from the current and previous period values, rounding money to 2 decimals. */
export function moneyMetric(value: number, previous: number): Metric {
  return { value: roundMoney(value), previous: roundMoney(previous) };
}

/** Every value of `all`, with the totals found in `rows` (0 otherwise), sorted by amount desc. */
export function completeBreakdown<T extends string>(
  all: readonly T[],
  rows: Array<{ key: T; amount: number; count: number }>,
): Array<{ key: T; amount: number; count: number }> {
  return all
    .map((key) => {
      const row = rows.find((candidate) => candidate.key === key);
      return { key, amount: roundMoney(row?.amount ?? 0), count: row?.count ?? 0 };
    })
    .sort((a, b) => b.amount - a.amount);
}

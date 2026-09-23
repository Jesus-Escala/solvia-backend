import { describe, expect, it } from 'vitest';
import {
  autoGranularity,
  bucketKeys,
  bucketSeries,
  bucketStart,
  completeBreakdown,
  dayCount,
  isoWeekday,
  openBalanceWithin,
  periodRangeError,
  previousPeriod,
  ratio,
  resolvePeriod,
  sumWithin,
  weekdayTotals,
} from '../src/domain/analytics';
import { projectCashFlow } from '../src/domain/cashFlow';
import { agingBuckets } from '../src/domain/portfolio';
import { calculateRiskScore, riskScoreFromOutcomes } from '../src/domain/riskScore';
import { addDays, formatDateOnly, toDateOnly } from '../src/lib/dates';
import {
  analyticsQuerySchema,
  optionalPeriodQuerySchema,
} from '../src/validators/analytics.schemas';

const d = toDateOnly;
const today = d('2026-09-23'); // Wednesday
const range = (from: string, to: string) => ({ from: d(from), to: d(to) });

describe('period resolution', () => {
  it('counts calendar days inclusively', () => {
    expect(dayCount(range('2026-09-01', '2026-09-01'))).toBe(1);
    expect(dayCount(range('2026-09-01', '2026-09-30'))).toBe(30);
  });

  it('picks day up to 31 days, week up to 120 days and month beyond', () => {
    expect(autoGranularity(range('2026-01-01', '2026-01-31'))).toBe('day'); // 31
    expect(autoGranularity(range('2026-01-01', '2026-02-01'))).toBe('week'); // 32
    expect(autoGranularity({ from: d('2026-01-01'), to: addDays(d('2026-01-01'), 119) })).toBe(
      'week',
    ); // 120
    expect(autoGranularity({ from: d('2026-01-01'), to: addDays(d('2026-01-01'), 120) })).toBe(
      'month',
    ); // 121
  });

  it('computes the previous period as the same number of days right before `from`', () => {
    const previous = previousPeriod(range('2026-09-01', '2026-09-30'));
    expect(formatDateOnly(previous.from)).toBe('2026-08-02');
    expect(formatDateOnly(previous.to)).toBe('2026-08-31');
    const single = previousPeriod(range('2026-03-01', '2026-03-01'));
    expect([formatDateOnly(single.from), formatDateOnly(single.to)]).toEqual([
      '2026-02-28',
      '2026-02-28',
    ]);
  });

  it('defaults to the month to date', () => {
    const period = resolvePeriod({}, today);
    expect(formatDateOnly(period.from)).toBe('2026-09-01');
    expect(formatDateOnly(period.to)).toBe('2026-09-23');
    expect(period.granularity).toBe('day');
    expect(formatDateOnly(period.previous.from)).toBe('2026-08-09');
    expect(formatDateOnly(period.previous.to)).toBe('2026-08-31');
  });

  it('defaults `from` to the first day of the month of `to` and keeps an explicit granularity', () => {
    const period = resolvePeriod({ to: d('2026-06-15'), granularity: 'week' }, today);
    expect(formatDateOnly(period.from)).toBe('2026-06-01');
    expect(period.granularity).toBe('week');
  });

  it('rejects from after to and ranges over 3 years', () => {
    expect(periodRangeError(range('2026-09-02', '2026-09-01'))).toMatch(/on or before/);
    expect(periodRangeError(range('2023-09-23', '2026-09-23'))).toBeNull(); // exactly 3 years
    expect(periodRangeError(range('2023-09-22', '2026-09-23'))).toMatch(/3 years/);
  });
});

describe('analytics query schema', () => {
  it('parses dates and resolves defaults', () => {
    const period = analyticsQuerySchema(today).parse({ from: '2025-10-01', to: '2026-09-23' });
    expect(period.granularity).toBe('month');
    expect(formatDateOnly(period.previous.to)).toBe('2025-09-30');
  });

  it('fails validation for invalid ranges and granularities', () => {
    expect(
      analyticsQuerySchema(today).safeParse({ from: '2026-09-10', to: '2026-09-01' }).success,
    ).toBe(false);
    expect(analyticsQuerySchema(today).safeParse({ from: '2020-01-01' }).success).toBe(false);
    expect(analyticsQuerySchema(today).safeParse({ granularity: 'year' }).success).toBe(false);
    expect(analyticsQuerySchema(today).safeParse({ from: '2026-13-01' }).success).toBe(false);
  });

  it('returns null for the admin overview when no period parameter is given', () => {
    expect(optionalPeriodQuerySchema(today).parse({})).toBeNull();
    expect(optionalPeriodQuerySchema(today).parse({ granularity: 'week' })?.granularity).toBe(
      'week',
    );
  });
});

describe('buckets', () => {
  it('clips the first bucket to `from`', () => {
    expect(formatDateOnly(bucketStart(d('2026-09-23'), 'week', d('2026-09-01')))).toBe(
      '2026-09-21',
    );
    expect(formatDateOnly(bucketStart(d('2026-09-02'), 'week', d('2026-09-01')))).toBe(
      '2026-09-01', // Monday Aug 31 is before `from`
    );
    expect(formatDateOnly(bucketStart(d('2026-09-20'), 'month', d('2026-09-15')))).toBe(
      '2026-09-15',
    );
  });

  it('lists daily, ISO weekly and monthly bucket starts inside the range', () => {
    expect(bucketKeys(range('2026-09-28', '2026-10-01'), 'day')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ]);
    expect(bucketKeys(range('2026-09-02', '2026-09-23'), 'week')).toEqual([
      '2026-09-02',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
    ]);
    expect(bucketKeys(range('2025-11-15', '2026-02-01'), 'month')).toEqual([
      '2025-11-15',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
    ]);
  });

  it('zero-fills empty buckets, sums each field and ignores days outside the range', () => {
    const series = bucketSeries(
      { ...range('2026-09-02', '2026-09-20'), granularity: 'week' },
      ['collected', 'payments', 'issued'],
      [
        { day: d('2026-09-01'), collected: 999, payments: 9 }, // before `from`
        { day: d('2026-09-02'), collected: 10.1, payments: 1 },
        { day: d('2026-09-06'), collected: 0.2, payments: 1 }, // Sunday: same first bucket
        { day: d('2026-09-15'), issued: 50 },
        { day: d('2026-09-21'), collected: 999 }, // after `to`
      ],
    );
    expect(series).toEqual([
      { bucket: '2026-09-02', collected: 10.3, payments: 2, issued: 0 },
      { bucket: '2026-09-07', collected: 0, payments: 0, issued: 0 },
      { bucket: '2026-09-14', collected: 0, payments: 0, issued: 50 },
    ]);
  });
});

describe('breakdowns', () => {
  it('maps dates to ISO weekdays (1 = Monday, 7 = Sunday)', () => {
    expect(isoWeekday(d('2026-09-21'))).toBe(1);
    expect(isoWeekday(d('2026-09-23'))).toBe(3);
    expect(isoWeekday(d('2026-09-26'))).toBe(6);
    expect(isoWeekday(d('2026-09-27'))).toBe(7);
  });

  it('returns all 7 weekdays with totals inside the range', () => {
    const totals = weekdayTotals(
      [
        { day: d('2026-09-21'), amount: 100, count: 2 },
        { day: d('2026-09-28'), amount: 50.55, count: 1 },
        { day: d('2026-09-27'), amount: 10, count: 1 },
        { day: d('2026-08-01'), amount: 999, count: 9 }, // outside
      ],
      range('2026-09-01', '2026-09-30'),
    );
    expect(totals).toHaveLength(7);
    expect(totals[0]).toEqual({ weekday: 1, amount: 150.55, count: 3 });
    expect(totals[6]).toEqual({ weekday: 7, amount: 10, count: 1 });
    expect(totals.slice(1, 6).every((entry) => entry.amount === 0 && entry.count === 0)).toBe(true);
  });

  it('sums a field within a range', () => {
    const rows = [
      { day: d('2026-09-01'), amount: 1 },
      { day: d('2026-09-30'), amount: 2 },
      { day: d('2026-10-01'), amount: 4 },
    ];
    expect(sumWithin(rows, range('2026-09-01', '2026-09-30'), 'amount')).toBe(3);
  });

  it('lists every key, fills missing ones with 0 and sorts by amount', () => {
    expect(
      completeBreakdown(['yape', 'plin', 'cash'] as const, [
        { key: 'plin', amount: 20.005, count: 1 },
        { key: 'cash', amount: 30, count: 2 },
      ]),
    ).toEqual([
      { key: 'cash', amount: 30, count: 2 },
      { key: 'plin', amount: 20.01, count: 1 },
      { key: 'yape', amount: 0, count: 0 },
    ]);
  });

  it('returns null ratios when the denominator is 0', () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(2, 3)).toBe(0.6667);
    expect(ratio(2, 3, 2)).toBe(0.67);
  });

  it('sums open balances by due date range', () => {
    const rows = [
      { dueDate: d('2026-09-23'), outstanding: 10, count: 1 },
      { dueDate: d('2026-10-10'), outstanding: 20.5, count: 2 },
      { dueDate: d('2026-08-01'), outstanding: 5, count: 1 },
    ];
    expect(openBalanceWithin(rows, { from: today, to: today })).toEqual({ amount: 10, count: 1 });
    expect(openBalanceWithin(rows, { from: today, to: addDays(today, 30) })).toEqual({
      amount: 30.5,
      count: 3,
    });
  });
});

describe('pre-aggregated inputs', () => {
  it('aging and cash flow count items with a `count` as several receivables', () => {
    const items = [
      { dueDate: addDays(today, -40), outstanding: 300, count: 3 },
      { dueDate: addDays(today, 2), outstanding: 100 },
    ];
    const aging = agingBuckets(items, today);
    expect(aging.find((bucket) => bucket.key === 'days31to60')).toEqual({
      key: 'days31to60',
      amount: 300,
      count: 3,
    });
    const cashFlow = projectCashFlow(items, 'week', today, 2);
    expect(cashFlow.overdue).toEqual({ amount: 300, count: 3 });
    expect(cashFlow.buckets[0]?.count).toBe(1);
  });

  it('scores risk from settlement dates exactly like from the payment history', () => {
    const receivables = [
      // Paid on time in two installments.
      {
        totalAmount: 100,
        paidAmount: 100,
        dueDate: addDays(today, -60),
        payments: [
          { amount: 40, date: addDays(today, -70) },
          { amount: 60, date: addDays(today, -61) },
        ],
      },
      // Paid 20 days late.
      {
        totalAmount: 50,
        paidAmount: 50,
        dueDate: addDays(today, -40),
        payments: [{ amount: 50, date: addDays(today, -20) }],
      },
      // Unpaid and 10 days overdue.
      { totalAmount: 80, paidAmount: 10, dueDate: addDays(today, -10), payments: [] },
      // Not due yet.
      { totalAmount: 80, paidAmount: 0, dueDate: addDays(today, 5), payments: [] },
    ];
    const outcomes = [
      { dueDate: addDays(today, -60), settledOn: addDays(today, -61) },
      { dueDate: addDays(today, -40), settledOn: addDays(today, -20) },
      { dueDate: addDays(today, -10), settledOn: null },
      { dueDate: addDays(today, 5), settledOn: null },
    ];
    expect(riskScoreFromOutcomes(outcomes, today)).toEqual(calculateRiskScore(receivables, today));
  });
});

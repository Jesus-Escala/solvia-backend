import { describe, expect, it } from 'vitest';
import {
  lastActivityAt,
  monthlyAmounts,
  monthlyCounts,
  planBreakdown,
  sortBy,
  tenantBalances,
  topTenantsByOutstanding,
} from '../src/domain/platform';
import { toDateOnly } from '../src/lib/dates';

const today = toDateOnly('2026-09-23');

describe('monthlyCounts', () => {
  it('returns every month of the window, oldest first, zero-filled', () => {
    const series = monthlyCounts(
      [
        toDateOnly('2026-09-01'),
        toDateOnly('2026-09-22'),
        toDateOnly('2026-07-31'),
        toDateOnly('2025-01-10'), // outside the window
      ],
      today,
      4,
    );
    expect(series).toEqual([
      { period: '2026-06', count: 0 },
      { period: '2026-07', count: 1 },
      { period: '2026-08', count: 0 },
      { period: '2026-09', count: 2 },
    ]);
  });

  it('spans a year boundary for a 12-month window', () => {
    const series = monthlyCounts([], today, 12);
    expect(series).toHaveLength(12);
    expect(series[0]).toEqual({ period: '2025-10', count: 0 });
    expect(series[11]).toEqual({ period: '2026-09', count: 0 });
  });
});

describe('monthlyAmounts', () => {
  it('sums amounts per month without floating point artifacts', () => {
    expect(
      monthlyAmounts(
        [
          { date: toDateOnly('2026-09-02'), amount: 0.1 },
          { date: toDateOnly('2026-09-03'), amount: 0.2 },
          { date: toDateOnly('2026-08-15'), amount: 50 },
        ],
        today,
        3,
      ),
    ).toEqual([
      { period: '2026-07', amount: 0 },
      { period: '2026-08', amount: 50 },
      { period: '2026-09', amount: 0.3 },
    ]);
  });
});

describe('planBreakdown', () => {
  it('always reports every plan in plan order', () => {
    expect(planBreakdown([{ plan: 'pro', count: 2 }])).toEqual([
      { plan: 'free', count: 0 },
      { plan: 'starter', count: 0 },
      { plan: 'pro', count: 2 },
    ]);
  });
});

describe('lastActivityAt', () => {
  const createdAt = new Date('2026-01-10T12:00:00Z');

  it('falls back to the creation date when there is no activity', () => {
    expect(lastActivityAt(createdAt, [null, undefined])).toEqual(createdAt);
  });

  it('picks the most recent activity date', () => {
    const payment = new Date('2026-09-20T00:00:00Z');
    const receivable = new Date('2026-09-01T15:30:00Z');
    expect(lastActivityAt(createdAt, [payment, receivable])).toEqual(payment);
    expect(lastActivityAt(createdAt, [new Date('2025-12-31T00:00:00Z')])).toEqual(createdAt);
  });
});

describe('tenantBalances', () => {
  it('sums open balances per tenant, separating the overdue part and ignoring paid rows', () => {
    const balances = tenantBalances([
      { tenantId: 'a', status: 'pending', totalAmount: 100, paidAmount: 0 },
      { tenantId: 'a', status: 'partial', totalAmount: 200.1, paidAmount: 50 },
      { tenantId: 'a', status: 'overdue', totalAmount: 80, paidAmount: 30 },
      { tenantId: 'a', status: 'paid', totalAmount: 500, paidAmount: 500 },
      { tenantId: 'b', status: 'overdue', totalAmount: 40, paidAmount: 0 },
    ]);
    expect(balances.get('a')).toEqual({ outstanding: 300.1, overdue: 50 });
    expect(balances.get('b')).toEqual({ outstanding: 40, overdue: 40 });
    expect(balances.has('c')).toBe(false);
  });
});

describe('sortBy', () => {
  it('sorts in both directions and keeps ties in their original order', () => {
    const rows = [
      { id: 1, value: 5 },
      { id: 2, value: 1 },
      { id: 3, value: 5 },
    ];
    expect(sortBy(rows, (row) => row.value, 'asc').map((row) => row.id)).toEqual([2, 1, 3]);
    expect(sortBy(rows, (row) => row.value, 'desc').map((row) => row.id)).toEqual([1, 3, 2]);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3]); // input untouched
  });
});

describe('topTenantsByOutstanding', () => {
  it('ranks tenants by open balance and leaves out tenants with nothing outstanding', () => {
    const ranking = topTenantsByOutstanding(
      [
        { id: 'a', name: 'A', outstanding: 10, customers: 1 },
        { id: 'b', name: 'B', outstanding: 0, customers: 4 },
        { id: 'c', name: 'C', outstanding: 300, customers: 2 },
        { id: 'd', name: 'D', outstanding: 50, customers: 3 },
      ],
      2,
    );
    expect(ranking.map((row) => row.id)).toEqual(['c', 'd']);
  });
});

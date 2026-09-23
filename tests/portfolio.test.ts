import { describe, expect, it } from 'vitest';
import { agingBuckets, monthlySeries, topDebtors } from '../src/domain/portfolio';
import { addDays, toDateOnly } from '../src/lib/dates';

const today = toDateOnly('2026-09-23');

describe('agingBuckets', () => {
  it('groups outstanding balances by days past due', () => {
    const buckets = agingBuckets(
      [
        { dueDate: addDays(today, 5), outstanding: 100 }, // current
        { dueDate: today, outstanding: 50 }, // current (due today)
        { dueDate: addDays(today, -1), outstanding: 10 }, // 1-30
        { dueDate: addDays(today, -30), outstanding: 20 }, // 1-30
        { dueDate: addDays(today, -31), outstanding: 30 }, // 31-60
        { dueDate: addDays(today, -90), outstanding: 40 }, // 61-90
        { dueDate: addDays(today, -91), outstanding: 60 }, // 90+
        { dueDate: addDays(today, -200), outstanding: 0 }, // paid, ignored
      ],
      today,
    );
    expect(buckets).toEqual([
      { key: 'current', amount: 150, count: 2 },
      { key: 'days1to30', amount: 30, count: 2 },
      { key: 'days31to60', amount: 30, count: 1 },
      { key: 'days61to90', amount: 40, count: 1 },
      { key: 'days90plus', amount: 60, count: 1 },
    ]);
  });
});

describe('monthlySeries', () => {
  it('returns one point per month, oldest first, including empty months', () => {
    const series = monthlySeries(
      [
        { date: toDateOnly('2026-09-02'), amount: 100.1 },
        { date: toDateOnly('2026-09-20'), amount: 0.2 },
        { date: toDateOnly('2026-07-15'), amount: 50 },
        { date: toDateOnly('2026-03-01'), amount: 999 }, // outside the window
      ],
      today,
      3,
    );
    expect(series).toEqual([
      { period: '2026-07', amount: 50, count: 1 },
      { period: '2026-08', amount: 0, count: 0 },
      { period: '2026-09', amount: 100.3, count: 2 },
    ]);
  });
});

describe('topDebtors', () => {
  it('ranks customers by outstanding balance and separates the overdue part', () => {
    const ranking = topDebtors(
      [
        { customerId: 'a', name: 'Ana', outstanding: 100, isOverdue: true },
        { customerId: 'a', name: 'Ana', outstanding: 50, isOverdue: false },
        { customerId: 'b', name: 'Beto', outstanding: 300, isOverdue: false },
        { customerId: 'c', name: 'Carla', outstanding: 20, isOverdue: true },
        { customerId: 'd', name: 'Dani', outstanding: 0, isOverdue: true },
      ],
      2,
    );
    expect(ranking).toEqual([
      { customerId: 'b', name: 'Beto', outstanding: 300, overdue: 0, receivables: 1 },
      { customerId: 'a', name: 'Ana', outstanding: 150, overdue: 100, receivables: 2 },
    ]);
  });
});

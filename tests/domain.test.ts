import { describe, expect, it } from 'vitest';
import { projectCashFlow } from '../src/domain/cashFlow';
import { deriveReceivableStatus, outstandingAmount } from '../src/domain/receivableStatus';
import { renderTemplate } from '../src/domain/template';
import { addDays, isLastDayOfMonth, todayInTimezone, toDateOnly } from '../src/lib/dates';

const today = toDateOnly('2026-09-23'); // Wednesday

describe('deriveReceivableStatus', () => {
  const dueDate = addDays(today, 5);

  it('derives pending, partial and paid from the balance', () => {
    expect(deriveReceivableStatus({ totalAmount: 100, paidAmount: 0, dueDate }, today)).toBe(
      'pending',
    );
    expect(deriveReceivableStatus({ totalAmount: 100, paidAmount: 30, dueDate }, today)).toBe(
      'partial',
    );
    expect(deriveReceivableStatus({ totalAmount: 100, paidAmount: 100, dueDate }, today)).toBe(
      'paid',
    );
  });

  it('marks unpaid receivables past their due date as overdue, even if partially paid', () => {
    const pastDue = addDays(today, -1);
    expect(
      deriveReceivableStatus({ totalAmount: 100, paidAmount: 30, dueDate: pastDue }, today),
    ).toBe('overdue');
    expect(
      deriveReceivableStatus({ totalAmount: 100, paidAmount: 100, dueDate: pastDue }, today),
    ).toBe('paid');
  });

  it('computes the outstanding amount without floating point noise', () => {
    expect(outstandingAmount({ totalAmount: 0.3, paidAmount: 0.1 })).toBe(0.2);
    expect(outstandingAmount({ totalAmount: 100, paidAmount: 120 })).toBe(0);
  });
});

describe('renderTemplate', () => {
  it('replaces placeholders and keeps unknown ones visible', () => {
    expect(
      renderTemplate('Hi {{name}}, you owe {{ amount }} by {{date}}. {{unknown}}', {
        name: 'Maria',
        amount: 'PEN 100.00',
        date: 'Sep 30, 2026',
      }),
    ).toBe('Hi Maria, you owe PEN 100.00 by Sep 30, 2026. {{unknown}}');
  });
});

describe('projectCashFlow', () => {
  it('groups outstanding amounts by ISO week and separates overdue and later amounts', () => {
    const projection = projectCashFlow(
      [
        { dueDate: addDays(today, -3), outstanding: 50 }, // overdue
        { dueDate: today, outstanding: 100 }, // current week
        { dueDate: addDays(today, 4), outstanding: 25 }, // Sunday, still current week
        { dueDate: addDays(today, 5), outstanding: 75 }, // next Monday
        { dueDate: addDays(today, 60), outstanding: 10 }, // beyond horizon
        { dueDate: addDays(today, 1), outstanding: 0 }, // fully paid, ignored
      ],
      'week',
      today,
      2,
    );
    expect(projection.overdue).toEqual({ amount: 50, count: 1 });
    expect(projection.buckets.map((bucket) => [bucket.start, bucket.amount])).toEqual([
      ['2026-09-21', 125],
      ['2026-09-28', 75],
    ]);
    expect(projection.later).toEqual({ amount: 10, count: 1 });
    expect(projection.totalOutstanding).toBe(260);
  });

  it('groups by month', () => {
    const projection = projectCashFlow(
      [
        { dueDate: toDateOnly('2026-09-30'), outstanding: 100 },
        { dueDate: toDateOnly('2026-10-15'), outstanding: 40 },
      ],
      'month',
      today,
      3,
    );
    expect(projection.buckets.map((bucket) => [bucket.key, bucket.amount])).toEqual([
      ['2026-09', 100],
      ['2026-10', 40],
      ['2026-11', 0],
    ]);
  });
});

describe('date helpers', () => {
  it('resolves "today" in the configured timezone', () => {
    // 03:00 UTC on Sep 24 is still Sep 23 in Lima (UTC-5).
    expect(todayInTimezone('America/Lima', new Date('2026-09-24T03:00:00Z'))).toEqual(today);
  });

  it('detects the last day of the month', () => {
    expect(isLastDayOfMonth(toDateOnly('2026-09-30'))).toBe(true);
    expect(isLastDayOfMonth(toDateOnly('2026-02-28'))).toBe(true);
    expect(isLastDayOfMonth(toDateOnly('2028-02-28'))).toBe(false);
    expect(isLastDayOfMonth(today)).toBe(false);
  });
});

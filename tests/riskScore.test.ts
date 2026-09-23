import { describe, expect, it } from 'vitest';
import { calculateRiskScore, type RiskReceivableInput } from '../src/domain/riskScore';
import { addDays, toDateOnly } from '../src/lib/dates';

const today = toDateOnly('2026-09-23');

function receivable(
  dueIn: number,
  totalAmount: number,
  payments: Array<{ amount: number; paidIn: number }> = [],
): RiskReceivableInput {
  return {
    totalAmount,
    paidAmount: payments.reduce((sum, payment) => sum + payment.amount, 0),
    dueDate: addDays(today, dueIn),
    payments: payments.map((payment) => ({
      amount: payment.amount,
      date: addDays(today, payment.paidIn),
    })),
  };
}

describe('calculateRiskScore', () => {
  it('returns low risk with no history', () => {
    const score = calculateRiskScore([], today);
    expect(score.level).toBe('low');
    expect(score.points).toBe(0);
    expect(score.metrics.onTimeRate).toBeNull();
    expect(score.metrics.evaluatedReceivables).toBe(0);
  });

  it('ignores receivables that are not due yet and unpaid', () => {
    const score = calculateRiskScore([receivable(10, 100), receivable(30, 200)], today);
    expect(score.metrics.evaluatedReceivables).toBe(0);
    expect(score.level).toBe('low');
  });

  it('rates a customer who always pays on time as low risk', () => {
    const score = calculateRiskScore(
      [
        receivable(-60, 100, [{ amount: 100, paidIn: -61 }]),
        receivable(-30, 100, [{ amount: 100, paidIn: -30 }]),
        receivable(-5, 100, [
          { amount: 40, paidIn: -20 },
          { amount: 60, paidIn: -6 },
        ]),
      ],
      today,
    );
    expect(score.metrics.onTimeRate).toBe(1);
    expect(score.metrics.averageDaysOverdue).toBe(0);
    expect(score.metrics.currentOverdueCount).toBe(0);
    expect(score.level).toBe('low');
  });

  it('uses the date of the payment that completed the balance to measure lateness', () => {
    // First installment on time, final installment 12 days late.
    const score = calculateRiskScore(
      [
        receivable(-40, 100, [
          { amount: 50, paidIn: -45 },
          { amount: 50, paidIn: -28 },
        ]),
      ],
      today,
    );
    expect(score.metrics.onTimeRate).toBe(0);
    expect(score.metrics.averageDaysOverdue).toBe(12);
  });

  it('rates a customer with one slightly late unpaid receivable as medium risk', () => {
    const score = calculateRiskScore(
      [
        receivable(-30, 100, [{ amount: 100, paidIn: -31 }]),
        receivable(-20, 100, [{ amount: 100, paidIn: -20 }]),
        receivable(-2, 100),
      ],
      today,
    );
    // on-time rate 2/3 (+1), avg 0.67 days (+0), 1 overdue (+1)
    expect(score.metrics.currentOverdueCount).toBe(1);
    expect(score.points).toBe(2);
    expect(score.level).toBe('medium');
  });

  it('rates a chronic defaulter as high risk', () => {
    const score = calculateRiskScore(
      [
        receivable(-90, 100, [{ amount: 100, paidIn: -50 }]),
        receivable(-45, 100),
        receivable(-21, 100, [{ amount: 20, paidIn: -18 }]),
        receivable(-9, 100),
      ],
      today,
    );
    expect(score.metrics.onTimeRate).toBe(0);
    expect(score.metrics.currentOverdueCount).toBe(3);
    // Days late: 40 (paid), 45, 21 and 9 (unpaid) -> average 28.75
    expect(score.metrics.averageDaysOverdue).toBe(28.75);
    // on-time rate 0% (+2), average > 7 days (+1), 3 overdue (+2)
    expect(score.points).toBe(5);
    expect(score.level).toBe('high');
  });

  it('treats a receivable paid per balance but without payment records as settled', () => {
    const score = calculateRiskScore(
      [{ totalAmount: 100, paidAmount: 100, dueDate: addDays(today, -10), payments: [] }],
      today,
    );
    expect(score.metrics.currentOverdueCount).toBe(0);
    expect(score.metrics.onTimeRate).toBe(1);
  });
});

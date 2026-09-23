import { diffInDays } from '../lib/dates';
import { roundMoney } from '../lib/money';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskPaymentInput {
  amount: number;
  date: Date;
}

export interface RiskReceivableInput {
  totalAmount: number;
  paidAmount: number;
  dueDate: Date;
  payments: RiskPaymentInput[];
}

export interface RiskMetrics {
  /** Receivables that are either fully paid or already past their due date. */
  evaluatedReceivables: number;
  /** Share (0..1) of evaluated receivables paid in full on or before the due date. */
  onTimeRate: number | null;
  /** Average days paid late (settled) or currently late (unsettled) across evaluated receivables. */
  averageDaysOverdue: number;
  /** Unpaid receivables past their due date right now. */
  currentOverdueCount: number;
}

export interface RiskScore {
  level: RiskLevel;
  /** 0 (best) to 6 (worst). */
  points: number;
  metrics: RiskMetrics;
}

export const RISK_THRESHOLDS = {
  onTimeRate: { high: 0.5, medium: 0.8 },
  averageDaysOverdue: { high: 30, medium: 7 },
  currentOverdueCount: { high: 3, medium: 1 },
  level: { high: 4, medium: 2 },
} as const;

const EPSILON = 0.005;

/** Date on which the cumulative payments covered the total amount, or null if still unpaid. */
function settlementDate(receivable: RiskReceivableInput): Date | null {
  const payments = [...receivable.payments].sort((a, b) => a.date.getTime() - b.date.getTime());
  let cumulative = 0;
  for (const payment of payments) {
    cumulative = roundMoney(cumulative + payment.amount);
    if (cumulative >= receivable.totalAmount - EPSILON) {
      return payment.date;
    }
  }
  if (receivable.paidAmount >= receivable.totalAmount - EPSILON) {
    // Paid according to the balance but payment history is incomplete: use the last known date.
    return payments.at(-1)?.date ?? receivable.dueDate;
  }
  return null;
}

/**
 * Computes a customer's risk score from their receivable history. Three signals each add 0-2 points:
 * - on-time payment rate (below 80% = 1, below 50% = 2)
 * - average days overdue (over 7 = 1, over 30 = 2)
 * - currently overdue receivables (1+ = 1, 3+ = 2)
 * Total points: 0-1 = low, 2-3 = medium, 4-6 = high. Customers without history are low risk.
 */
export function calculateRiskScore(receivables: RiskReceivableInput[], today: Date): RiskScore {
  let evaluated = 0;
  let paidOnTime = 0;
  let totalDaysLate = 0;
  let currentOverdueCount = 0;

  for (const receivable of receivables) {
    const settledOn = settlementDate(receivable);
    const isPastDue = receivable.dueDate.getTime() < today.getTime();

    if (!settledOn && !isPastDue) {
      continue; // Not due yet: says nothing about payment behavior.
    }

    evaluated += 1;
    if (settledOn) {
      const daysLate = Math.max(0, diffInDays(settledOn, receivable.dueDate));
      totalDaysLate += daysLate;
      if (daysLate === 0) paidOnTime += 1;
    } else {
      totalDaysLate += diffInDays(today, receivable.dueDate);
      currentOverdueCount += 1;
    }
  }

  const onTimeRate = evaluated > 0 ? paidOnTime / evaluated : null;
  const averageDaysOverdue = evaluated > 0 ? roundMoney(totalDaysLate / evaluated) : 0;

  let points = 0;
  if (onTimeRate !== null) {
    if (onTimeRate < RISK_THRESHOLDS.onTimeRate.high) points += 2;
    else if (onTimeRate < RISK_THRESHOLDS.onTimeRate.medium) points += 1;
  }
  if (averageDaysOverdue > RISK_THRESHOLDS.averageDaysOverdue.high) points += 2;
  else if (averageDaysOverdue > RISK_THRESHOLDS.averageDaysOverdue.medium) points += 1;
  if (currentOverdueCount >= RISK_THRESHOLDS.currentOverdueCount.high) points += 2;
  else if (currentOverdueCount >= RISK_THRESHOLDS.currentOverdueCount.medium) points += 1;

  const level: RiskLevel =
    points >= RISK_THRESHOLDS.level.high
      ? 'high'
      : points >= RISK_THRESHOLDS.level.medium
        ? 'medium'
        : 'low';

  return {
    level,
    points,
    metrics: {
      evaluatedReceivables: evaluated,
      onTimeRate: onTimeRate === null ? null : roundMoney(onTimeRate),
      averageDaysOverdue,
      currentOverdueCount,
    },
  };
}

import type { Prisma } from '@prisma/client';
import { calculateRiskScore, type RiskScore } from '../domain/riskScore';
import { env } from '../config/env';
import { todayInTimezone } from '../lib/dates';
import { toNumber } from '../lib/money';

type ReceivableHistory = {
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  dueDate: Date;
  payments: Array<{ amount: Prisma.Decimal; date: Date }>;
};

/** Adapts persisted receivables to the pure risk score function. */
export function riskScoreFor(
  receivables: ReceivableHistory[],
  today = todayInTimezone(env.APP_TIMEZONE),
): RiskScore {
  return calculateRiskScore(
    receivables.map((receivable) => ({
      totalAmount: toNumber(receivable.totalAmount),
      paidAmount: toNumber(receivable.paidAmount),
      dueDate: receivable.dueDate,
      payments: receivable.payments.map((payment) => ({
        amount: toNumber(payment.amount),
        date: payment.date,
      })),
    })),
    today,
  );
}

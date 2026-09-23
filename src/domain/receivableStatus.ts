import type { ReceivableStatus } from '@prisma/client';
import { roundMoney } from '../lib/money';

export interface ReceivableBalance {
  totalAmount: number;
  paidAmount: number;
  dueDate: Date;
}

/** Tolerance used when comparing money amounts (half a cent). */
const EPSILON = 0.005;

export function outstandingAmount({
  totalAmount,
  paidAmount,
}: Omit<ReceivableBalance, 'dueDate'>): number {
  return Math.max(0, roundMoney(totalAmount - paidAmount));
}

/**
 * Derives a receivable status from its balance and due date.
 * `overdue` takes precedence over `partial` once the due date has passed.
 */
export function deriveReceivableStatus(
  receivable: ReceivableBalance,
  today: Date,
): ReceivableStatus {
  if (receivable.paidAmount >= receivable.totalAmount - EPSILON) {
    return 'paid';
  }
  if (receivable.dueDate.getTime() < today.getTime()) {
    return 'overdue';
  }
  return receivable.paidAmount > EPSILON ? 'partial' : 'pending';
}

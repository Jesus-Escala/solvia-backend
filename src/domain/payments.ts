import type { PaymentMethod } from '@prisma/client';

/** Part of a payment made with one method (e.g. S/ 30 in cash of a S/ 50 sale). */
export interface PaymentPart {
  method: PaymentMethod;
  amount: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Half a cent: amounts that differ less than this are the same. */
export const PAYMENT_EPSILON = 0.005;

/**
 * The parts as they are stored: one per method (two cash parts become one), without empty ones,
 * in the order the method first appeared.
 */
export function mergeParts(parts: PaymentPart[]): PaymentPart[] {
  const byMethod = new Map<PaymentMethod, number>();
  for (const part of parts) {
    if (part.amount <= 0) continue;
    byMethod.set(part.method, round2((byMethod.get(part.method) ?? 0) + part.amount));
  }
  return [...byMethod].map(([method, amount]) => ({ method, amount }));
}

export function sumParts(parts: PaymentPart[]): number {
  return round2(parts.reduce((sum, part) => sum + part.amount, 0));
}

/** Whether the parts add up to `total` (to the cent). */
export function partsMatch(parts: PaymentPart[], total: number): boolean {
  return Math.abs(sumParts(parts) - total) < PAYMENT_EPSILON;
}

/**
 * The method that brought the most money (the first one on a tie), kept on the sale for filters
 * and old clients that read a single method. Null without parts.
 */
export function mainMethod(parts: PaymentPart[]): PaymentMethod | null {
  let best: PaymentPart | null = null;
  for (const part of parts) if (best === null || part.amount > best.amount) best = part;
  return best?.method ?? null;
}

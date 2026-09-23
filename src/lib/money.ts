import type { Prisma } from '@prisma/client';

type Numeric = Prisma.Decimal | number | string | null | undefined;

/** Converts Prisma Decimal values into plain numbers for JSON responses and calculations. */
export function toNumber(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

/** Rounds to 2 decimals, avoiding binary floating point artifacts. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

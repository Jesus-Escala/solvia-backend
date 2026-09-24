import type { Prisma } from '@prisma/client';
import { currentLocale, INTL_LOCALES, type Locale } from './locale';

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

/** Amount with its currency, formatted for the request language. */
export function formatMoney(
  amount: number,
  currency: string,
  locale: Locale = currentLocale(),
): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], { style: 'currency', currency }).format(
    amount,
  );
}

/**
 * Date helpers. Business dates (issue, due and payment dates) are "date only" values stored as
 * UTC midnight, so every calculation here operates on UTC calendar days.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Returns today's calendar date in `timeZone` as a UTC-midnight Date. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): Date {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return toDateOnly(localDate);
}

/** Normalizes a `YYYY-MM-DD` string, ISO string or Date into a UTC-midnight Date. */
export function toDateOnly(value: string | Date): Date {
  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    return new Date(Date.UTC(year, month - 1, day));
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Formats a date-only value as `YYYY-MM-DD`. */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Human readable date, e.g. "Sep 23, 2026". */
export function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function diffInDays(to: Date, from: Date): number {
  return Math.round((toDateOnly(to).getTime() - toDateOnly(from).getTime()) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  return new Date(toDateOnly(date).getTime() + days * MS_PER_DAY);
}

/** First day of the month `months` months after the month of `date`. */
export function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Monday of the ISO week containing `date`. */
export function startOfIsoWeek(date: Date): Date {
  const day = toDateOnly(date);
  const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -weekday);
}

export function isLastDayOfMonth(date: Date): boolean {
  return addDays(date, 1).getUTCMonth() !== toDateOnly(date).getUTCMonth();
}

/** Reporting period key, e.g. "2026-09". */
export function formatPeriod(date: Date): string {
  return formatDateOnly(date).slice(0, 7);
}

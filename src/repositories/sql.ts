import { Prisma } from '@prisma/client';
import { formatDateOnly } from '../lib/dates';

/**
 * SQL fragments shared by the raw analytics queries.
 *
 * Business dates (`date` columns) are compared as `YYYY-MM-DD` literals cast to `date`, never as
 * JS Dates: a Date parameter is sent as a timestamp and the comparison would then depend on the
 * database session time zone.
 */

const DATE_LITERAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date-only value as an inline SQL `date` literal.
 *
 * Inlined on purpose instead of a bind parameter: Prisma uses prepared statements, and after a
 * few executions PostgreSQL may switch to a generic plan that ignores how wide the date range
 * is (e.g. an index scan + nested loop over years of payments, several times slower). A literal
 * keeps a plan per range. Safe from injection: the text comes from `formatDateOnly` and is
 * checked against a strict pattern.
 */
export function sqlDate(date: Date): Prisma.Sql {
  const literal = formatDateOnly(date);
  if (!DATE_LITERAL.test(literal)) throw new Error(`Invalid date literal: ${literal}`);
  return Prisma.raw(`DATE '${literal}'`);
}

/**
 * Local calendar day (in `timeZone`) of a `timestamp` column stored in UTC (Prisma `DateTime`).
 * `column` must be a trusted identifier such as `c."createdAt"`, never user input.
 */
export function sqlLocalDay(column: string, timeZone: string): Prisma.Sql {
  return Prisma.sql`((${Prisma.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date`;
}

/**
 * `column` (UTC timestamp) falls on a local day within [from, to]. Written as a range on the raw
 * column so an index on it can be used.
 */
export function sqlLocalDayWithin(
  column: string,
  from: Date,
  to: Date,
  timeZone: string,
): Prisma.Sql {
  const col = Prisma.raw(column);
  return Prisma.sql`${col} >= ((${sqlDate(from)}::timestamp AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC')
    AND ${col} < (((${sqlDate(to)} + 1)::timestamp AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC')`;
}

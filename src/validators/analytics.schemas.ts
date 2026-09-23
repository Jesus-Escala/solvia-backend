import { z } from 'zod';
import {
  GRANULARITIES,
  periodRangeError,
  resolvePeriod,
  type AnalyticsPeriod,
} from '../domain/analytics';
import { dateOnlySchema } from './common.schemas';

/** `from` / `to` (YYYY-MM-DD, inclusive) and an optional bucket granularity. */
export const periodQueryFieldsSchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  granularity: z.enum(GRANULARITIES).optional(),
});

function resolveOrFail(
  input: z.infer<typeof periodQueryFieldsSchema>,
  today: Date,
  ctx: z.RefinementCtx,
): AnalyticsPeriod {
  const period = resolvePeriod(input, today);
  const error = periodRangeError(period);
  if (error) {
    ctx.addIssue({ code: 'custom', message: error, path: ['to'] });
    return z.NEVER;
  }
  return period;
}

/**
 * Period of `/dashboard/analytics`. Defaults: `to` = today, `from` = first day of that month,
 * granularity chosen from the range length. Rejects from > to and ranges over 3 years.
 */
export function analyticsQuerySchema(today: Date) {
  return periodQueryFieldsSchema.transform((input, ctx) => resolveOrFail(input, today, ctx));
}

/** Optional period of `/admin/overview`: null when none of the parameters is given. */
export function optionalPeriodQuerySchema(today: Date) {
  return periodQueryFieldsSchema.transform((input, ctx) =>
    input.from || input.to || input.granularity ? resolveOrFail(input, today, ctx) : null,
  );
}

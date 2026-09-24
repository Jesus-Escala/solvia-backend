import { z } from 'zod';
import { addDays, startOfMonth } from '../lib/dates';
import { dateOnlySchema } from './common.schemas';

/** A report's date range: `from` / `to` inclusive; defaults to the current month to date. */
export function reportRangeSchema(today: Date) {
  return z
    .object({ from: dateOnlySchema.optional(), to: dateOnlySchema.optional() })
    .transform((input) => ({ from: input.from ?? startOfMonth(today), to: input.to ?? today }))
    .refine((range) => range.from.getTime() <= range.to.getTime(), {
      message: '`from` must not be after `to`',
      path: ['from'],
    })
    .refine((range) => range.to.getTime() <= addDays(range.from, 366 * 3).getTime(), {
      message: 'The range cannot be longer than 3 years',
      path: ['to'],
    });
}

export type ReportRange = z.infer<ReturnType<typeof reportRangeSchema>>;

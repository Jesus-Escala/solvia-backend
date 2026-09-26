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

/** Reports that describe themselves (columns, rows, totals and headline figures). */
export const INSIGHT_REPORTS = [
  'sales-detail',
  'sales-by-day',
  'sales-by-method',
  'sales-by-category',
  'sales-by-seller',
  'purchases-detail',
  'purchases-by-supplier',
  'purchases-by-product',
] as const;
export type InsightReport = (typeof INSIGHT_REPORTS)[number];

export const REPORT_IDS = [
  'sales-by-customer',
  'sales-by-product',
  'collections-by-customer',
  'stock',
  'shortages',
  ...INSIGHT_REPORTS,
] as const;
export type ReportId = (typeof REPORT_IDS)[number];
export type ExportFormat = 'xlsx' | 'pdf';

export const exportParamsSchema = z.object({ report: z.enum(REPORT_IDS) });
export const tableParamsSchema = z.object({ report: z.enum(INSIGHT_REPORTS) });
export const exportFormatSchema = z.object({ format: z.enum(['xlsx', 'pdf']) });

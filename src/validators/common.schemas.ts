import { z } from 'zod';
import { toDateOnly } from '../lib/dates';

export const idParamSchema = z.object({
  id: z.uuid('Invalid identifier'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** `YYYY-MM-DD` string converted into a UTC-midnight Date. */
export const dateOnlySchema = z.iso
  .date('Expected a date in YYYY-MM-DD format')
  .transform((value) => toDateOnly(value));

/** Positive money amount with at most 2 decimals. Accepts numeric strings (multipart forms). */
export const moneySchema = z.coerce
  .number('Expected a number')
  .positive('Amount must be greater than zero')
  .max(9_999_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Amount must have at most 2 decimals',
  });

/** Query of a picker search box: short text and a small page, no count. */
export const lookupQuerySchema = z.object({
  search: z.string().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const sortDirSchema = z.enum(['asc', 'desc']).default('asc');

export type Pagination = z.infer<typeof paginationSchema>;
export type SortDir = z.infer<typeof sortDirSchema>;

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function paginate<T>(
  data: T[],
  total: number,
  { page, pageSize }: Pagination,
): Paginated<T> {
  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

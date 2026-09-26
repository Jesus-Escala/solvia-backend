import { z } from 'zod';
import {
  dateOnlySchema,
  moneySchema,
  paginationSchema,
  paymentPartsSchema,
  sortDirSchema,
} from './common.schemas';

export const receivableStatusSchema = z.enum(['pending', 'partial', 'paid', 'overdue']);

export const createReceivableSchema = z
  .object({
    customerId: z.uuid('Invalid customer identifier'),
    description: z.string().trim().min(2).max(255),
    totalAmount: moneySchema,
    issueDate: dateOnlySchema,
    dueDate: dateOnlySchema,
  })
  .refine((value) => value.dueDate.getTime() >= value.issueDate.getTime(), {
    message: 'Due date cannot be earlier than the issue date',
    path: ['dueDate'],
  });

export const updateReceivableSchema = z
  .object({
    description: z.string().trim().min(2).max(255),
    totalAmount: moneySchema,
    issueDate: dateOnlySchema,
    dueDate: dateOnlySchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const listReceivablesQuerySchema = paginationSchema.extend({
  /** Single status, comma-separated list (`pending,overdue`) or repeated query parameter. */
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      value === undefined
        ? undefined
        : [value]
            .flat()
            .flatMap((item) => item.split(','))
            .map((item) => item.trim())
            .filter(Boolean),
    )
    .pipe(z.array(receivableStatusSchema).optional()),
  customerId: z.uuid().optional(),
  search: z.string().trim().max(120).optional(),
  dueFrom: dateOnlySchema.optional(),
  dueTo: dateOnlySchema.optional(),
  sortBy: z
    .enum([
      'dueDate',
      'issueDate',
      'totalAmount',
      'outstanding',
      'paymentMethod',
      'description',
      'status',
      'customer',
      'createdAt',
    ])
    .default('dueDate'),
  sortDir: sortDirSchema,
});

export const paymentMethodSchema = z.enum(['yape', 'plin', 'cash', 'bank_transfer']);

/**
 * A payment with one method (`amount` + `method`), or paid with several at once (`parts`, e.g.
 * S/ 30 in cash and S/ 20 with Yape): one payment is recorded per method.
 */
export const createPaymentSchema = z
  .object({
    amount: moneySchema.optional(),
    method: paymentMethodSchema.optional(),
    parts: paymentPartsSchema.optional(),
    /** Defaults to today in the application timezone. */
    date: dateOnlySchema.optional(),
  })
  .superRefine((payment, ctx) => {
    if (payment.parts) return;
    if (payment.amount === undefined) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'How much was paid?' });
    }
    if (!payment.method) {
      ctx.addIssue({ code: 'custom', path: ['method'], message: 'How was it paid?' });
    }
  });

export type CreateReceivableInput = z.infer<typeof createReceivableSchema>;
export type UpdateReceivableInput = z.infer<typeof updateReceivableSchema>;
export type ListReceivablesQuery = z.infer<typeof listReceivablesQuerySchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

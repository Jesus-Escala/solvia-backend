import { PaymentMethod, SaleDocType } from '@prisma/client';
import { z } from 'zod';
import { dateOnlySchema, paginationSchema } from './common.schemas';

const quantitySchema = z.coerce
  .number('Expected a number')
  .positive('Quantity must be greater than zero')
  .max(99_999_999)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, {
    message: 'Quantity must have at most 3 decimals',
  });

const unitPriceSchema = z.coerce
  .number('Expected a number')
  .min(0)
  .max(9_999_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Amount must have at most 2 decimals',
  });

export const createSaleSchema = z
  .object({
    /** Optional for cash sales (walk-in customer); required for credit sales. */
    customerId: z.uuid().optional(),
    /** Defaults to today (APP_TIMEZONE). */
    date: dateOnlySchema.optional(),
    paymentType: z.enum(['cash', 'credit']),
    /** Required for cash sales. */
    method: z.enum(PaymentMethod).optional(),
    /** Required for credit sales: when the customer pays. */
    dueDate: dateOnlySchema.optional(),
    docType: z.enum(SaleDocType).default('none'),
    docNumber: z
      .string()
      .trim()
      .max(40)
      .transform((value) => (value === '' ? null : value))
      .nullish(),
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          quantity: quantitySchema,
          unitPrice: unitPriceSchema.optional(),
        }),
      )
      .min(1, 'Add at least one product')
      .max(100),
  })
  .superRefine((sale, ctx) => {
    if (sale.paymentType === 'cash' && !sale.method) {
      ctx.addIssue({ code: 'custom', path: ['method'], message: 'How was it paid?' });
    }
    if (sale.paymentType === 'credit') {
      if (!sale.customerId) {
        ctx.addIssue({ code: 'custom', path: ['customerId'], message: 'Who owes it?' });
      }
      if (!sale.dueDate) {
        ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'When will they pay?' });
      }
    }
  });

export const listSalesQuerySchema = paginationSchema.extend({
  /** Sale number or customer name. */
  search: z.string().trim().max(120).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  paymentType: z.enum(['cash', 'credit']).optional(),
  status: z.enum(['completed', 'voided']).optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;

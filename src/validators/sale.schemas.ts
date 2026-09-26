import { PaymentMethod, SaleDocType } from '@prisma/client';
import { z } from 'zod';
import {
  dateOnlySchema,
  paginationSchema,
  paymentPartsSchema,
  sortDirSchema,
} from './common.schemas';

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
    /** Cash sales paid with one method (or use `payments`). */
    method: z.enum(PaymentMethod).optional(),
    /** Cash sales paid with several methods; they must add up to the total. */
    payments: paymentPartsSchema.optional(),
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
        z
          .object({
            /** A catalog product; omit it for a free line (service, something not in the catalog). */
            productId: z.uuid().optional(),
            /** Name of a free line. */
            description: z.string().trim().min(1).max(120).optional(),
            quantity: quantitySchema,
            /** Defaults to the product price; required on a free line. */
            unitPrice: unitPriceSchema.optional(),
          })
          .superRefine((item, ctx) => {
            if (!item.productId && !item.description) {
              ctx.addIssue({ code: 'custom', path: ['description'], message: 'What was sold?' });
            }
            if (!item.productId && item.unitPrice === undefined) {
              ctx.addIssue({ code: 'custom', path: ['unitPrice'], message: 'At what price?' });
            }
          }),
      )
      .min(1, 'Add at least one product')
      .max(100),
    /** Amount off the sum of the lines (the app turns a percentage into an amount). */
    discount: unitPriceSchema.default(0),
    /** Credit sale: what the customer pays now (recorded as a first payment of the debt). */
    downPayment: unitPriceSchema.optional(),
    /** How the down payment was paid (required with one). */
    downPaymentMethod: z.enum(PaymentMethod).optional(),
    /** Credit sale: a down payment made with several methods (instead of the two above). */
    downPayments: paymentPartsSchema.optional(),
    notes: z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value === '' ? null : value))
      .nullish(),
  })
  .superRefine((sale, ctx) => {
    if (sale.downPayment !== undefined && sale.downPayment > 0) {
      if (sale.paymentType !== 'credit') {
        ctx.addIssue({ code: 'custom', path: ['downPayment'], message: 'Only for credit sales' });
      }
      if (!sale.downPaymentMethod) {
        ctx.addIssue({ code: 'custom', path: ['downPaymentMethod'], message: 'How was it paid?' });
      }
    }
    if (sale.paymentType === 'cash' && !sale.method && !sale.payments) {
      ctx.addIssue({ code: 'custom', path: ['method'], message: 'How was it paid?' });
    }
    if (sale.payments && sale.paymentType !== 'cash') {
      ctx.addIssue({ code: 'custom', path: ['payments'], message: 'Only for cash sales' });
    }
    if (sale.downPayments && sale.paymentType !== 'credit') {
      ctx.addIssue({ code: 'custom', path: ['downPayments'], message: 'Only for credit sales' });
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
  /** Only sales that sold some counted product beyond its stock. */
  shortage: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /** Without it: newest first. */
  sortBy: z
    .enum(['number', 'date', 'customer', 'items', 'paymentType', 'method', 'total'])
    .optional(),
  sortDir: sortDirSchema,
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;

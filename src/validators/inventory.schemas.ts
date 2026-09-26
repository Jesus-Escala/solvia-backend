import { AdjustmentReason, SaleDocType } from '@prisma/client';
import { z } from 'zod';
import { phoneSchema } from './customer.schemas';
import {
  dateOnlySchema,
  paginationSchema,
  paymentPartsSchema,
  sortDirSchema,
} from './common.schemas';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullish();

const quantitySchema = z.coerce
  .number('Expected a number')
  .max(99_999_999)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, {
    message: 'Quantity must have at most 3 decimals',
  });

const costSchema = z.coerce
  .number('Expected a number')
  .min(0)
  .max(9_999_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Amount must have at most 2 decimals',
  });

// --- Suppliers -------------------------------------------------------------

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  documentId: optionalText(20),
  /** Optional WhatsApp; empty means none. */
  phone: z
    .union([z.literal(''), phoneSchema])
    .transform((value) => (value === '' ? null : value))
    .nullish(),
  notes: optionalText(1000),
});

export const updateSupplierSchema = createSupplierSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const listSuppliersQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(['name', 'phone', 'purchases']).default('name'),
  sortDir: sortDirSchema,
});

// --- Purchases -------------------------------------------------------------

export const createPurchaseSchema = z.object({
  supplierId: z.uuid().optional(),
  /** Defaults to today (APP_TIMEZONE). */
  date: dateOnlySchema.optional(),
  docType: z.enum(SaleDocType).default('none'),
  docNumber: optionalText(40),
  /** Set each product's cost to what was paid now (default: yes). */
  updateCosts: z.boolean().default(true),
  /** How it was paid to the supplier, one or several methods adding up to the total (optional). */
  payments: paymentPartsSchema.optional(),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: quantitySchema.refine((value) => value > 0, 'Quantity must be greater than zero'),
        unitCost: costSchema,
      }),
    )
    .min(1, 'Add at least one product')
    .max(200),
});

export const listPurchasesQuerySchema = paginationSchema.extend({
  /** Purchase number or supplier name. */
  search: z.string().trim().max(120).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  status: z.enum(['completed', 'voided']).optional(),
  /** Without it: newest first. */
  sortBy: z.enum(['number', 'date', 'supplier', 'items', 'method', 'total']).optional(),
  sortDir: sortDirSchema,
});

// --- Stock adjustments -----------------------------------------------------

export const adjustStockSchema = z
  .object({
    reason: z.enum(AdjustmentReason),
    /**
     * count: the stock counted (≥ 0) · loss / damage: units that left (> 0) ·
     * correction: the signed change (≠ 0).
     */
    quantity: quantitySchema,
    note: optionalText(255),
  })
  .superRefine((input, ctx) => {
    const bad =
      (input.reason === 'count' && input.quantity < 0) ||
      ((input.reason === 'loss' || input.reason === 'damage') && input.quantity <= 0) ||
      (input.reason === 'correction' && input.quantity === 0);
    if (bad) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Invalid quantity' });
  });

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

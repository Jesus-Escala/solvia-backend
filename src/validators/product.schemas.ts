import { ProductKind, ProductUnit } from '@prisma/client';
import { z } from 'zod';
import { moneySchema, paginationSchema, sortDirSchema } from './common.schemas';

/** Zero or positive amount with at most 2 decimals (a product may cost nothing to the business). */
const optionalMoneySchema = z.coerce
  .number('Expected a number')
  .min(0)
  .max(9_999_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Amount must have at most 2 decimals',
  });

/** Quantity with up to 3 decimals (kilos, liters…). */
const quantitySchema = z.coerce
  .number('Expected a number')
  .min(0)
  .max(99_999_999)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, {
    message: 'Quantity must have at most 3 decimals',
  });

const optionalCode = z
  .string()
  .trim()
  .max(40)
  .transform((value) => (value === '' ? null : value))
  .nullish();

const productFields = z.object({
  /** A service is never counted in stock. */
  kind: z.enum(ProductKind),
  name: z.string().trim().min(2).max(120),
  /** Category of the business (null: none). */
  categoryId: z.uuid('Invalid identifier').nullish(),
  /** Spot of a floor plan where it is kept (null: not placed). */
  spotId: z.uuid('Invalid identifier').nullish(),
  code: optionalCode,
  unit: z.enum(ProductUnit),
  price: moneySchema,
  cost: optionalMoneySchema.nullish(),
  trackStock: z.boolean(),
  minStock: quantitySchema.nullish(),
  /** Sack/box it is bought in, in the product's unit (e.g. 10 kg); null when bought loose. */
  packSize: quantitySchema
    .refine((value) => value > 0, 'Pack size must be greater than zero')
    .nullish(),
});

export const createProductSchema = productFields.extend({
  kind: productFields.shape.kind.default('product'),
  unit: productFields.shape.unit.default('unit'),
  trackStock: productFields.shape.trackStock.default(true),
});

// No defaults here: a partial update must not reset fields it does not mention.
export const updateProductSchema = productFields
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

/**
 * Product lookup: the picker (8 by relevance) or the point-of-sale catalog (`sort=popular`: the
 * best sellers of the last 90 days first, up to 60).
 */
export const productLookupQuerySchema = z.object({
  search: z.string().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(8),
  sort: z.enum(['relevance', 'popular']).default('relevance'),
  /** Only the products of this category (the point-of-sale category chips). */
  categoryId: z.uuid('Invalid identifier').optional(),
});

export const listProductsQuerySchema = paginationSchema.extend({
  /** Matches the name or the code (case-insensitive). */
  search: z.string().trim().max(120).optional(),
  /** `active` (default) hides archived products; `archived` shows only those; `all` both. */
  status: z.enum(['active', 'archived', 'all']).default('active'),
  /** Only products or only services. */
  kind: z.enum(ProductKind).optional(),
  /** Only the products of a category, or `none` for those without one. */
  categoryId: z.union([z.uuid('Invalid identifier'), z.literal('none')]).optional(),
  /** Only counted products at or below their alert level (0 when none is set). */
  lowStock: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sortBy: z
    .enum([
      'name',
      'code',
      'category',
      'unit',
      'price',
      'cost',
      'margin',
      'stock',
      'minStock',
      'createdAt',
    ])
    .default('name'),
  sortDir: sortDirSchema,
});

/** Name of a product category, unique within the business (ignoring case). */
export const categorySchema = z.object({ name: z.string().trim().min(2).max(60) });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CategoryInput = z.infer<typeof categorySchema>;

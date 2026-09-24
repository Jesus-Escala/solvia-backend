import { z } from 'zod';
import { paginationSchema, sortDirSchema } from './common.schemas';

/** E.164 phone number, e.g. +51987654321. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(
    z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must include the country code, e.g. +51987654321'),
  );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullish();

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  documentId: optionalText(20),
  notes: optionalText(1000),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const listCustomersQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  sortBy: z
    .enum(['name', 'phone', 'createdAt', 'outstanding', 'risk', 'open', 'overdue'])
    .default('name'),
  sortDir: sortDirSchema,
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

import { z } from 'zod';
import { emailSchema } from './auth.schemas';
import { paginationSchema } from './common.schemas';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

/** "Request access" form of the landing page. */
export const createAccessRequestSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .regex(/^[\d\s+-]{6,20}$/, 'Phone must be 6 to 20 characters: digits, spaces, + or -'),
  industry: optionalText(80),
  message: optionalText(1000),
});

export const accessRequestStatusSchema = z.enum(['pending', 'converted', 'dismissed']);

export const listAccessRequestsQuerySchema = paginationSchema.extend({
  status: accessRequestStatusSchema.optional(),
  /** Matches business name, contact name, email or phone (case-insensitive). */
  search: z.string().trim().max(120).optional(),
});

/** Converting happens only by creating the tenant (`POST /admin/tenants`). */
export const updateAccessRequestSchema = z.object({
  status: z.enum(['pending', 'dismissed']),
});

export type CreateAccessRequestInput = z.infer<typeof createAccessRequestSchema>;
export type ListAccessRequestsQuery = z.infer<typeof listAccessRequestsQuerySchema>;
export type UpdateAccessRequestInput = z.infer<typeof updateAccessRequestSchema>;

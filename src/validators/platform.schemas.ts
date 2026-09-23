import { z } from 'zod';
import { paginationSchema } from './common.schemas';

export {
  loginSchema as platformLoginSchema,
  refreshSchema as platformRefreshSchema,
} from './auth.schemas';

const planSchema = z.enum(['free', 'starter', 'pro']);
const tenantStatusSchema = z.enum(['active', 'suspended']);

export const listTenantsQuerySchema = paginationSchema.extend({
  /** Matches the tenant name or the email of any of its users (case-insensitive). */
  search: z.string().trim().max(120).optional(),
  plan: planSchema.optional(),
  status: tenantStatusSchema.optional(),
  sortBy: z.enum(['name', 'createdAt', 'outstanding', 'customers', 'users']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const updateTenantSchema = z
  .object({ plan: planSchema.optional(), status: tenantStatusSchema.optional() })
  .refine((value) => value.plan !== undefined || value.status !== undefined, {
    message: 'At least one of plan or status is required',
  });

export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

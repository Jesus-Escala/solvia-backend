import { z } from 'zod';
import { emailSchema } from './auth.schemas';
import { paginationSchema } from './common.schemas';

export {
  loginSchema as platformLoginSchema,
  refreshSchema as platformRefreshSchema,
} from './auth.schemas';

const planSchema = z.enum(['free', 'starter', 'pro']);
const tenantStatusSchema = z.enum(['active', 'suspended']);
const tenantModulesSchema = z.array(z.enum(['sales', 'inventory'])).max(2);

export const listTenantsQuerySchema = paginationSchema.extend({
  /** Matches the tenant name or the email of any of its users (case-insensitive). */
  search: z.string().trim().max(120).optional(),
  plan: planSchema.optional(),
  status: tenantStatusSchema.optional(),
  sortBy: z
    .enum([
      'name',
      'plan',
      'status',
      'createdAt',
      'outstanding',
      'collected',
      'lastActivity',
      'customers',
      'users',
    ])
    .default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const updateTenantSchema = z
  .object({
    plan: planSchema.optional(),
    status: tenantStatusSchema.optional(),
    /** Full list of enabled optional modules (replaces the current one; duplicates removed). */
    modules: tenantModulesSchema.transform((modules) => [...new Set(modules)]).optional(),
  })
  .refine(
    (value) =>
      value.plan !== undefined || value.status !== undefined || value.modules !== undefined,
    { message: 'At least one of plan, status or modules is required' },
  );

/** Business created by the platform admin (managed onboarding) with its first admin user. */
export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  industry: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value ? value : undefined)),
  plan: planSchema.default('free'),
  admin: z.object({ name: z.string().trim().min(2).max(120), email: emailSchema }),
  /** Access request this business comes from; it is marked as converted. */
  accessRequestId: z.uuid('Invalid identifier').optional(),
});

export const tenantUserParamsSchema = z.object({
  id: z.uuid('Invalid identifier'),
  userId: z.uuid('Invalid identifier'),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

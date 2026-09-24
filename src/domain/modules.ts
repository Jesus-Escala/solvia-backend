import type { TenantModule } from '@prisma/client';

/**
 * Optional modules of a business. Debt collection is always on; `catalog` (products) is not a
 * module of its own: it is available as soon as sales or inventory is enabled, because both
 * need it.
 */
export type ModuleRequirement = TenantModule | 'catalog';

export const TENANT_MODULES: TenantModule[] = ['sales', 'inventory'];

export function hasModule(enabled: readonly TenantModule[], required: ModuleRequirement): boolean {
  if (required === 'catalog') return enabled.length > 0;
  return enabled.includes(required);
}

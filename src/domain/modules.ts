import type { TenantModule } from '@prisma/client';

/**
 * Modules a business pays for: Comercial (`sales`), Cuentas por cobrar (`collections`) and
 * Logística (`inventory`), any of them on its own or together (at least one). The shared records
 * ("Mantenimientos") are not modules of their own:
 * - `catalog` (products): with Comercial or Logística, because both need it.
 * - `customers`: with Cuentas por cobrar or Comercial (who owes, who bought).
 * - suppliers come with Logística. Floor plans (Ubicaciones) are for every business.
 */
export type ModuleRequirement = TenantModule | 'catalog' | 'customers';

export const TENANT_MODULES: TenantModule[] = ['collections', 'sales', 'inventory'];

export function hasModule(enabled: readonly TenantModule[], required: ModuleRequirement): boolean {
  if (required === 'catalog') return enabled.includes('sales') || enabled.includes('inventory');
  if (required === 'customers') return enabled.includes('collections') || enabled.includes('sales');
  return enabled.includes(required);
}

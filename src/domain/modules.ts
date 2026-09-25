import type { TenantModule } from '@prisma/client';

/**
 * Modules a business pays for: Cobranza (`collections`), Ventas (`sales`) and Inventario
 * (`inventory`), any of them on its own or together (at least one). Two capabilities are shared
 * and not modules of their own:
 * - `catalog` (products): with Ventas or Inventario, because both need it.
 * - `customers`: with Cobranza or Ventas (who owes, who bought).
 */
export type ModuleRequirement = TenantModule | 'catalog' | 'customers';

export const TENANT_MODULES: TenantModule[] = ['collections', 'sales', 'inventory'];

export function hasModule(enabled: readonly TenantModule[], required: ModuleRequirement): boolean {
  if (required === 'catalog') return enabled.includes('sales') || enabled.includes('inventory');
  if (required === 'customers') return enabled.includes('collections') || enabled.includes('sales');
  return enabled.includes(required);
}

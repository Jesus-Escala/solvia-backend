import { runWithLocale } from '../lib/locale';
import { logger } from '../lib/logger';
import { runWithTenant } from '../lib/tenantContext';
import { tenantRepository } from '../repositories/tenant.repository';

export interface TenantJobResult<T> {
  tenantId: string;
  tenantName: string;
  result?: T;
  error?: string;
}

/**
 * Runs `task` once per active tenant, each inside its own tenant context and in the tenant's
 * language (there is no request to take it from), so jobs reuse the same tenant-scoped services
 * as the API and write reminders in the business's language. A failure in one tenant does not
 * stop the others.
 */
export async function runForEachTenant<T>(
  jobName: string,
  task: () => Promise<T>,
): Promise<Array<TenantJobResult<T>>> {
  const tenants = await tenantRepository.listActiveIds();
  const results: Array<TenantJobResult<T>> = [];

  for (const tenant of tenants) {
    try {
      const result = await runWithLocale(tenant.language, () => runWithTenant(tenant.id, task));
      results.push({ tenantId: tenant.id, tenantName: tenant.name, result });
    } catch (error) {
      logger.error(`[${jobName}] Failed for tenant ${tenant.id}`, error);
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Runs `callback` with every tenant-scoped Prisma query restricted to `tenantId`. */
export function runWithTenant<T>(tenantId: string, callback: () => T): T {
  return storage.run({ tenantId }, callback);
}

export function getCurrentTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

/** Returns the current tenant id, failing when called outside a tenant context. */
export function requireTenantId(): string {
  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    throw new Error('No tenant context is active');
  }
  return tenantId;
}

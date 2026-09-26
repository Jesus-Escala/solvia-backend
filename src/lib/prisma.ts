import { PrismaClient } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { getCurrentTenantId } from './tenantContext';

/**
 * Unscoped client. Only use it for cross-tenant work that cannot run inside a tenant
 * context: authentication, tenant registration, job orchestration and seeding.
 */
export const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/** Models that own a `tenantId` column. */
const DIRECT_TENANT_MODELS = new Set<string>([
  'User',
  'Customer',
  'Receivable',
  'MessageTemplate',
  'ReminderSettings',
  'MonthlyReport',
  'Product',
  'ProductCategory',
  'Sale',
  'StockMovement',
  'Supplier',
  'Purchase',
  'MessagePack',
]);

/** Models scoped through their parent receivable. */
const RECEIVABLE_SCOPED_MODELS = new Set<string>(['Payment', 'Notification']);

/** Line models scoped through their parent document (only created nested in the parent). */
const LINE_PARENTS: Record<string, 'sale' | 'purchase'> = {
  SaleItem: 'sale',
  PurchaseItem: 'purchase',
};

const WHERE_OPERATIONS = new Set<string>([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

const CREATE_OPERATIONS = new Set<string>(['create', 'createMany', 'createManyAndReturn']);

type Args = Record<string, unknown>;
type Where = Record<string, unknown>;

function scopeWhere(model: string, where: Where | undefined, tenantId: string): Where {
  const current = where ?? {};
  if (model === 'Tenant') {
    return { ...current, id: tenantId };
  }
  if (DIRECT_TENANT_MODELS.has(model)) {
    return { ...current, tenantId };
  }
  const parent = LINE_PARENTS[model];
  if (parent) {
    const parentFilter = (current[parent] as Where | undefined) ?? {};
    return { ...current, [parent]: { ...parentFilter, tenantId } };
  }
  const receivableFilter = (current.receivable as Where | undefined) ?? {};
  return { ...current, receivable: { ...receivableFilter, tenantId } };
}

function withTenantId(data: unknown, tenantId: string): Args | Args[] {
  return Array.isArray(data)
    ? (data as Args[]).map((row) => ({ ...row, tenantId }))
    : { ...(data as Args), tenantId };
}

async function assertReceivablesBelongToTenant(data: unknown, tenantId: string): Promise<void> {
  const rows = (Array.isArray(data) ? data : [data]) as Array<{ receivableId?: string }>;
  const ids = [...new Set(rows.map((row) => row.receivableId))].filter(
    (id): id is string => typeof id === 'string',
  );
  const count = await basePrisma.receivable.count({ where: { id: { in: ids }, tenantId } });
  if (ids.length === 0 || count !== ids.length) {
    throw AppError.notFound('Receivable');
  }
}

/**
 * Tenant-scoped client. Every query on a tenant-owned model is automatically restricted to the
 * tenant of the current request (see the `tenantScope` middleware). Queries on scoped models
 * without a tenant context are rejected, so a missing scope can never leak data across tenants.
 *
 * Repositories must use scalar foreign keys (e.g. `customerId`) instead of nested `connect`
 * inputs so the injected `tenantId` stays compatible with Prisma's unchecked input types.
 */
export const prisma = basePrisma.$extends({
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const isDirect = DIRECT_TENANT_MODELS.has(model);
        const isReceivableScoped = RECEIVABLE_SCOPED_MODELS.has(model);
        const isLine = model in LINE_PARENTS;
        if (model !== 'Tenant' && !isDirect && !isReceivableScoped && !isLine) {
          return query(args);
        }

        const tenantId = getCurrentTenantId();
        if (!tenantId) {
          throw new Error(`Tenant context is required to query model "${model}"`);
        }

        const scopedArgs: Args = { ...(args as Args) };

        if (WHERE_OPERATIONS.has(operation)) {
          scopedArgs.where = scopeWhere(model, scopedArgs.where as Where | undefined, tenantId);
        }

        if (model === 'Tenant') {
          if (CREATE_OPERATIONS.has(operation) || operation === 'upsert') {
            throw new Error('Tenants must be created with the unscoped client');
          }
        } else if (isDirect) {
          if (CREATE_OPERATIONS.has(operation)) {
            scopedArgs.data = withTenantId(scopedArgs.data, tenantId);
          } else if (operation === 'upsert') {
            scopedArgs.create = withTenantId(scopedArgs.create, tenantId);
          }
        } else if (isLine) {
          if (CREATE_OPERATIONS.has(operation) || operation === 'upsert') {
            throw new Error(`Create "${model}" rows nested in their parent document`);
          }
        } else if (CREATE_OPERATIONS.has(operation)) {
          await assertReceivablesBelongToTenant(scopedArgs.data, tenantId);
        } else if (operation === 'upsert') {
          await assertReceivablesBelongToTenant(scopedArgs.create, tenantId);
        }

        return query(scopedArgs as typeof args);
      },
    },
  },
});

export type ScopedPrismaClient = typeof prisma;
export type ScopedTransactionClient = Parameters<
  Parameters<ScopedPrismaClient['$transaction']>[0]
>[0];

import type { Prisma, Supplier } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import { paginate } from '../validators/common.schemas';
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
} from '../validators/inventory.schemas';

export function toSupplierDto(supplier: Supplier & { _count?: { purchases: number } }) {
  return {
    id: supplier.id,
    name: supplier.name,
    documentId: supplier.documentId,
    phone: supplier.phone,
    notes: supplier.notes,
    purchases: supplier._count?.purchases ?? null,
    createdAt: supplier.createdAt.toISOString(),
  };
}

const searchFilter = (search: string | null): Prisma.SupplierWhereInput =>
  search === null
    ? {}
    : {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { documentId: { contains: search } },
        ],
      };

async function findOrFail(id: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw AppError.notFound('Supplier');
  return supplier;
}

export const supplierService = {
  async list(query: ListSuppliersQuery) {
    const { search, ...pagination } = query;
    const where = searchFilter(search ?? null);
    const [rows, total] = await prisma.$transaction([
      prisma.supplier.findMany({
        where,
        include: { _count: { select: { purchases: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      prisma.supplier.count({ where }),
    ]);
    return paginate(rows.map(toSupplierDto), total, pagination);
  },

  /** Picker search: a handful of suppliers by name or RUC, no count. */
  async lookup(search: string, limit: number) {
    const text = search.trim();
    const rows = await prisma.supplier.findMany({
      where: searchFilter(text === '' ? null : text),
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone }));
  },

  async create(input: CreateSupplierInput) {
    const created = await prisma.supplier.create({
      data: { ...input, tenantId: requireTenantId() },
    });
    return toSupplierDto(created);
  },

  async update(id: string, input: UpdateSupplierInput) {
    await findOrFail(id);
    return toSupplierDto(await prisma.supplier.update({ where: { id }, data: input }));
  },

  /** Suppliers with purchases stay (their history names them). */
  async delete(id: string) {
    await findOrFail(id);
    if ((await prisma.purchase.count({ where: { supplierId: id } })) > 0) {
      throw new AppError(409, 'SUPPLIER_IN_USE', 'This supplier has purchases');
    }
    await prisma.supplier.delete({ where: { id } });
  },
};

import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import type { Pagination, SortDir } from '../validators/common.schemas';
import type { CreateProductInput, UpdateProductInput } from '../validators/product.schemas';

function listFilter(options: {
  search?: string;
  status: 'active' | 'archived' | 'all';
}): Prisma.ProductWhereInput {
  return {
    ...(options.status !== 'all' && { active: options.status === 'active' }),
    ...(options.search && {
      OR: [
        { name: { contains: options.search, mode: 'insensitive' } },
        { code: { contains: options.search, mode: 'insensitive' } },
      ],
    }),
  };
}

export const productRepository = {
  findMany(options: {
    search?: string;
    status: 'active' | 'archived' | 'all';
    pagination: Pagination;
    orderBy: { field: 'name' | 'code' | 'price' | 'cost' | 'createdAt'; dir: SortDir };
  }) {
    const where = listFilter(options);
    const { pagination, orderBy } = options;
    return prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy: [
          // Products without a code or cost go last (only those two columns can be empty).
          orderBy.field === 'code' || orderBy.field === 'cost'
            ? { [orderBy.field]: { sort: orderBy.dir, nulls: 'last' } }
            : { [orderBy.field]: orderBy.dir },
          { id: 'asc' },
        ],
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      prisma.product.count({ where }),
    ]);
  },

  findById(id: string) {
    return prisma.product.findUnique({ where: { id } });
  },

  findByCode(code: string) {
    return prisma.product.findFirst({ where: { code } });
  },

  create(data: CreateProductInput) {
    return prisma.product.create({ data: { ...data, tenantId: requireTenantId() } });
  },

  update(id: string, data: UpdateProductInput) {
    return prisma.product.update({ where: { id }, data });
  },

  /** Whether any sale references the product (then it can only be archived). */
  async isUsed(id: string) {
    return (await prisma.saleItem.count({ where: { productId: id } })) > 0;
  },

  delete(id: string) {
    return prisma.product.delete({ where: { id } });
  },
};

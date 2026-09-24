import type { Prisma, ProductUnit } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import type { Pagination, SortDir } from '../validators/common.schemas';
import type { CreateProductInput, UpdateProductInput } from '../validators/product.schemas';
import { escapeLike } from './sql';

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

  /**
   * Picker search over active products: an exact code (a scanned barcode) first, then names
   * starting with the text, then names containing it. No count, only what a picker shows.
   * Uses the name trigram index. Raw SQL: filters by the tenant explicitly.
   */
  lookup(search: string, limit: number) {
    const tenantId = requireTenantId();
    const text = search.trim();
    const pattern = escapeLike(text);
    return prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        code: string | null;
        unit: ProductUnit;
        price: Prisma.Decimal;
        trackStock: boolean;
        stock: Prisma.Decimal;
        minStock: Prisma.Decimal | null;
      }>
    >`
      SELECT p."id", p."name", p."code", p."unit", p."price", p."trackStock", p."stock",
             p."minStock"
      FROM "products" p
      WHERE p."tenantId" = ${tenantId}
        AND p."active"
        AND (${text} = ''
             OR p."code" = ${text}
             OR p."name" ILIKE '%' || ${pattern} || '%'
             OR p."code" ILIKE ${pattern} || '%')
      ORDER BY (p."code" IS NOT DISTINCT FROM ${text}) DESC,
               (p."name" ILIKE ${pattern} || '%') DESC,
               p."name" ASC, p."id" ASC
      LIMIT ${limit}
    `;
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

  /** Stock movements of a product, newest first, with the sale they come from (kardex). */
  movements(productId: string, pagination: Pagination) {
    const where = { productId };
    return prisma.$transaction([
      prisma.stockMovement.findMany({
        where,
        include: { sale: { select: { id: true, number: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      prisma.stockMovement.count({ where }),
    ]);
  },

  /** Whether any sale references the product (then it can only be archived). */
  async isUsed(id: string) {
    return (await prisma.saleItem.count({ where: { productId: id } })) > 0;
  },

  delete(id: string) {
    return prisma.product.delete({ where: { id } });
  },
};

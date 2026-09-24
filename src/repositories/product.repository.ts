import type { Prisma, ProductUnit } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import type { Pagination, SortDir } from '../validators/common.schemas';
import type { CreateProductInput, UpdateProductInput } from '../validators/product.schemas';
import { escapeLike } from './sql';

function listFilter(options: {
  search?: string;
  status: 'active' | 'archived' | 'all';
  lowStock?: boolean;
}): Prisma.ProductWhereInput {
  return {
    ...(options.lowStock && {
      trackStock: true,
      // Column comparison (stock ≤ minStock); without an alert level, out of stock (≤ 0).
      OR: [
        { stock: { lte: prisma.product.fields.minStock } },
        { minStock: null, stock: { lte: 0 } },
      ],
    }),
    ...(options.status !== 'all' && { active: options.status === 'active' }),
    ...(options.search && {
      OR: [
        { name: { contains: options.search, mode: 'insensitive' } },
        { code: { contains: options.search, mode: 'insensitive' } },
      ],
    }),
  };
}

export type ProductOrderField =
  'name' | 'code' | 'unit' | 'price' | 'cost' | 'margin' | 'stock' | 'minStock' | 'createdAt';

/** Empty values (no code, cost or alert level; products without stock count) go last. */
function productOrderBy(
  field: Exclude<ProductOrderField, 'margin'>,
  dir: SortDir,
): Prisma.ProductOrderByWithRelationInput[] {
  if (field === 'code' || field === 'cost' || field === 'minStock') {
    return [{ [field]: { sort: dir, nulls: 'last' } }];
  }
  if (field === 'stock') return [{ trackStock: 'desc' }, { stock: dir }];
  return [{ [field]: dir }];
}

/**
 * The margin ((price − cost) / price) is not a column, so it is sorted here: only id, price and
 * cost of the matching products are read (a catalog is at most a few thousand products), then
 * the page is loaded. Products without a cost go last.
 */
async function findManyByMargin(
  where: Prisma.ProductWhereInput,
  pagination: Pagination,
  dir: SortDir,
) {
  const all = await prisma.product.findMany({
    where,
    select: { id: true, price: true, cost: true },
  });
  const margin = (row: (typeof all)[number]) => {
    const price = Number(row.price);
    return row.cost === null || price === 0 ? null : (price - Number(row.cost)) / price;
  };
  const sign = dir === 'asc' ? 1 : -1;
  const ordered = all
    .map((row) => ({ id: row.id, margin: margin(row) }))
    .sort((a, b) => {
      if (a.margin === null || b.margin === null) {
        return a.margin === b.margin ? a.id.localeCompare(b.id) : a.margin === null ? 1 : -1;
      }
      return (a.margin - b.margin) * sign || a.id.localeCompare(b.id);
    });
  const start = (pagination.page - 1) * pagination.pageSize;
  const ids = ordered.slice(start, start + pagination.pageSize).map((row) => row.id);
  const rows = await prisma.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return [ids.map((id) => byId.get(id)!).filter(Boolean), all.length] as const;
}

export const productRepository = {
  findMany(options: {
    search?: string;
    status: 'active' | 'archived' | 'all';
    lowStock?: boolean;
    pagination: Pagination;
    orderBy: { field: ProductOrderField; dir: SortDir };
  }) {
    const where = listFilter(options);
    const { pagination, orderBy } = options;
    if (orderBy.field === 'margin') return findManyByMargin(where, pagination, orderBy.dir);
    return prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy: [...productOrderBy(orderBy.field, orderBy.dir), { id: 'asc' }],
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
        cost: Prisma.Decimal | null;
        trackStock: boolean;
        stock: Prisma.Decimal;
        minStock: Prisma.Decimal | null;
      }>
    >`
      SELECT p."id", p."name", p."code", p."unit", p."price", p."cost", p."trackStock", p."stock",
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
        include: {
          sale: { select: { id: true, number: true } },
          purchase: { select: { id: true, number: true } },
        },
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

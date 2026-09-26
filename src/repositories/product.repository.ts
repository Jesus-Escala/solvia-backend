import type { Prisma, ProductKind, ProductUnit } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import type { Pagination, SortDir } from '../validators/common.schemas';
import type { CreateProductInput, UpdateProductInput } from '../validators/product.schemas';
import { escapeLike } from './sql';

function listFilter(options: {
  search?: string;
  status: 'active' | 'archived' | 'all';
  lowStock?: boolean;
  kind?: ProductKind;
  categoryId?: string;
}): Prisma.ProductWhereInput {
  // Each condition in its own AND entry: low stock and the search both need an OR.
  const and: Prisma.ProductWhereInput[] = [];
  if (options.lowStock) {
    and.push({
      trackStock: true,
      // Column comparison (stock ≤ minStock); without an alert level, out of stock (≤ 0).
      OR: [
        { stock: { lte: prisma.product.fields.minStock } },
        { minStock: null, stock: { lte: 0 } },
      ],
    });
  }
  if (options.search) {
    and.push({
      OR: [
        { name: { contains: options.search, mode: 'insensitive' } },
        { code: { contains: options.search, mode: 'insensitive' } },
      ],
    });
  }
  return {
    ...(options.status !== 'all' && { active: options.status === 'active' }),
    ...(options.kind && { kind: options.kind }),
    ...(options.categoryId && {
      categoryId: options.categoryId === 'none' ? null : options.categoryId,
    }),
    ...(and.length > 0 && { AND: and }),
  };
}

export type ProductOrderField =
  | 'name'
  | 'code'
  | 'category'
  | 'unit'
  | 'price'
  | 'cost'
  | 'margin'
  | 'stock'
  | 'minStock'
  | 'createdAt';

/** Every product comes with the name of its category. */
export const productInclude = {
  category: { select: { id: true, name: true } },
  spot: { select: { id: true, name: true, mapId: true, map: { select: { name: true } } } },
} as const;

/** Empty values (no code, cost or alert level; products without stock count) go last. */
function productOrderBy(
  field: Exclude<ProductOrderField, 'margin'>,
  dir: SortDir,
): Prisma.ProductOrderByWithRelationInput[] {
  if (field === 'code' || field === 'cost' || field === 'minStock') {
    return [{ [field]: { sort: dir, nulls: 'last' } }];
  }
  if (field === 'stock') return [{ trackStock: 'desc' }, { stock: dir }];
  // By category name, then by product name inside each category.
  if (field === 'category') return [{ category: { name: dir } }, { name: 'asc' }];
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
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: productInclude,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return [ids.map((id) => byId.get(id)!).filter(Boolean), all.length] as const;
}

export const productRepository = {
  findMany(options: {
    search?: string;
    status: 'active' | 'archived' | 'all';
    lowStock?: boolean;
    kind?: ProductKind;
    categoryId?: string;
    pagination: Pagination;
    orderBy: { field: ProductOrderField; dir: SortDir };
  }) {
    const where = listFilter(options);
    const { pagination, orderBy } = options;
    if (orderBy.field === 'margin') return findManyByMargin(where, pagination, orderBy.dir);
    return prisma.$transaction([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [...productOrderBy(orderBy.field, orderBy.dir), { id: 'asc' }],
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      prisma.product.count({ where }),
    ]);
  },

  findById(id: string) {
    return prisma.product.findUnique({ where: { id }, include: productInclude });
  },

  /**
   * Picker search over active products: an exact code (a scanned barcode) first, then names
   * starting with the text, then names containing it. No count, only what a picker shows.
   * Uses the name trigram index. Raw SQL: filters by the tenant explicitly. With `popular`, what
   * sold most in the last 90 days goes first (then the same order).
   */
  lookup(search: string, limit: number, popular = false, categoryId: string | null = null) {
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
        packSize: Prisma.Decimal | null;
        kind: ProductKind;
        imageUrl: string | null;
        categoryId: string | null;
        sold: number;
      }>
    >`
      SELECT p."id", p."name", p."code", p."unit", p."price", p."cost", p."trackStock", p."stock",
             p."minStock", p."packSize", p."kind", p."imageUrl", p."categoryId",
             COALESCE(sold."lines", 0)::int AS "sold"
      FROM "products" p
      LEFT JOIN (
        SELECT i."productId", COUNT(*) AS "lines"
        FROM "sale_items" i
        JOIN "sales" s ON s."id" = i."saleId"
        WHERE ${popular} AND s."tenantId" = ${tenantId} AND s."status" = 'completed'
          AND s."date" >= CURRENT_DATE - 90
        GROUP BY i."productId"
      ) sold ON sold."productId" = p."id"
      WHERE p."tenantId" = ${tenantId}
        AND p."active"
        AND (${categoryId}::text IS NULL OR p."categoryId" = ${categoryId})
        AND (${text} = ''
             OR p."code" = ${text}
             OR p."name" ILIKE '%' || ${pattern} || '%'
             OR p."code" ILIKE ${pattern} || '%')
      ORDER BY (p."code" IS NOT DISTINCT FROM ${text}) DESC,
               (p."name" ILIKE ${pattern} || '%') DESC,
               COALESCE(sold."lines", 0) DESC,
               p."name" ASC, p."id" ASC
      LIMIT ${limit}
    `;
  },

  findByCode(code: string) {
    return prisma.product.findFirst({ where: { code } });
  },

  /** The highest internal code of the business ("2" + 7 digits), or null. */
  async highestInternalCode(): Promise<string | null> {
    const tenantId = requireTenantId();
    const rows = await prisma.$queryRaw<Array<{ code: string | null }>>`
      SELECT MAX("code") AS "code" FROM "products"
      WHERE "tenantId" = ${tenantId} AND "code" ~ '^2[0-9]{7}$'
    `;
    return rows[0]?.code ?? null;
  },

  create(data: CreateProductInput & { code: string }) {
    return prisma.product.create({
      data: { ...data, tenantId: requireTenantId() },
      include: productInclude,
    });
  },

  update(id: string, data: UpdateProductInput & { imageUrl?: string | null }) {
    return prisma.product.update({ where: { id }, data, include: productInclude });
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

/** Categories of the business, by name, with how many active products each has. */
export const categoryRepository = {
  list() {
    return prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        _count: { select: { products: { where: { active: true } } } },
      },
    });
  },

  findById(id: string) {
    return prisma.productCategory.findUnique({ where: { id } });
  },

  findByName(name: string) {
    return prisma.productCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  },

  create(name: string) {
    return prisma.productCategory.create({ data: { name, tenantId: requireTenantId() } });
  },

  update(id: string, name: string) {
    return prisma.productCategory.update({ where: { id }, data: { name } });
  },

  /** Its products stay, without a category (the foreign key sets null). */
  delete(id: string) {
    return prisma.productCategory.delete({ where: { id } });
  },
};

import type { Product } from '@prisma/client';
import { adjustmentDelta } from '../domain/inventory';
import { AppError } from '../errors/AppError';
import { roundMoney, toNumber } from '../lib/money';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import { productRepository } from '../repositories/product.repository';
import { paginate, type Pagination } from '../validators/common.schemas';
import type { AdjustStockInput } from '../validators/inventory.schemas';
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from '../validators/product.schemas';

export function toProductDto(product: Product) {
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    unit: product.unit,
    price: roundMoney(toNumber(product.price)),
    cost: product.cost === null ? null : roundMoney(toNumber(product.cost)),
    trackStock: product.trackStock,
    stock: toNumber(product.stock),
    minStock: product.minStock === null ? null : toNumber(product.minStock),
    packSize: product.packSize === null ? null : toNumber(product.packSize),
    active: product.active,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

const codeTaken = () =>
  new AppError(409, 'PRODUCT_CODE_TAKEN', 'Another product already uses this code');

/** Codes are unique per business: checked up front for a friendly error (the index enforces it). */
async function assertCodeAvailable(code: string | null | undefined, exceptId?: string) {
  if (!code) return;
  const existing = await productRepository.findByCode(code);
  if (existing && existing.id !== exceptId) throw codeTaken();
}

async function findOrFail(id: string) {
  const product = await productRepository.findById(id);
  if (!product) throw AppError.notFound('Product');
  return product;
}

export const productService = {
  async list(query: ListProductsQuery) {
    const { search, status, lowStock, sortBy, sortDir, ...pagination } = query;
    const [rows, total] = await productRepository.findMany({
      search,
      status,
      lowStock,
      pagination,
      orderBy: { field: sortBy, dir: sortDir },
    });
    return paginate(rows.map(toProductDto), total, pagination);
  },

  /**
   * Picker search: exact code first, then name prefix, then name contains (active only).
   * `popular` puts the best sellers of the last 90 days first (the point-of-sale catalog).
   */
  async lookup(search: string, limit: number, sort: 'relevance' | 'popular' = 'relevance') {
    const rows = await productRepository.lookup(search, limit, sort === 'popular');
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      unit: row.unit,
      price: roundMoney(toNumber(row.price)),
      cost: row.cost === null ? null : roundMoney(toNumber(row.cost)),
      trackStock: row.trackStock,
      stock: toNumber(row.stock),
      minStock: row.minStock === null ? null : toNumber(row.minStock),
      packSize: row.packSize === null ? null : toNumber(row.packSize),
    }));
  },

  /**
   * Kardex of a product: every stock change with the balance it left and what left without
   * stock (`shortage`), so a difference between the count and the system can be traced.
   */
  async movements(id: string, pagination: Pagination) {
    await findOrFail(id);
    const [rows, total] = await productRepository.movements(id, pagination);
    return paginate(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        quantity: toNumber(row.quantity),
        balanceAfter: row.balanceAfter === null ? null : toNumber(row.balanceAfter),
        shortage: toNumber(row.shortage),
        sale: row.sale,
        purchase: row.purchase,
        reason: row.reason,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      pagination,
    );
  },

  /**
   * Manual stock adjustment of a counted product: a physical count (the stock becomes what was
   * counted), a loss or damage (units leave) or a signed correction. Always leaves an
   * `adjustment` movement with its reason, note and the balance it left — even a count with no
   * difference, which records that the stock was checked.
   */
  async adjust(id: string, input: AdjustStockInput, userId: string | null) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } });
      if (!product) throw AppError.notFound('Product');
      if (!product.trackStock) {
        throw new AppError(
          422,
          'PRODUCT_NOT_COUNTED',
          'This product does not keep count of its stock',
        );
      }
      const delta = adjustmentDelta(input.reason, input.quantity, toNumber(product.stock));
      const updated =
        delta === 0
          ? product
          : await tx.product.update({ where: { id }, data: { stock: { increment: delta } } });
      await tx.stockMovement.create({
        data: {
          tenantId: requireTenantId(),
          productId: id,
          type: 'adjustment',
          quantity: delta,
          balanceAfter: updated.stock,
          reason: input.reason,
          note: input.note ?? null,
          createdById: userId,
        },
      });
      return toProductDto(updated);
    });
  },

  async getById(id: string) {
    return toProductDto(await findOrFail(id));
  },

  async create(input: CreateProductInput) {
    await assertCodeAvailable(input.code);
    return toProductDto(await productRepository.create(input));
  },

  async update(id: string, input: UpdateProductInput) {
    await findOrFail(id);
    await assertCodeAvailable(input.code, id);
    return toProductDto(await productRepository.update(id, input));
  },

  /** Deletes a product never sold; used ones can only be archived so history stays intact. */
  async delete(id: string) {
    await findOrFail(id);
    if (await productRepository.isUsed(id)) {
      throw new AppError(
        409,
        'PRODUCT_IN_USE',
        'This product is in past sales; archive it instead of deleting it',
      );
    }
    await productRepository.delete(id);
  },
};

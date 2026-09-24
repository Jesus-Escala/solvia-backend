import type { Product } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { roundMoney, toNumber } from '../lib/money';
import { productRepository } from '../repositories/product.repository';
import { paginate } from '../validators/common.schemas';
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
    minStock: product.minStock === null ? null : toNumber(product.minStock),
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
    const { search, status, sortBy, sortDir, ...pagination } = query;
    const [rows, total] = await productRepository.findMany({
      search,
      status,
      pagination,
      orderBy: { field: sortBy, dir: sortDir },
    });
    return paginate(rows.map(toProductDto), total, pagination);
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

  /**
   * Deletes a product. Once sales and purchases reference products, used ones will only be
   * archivable (`active: false`) so their history stays intact.
   */
  async delete(id: string) {
    await findOrFail(id);
    await productRepository.delete(id);
  },
};

import { roundMoney } from '../lib/money';

export interface SaleLineInput {
  /** Omitted on a free line (a service or something not in the catalog). */
  productId?: string | undefined;
  /** Name of a free line. */
  description?: string | undefined;
  quantity: number;
  /** Price actually charged; defaults to the product's price (required on a free line). */
  unitPrice?: number | undefined;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  trackStock: boolean;
}

export interface PricedLine {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  trackStock: boolean;
}

/** Rounds a quantity to the 3 decimals stored (kilos, liters). */
export const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

/**
 * Prices the lines of a sale from the catalog: the product name is copied (products can be
 * renamed later), the unit price defaults to the product's, and repeated products are merged
 * into one line when charged at the same price. Free lines (no product: a service or something
 * not in the catalog) keep their name and price and never move stock. The discount comes off the
 * sum of the lines: `subtotal` is that sum and `total` what is charged. Throws with the id of an
 * unknown product, or `DiscountTooHighError` when the discount is more than the lines.
 */
export function priceSale(
  lines: SaleLineInput[],
  products: Map<string, CatalogProduct>,
  discount = 0,
): { items: PricedLine[]; subtotal: number; discount: number; total: number } {
  const merged = new Map<string, PricedLine>();
  for (const line of lines) {
    const product = line.productId ? products.get(line.productId) : null;
    if (line.productId && !product) throw new UnknownProductError(line.productId);
    const unitPrice = roundMoney(line.unitPrice ?? product?.price ?? 0);
    const description = product ? product.name : (line.description ?? '').trim();
    const key = product
      ? `${product.id}@${unitPrice}`
      : `free:${description.toLowerCase()}@${unitPrice}`;
    const existing = merged.get(key);
    const quantity = roundQuantity((existing?.quantity ?? 0) + line.quantity);
    merged.set(key, {
      productId: product?.id ?? null,
      // Merged free lines keep the name as it was first written.
      description: existing?.description ?? description,
      quantity,
      unitPrice,
      subtotal: roundMoney(quantity * unitPrice),
      trackStock: product?.trackStock ?? false,
    });
  }
  const items = [...merged.values()];
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
  const off = roundMoney(discount);
  if (off > subtotal) throw new DiscountTooHighError();
  return { items, subtotal, discount: off, total: roundMoney(subtotal - off) };
}

export class DiscountTooHighError extends Error {
  constructor() {
    super('The discount is more than the sale');
  }
}

/**
 * Part of `quantity` sold without stock to cover it, given the stock before the sale:
 * everything when there was none (or it was already negative), the excess when there was some.
 */
export function shortageOf(stockBefore: number, quantity: number): number {
  const covered = Math.min(Math.max(stockBefore, 0), quantity);
  return roundQuantity(quantity - covered);
}

export class UnknownProductError extends Error {
  constructor(readonly productId: string) {
    super(`Unknown product ${productId}`);
  }
}

const formatQuantity = (quantity: number) =>
  Number.isInteger(quantity) ? String(quantity) : String(quantity).replace('.', ',');

/**
 * One-line description of what was taken, for the receivable a credit sale creates
 * ("Arroz 5 kg ×2, Aceite 1 L"), cut to the column's 255 characters.
 */
export function summarizeItems(items: Array<{ description: string; quantity: number }>): string {
  const text = items
    .map((item) =>
      item.quantity === 1
        ? item.description
        : `${item.description} ×${formatQuantity(item.quantity)}`,
    )
    .join(', ');
  return text.length <= 255 ? text : `${text.slice(0, 252).trimEnd()}...`;
}

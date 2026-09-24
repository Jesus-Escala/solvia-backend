import { roundMoney } from '../lib/money';

export interface SaleLineInput {
  productId: string;
  quantity: number;
  /** Price actually charged; defaults to the product's price. */
  unitPrice?: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  trackStock: boolean;
}

export interface PricedLine {
  productId: string;
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
 * into one line when charged at the same price. Throws with the id of an unknown product.
 */
export function priceSale(
  lines: SaleLineInput[],
  products: Map<string, CatalogProduct>,
): { items: PricedLine[]; total: number } {
  const merged = new Map<string, PricedLine>();
  for (const line of lines) {
    const product = products.get(line.productId);
    if (!product) throw new UnknownProductError(line.productId);
    const unitPrice = roundMoney(line.unitPrice ?? product.price);
    const key = `${product.id}@${unitPrice}`;
    const existing = merged.get(key);
    const quantity = roundQuantity((existing?.quantity ?? 0) + line.quantity);
    merged.set(key, {
      productId: product.id,
      description: product.name,
      quantity,
      unitPrice,
      subtotal: roundMoney(quantity * unitPrice),
      trackStock: product.trackStock,
    });
  }
  const items = [...merged.values()];
  return { items, total: roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0)) };
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

import type { AdjustmentReason } from '@prisma/client';
import { roundQuantity } from './sales';

/**
 * Stock change of a manual adjustment:
 * - `count`: `quantity` is what was counted, so the change is counted − current stock;
 * - `loss` / `damage`: `quantity` units leave (negative change);
 * - `correction`: `quantity` is the signed change itself.
 */
export function adjustmentDelta(
  reason: AdjustmentReason,
  quantity: number,
  currentStock: number,
): number {
  switch (reason) {
    case 'count':
      return roundQuantity(quantity - currentStock);
    case 'loss':
    case 'damage':
      return roundQuantity(-Math.abs(quantity));
    case 'correction':
      return roundQuantity(quantity);
  }
}

/** Whether a counted product is at or below its alert level (0 when none is set). */
export function isLowStock(product: {
  trackStock: boolean;
  stock: number;
  minStock: number | null;
}): boolean {
  return product.trackStock && product.stock <= (product.minStock ?? 0);
}

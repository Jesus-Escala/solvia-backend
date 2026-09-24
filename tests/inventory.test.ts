import { describe, expect, it } from 'vitest';
import { adjustmentDelta, isLowStock } from '../src/domain/inventory';
import {
  adjustStockSchema,
  createPurchaseSchema,
  createSupplierSchema,
} from '../src/validators/inventory.schemas';

const PRODUCT = '11111111-1111-4111-8111-111111111111';

describe('adjustmentDelta', () => {
  it('turns a physical count into the difference with the system', () => {
    expect(adjustmentDelta('count', 10, 12)).toBe(-2);
    expect(adjustmentDelta('count', 5, -3)).toBe(8);
    expect(adjustmentDelta('count', 4, 4)).toBe(0);
    expect(adjustmentDelta('count', 1.25, 1)).toBe(0.25);
  });

  it('takes losses and damage out, and applies corrections as they come', () => {
    expect(adjustmentDelta('loss', 3, 10)).toBe(-3);
    expect(adjustmentDelta('damage', 0.5, 10)).toBe(-0.5);
    expect(adjustmentDelta('correction', -2, 10)).toBe(-2);
    expect(adjustmentDelta('correction', 4, 10)).toBe(4);
  });
});

describe('isLowStock', () => {
  it('compares counted products with their alert level (0 without one)', () => {
    expect(isLowStock({ trackStock: true, stock: 5, minStock: 5 })).toBe(true);
    expect(isLowStock({ trackStock: true, stock: 6, minStock: 5 })).toBe(false);
    expect(isLowStock({ trackStock: true, stock: 0, minStock: null })).toBe(true);
    expect(isLowStock({ trackStock: true, stock: 1, minStock: null })).toBe(false);
    expect(isLowStock({ trackStock: false, stock: -9, minStock: 5 })).toBe(false);
  });
});

describe('inventory schemas', () => {
  it('validates the quantity of each kind of adjustment', () => {
    expect(adjustStockSchema.safeParse({ reason: 'count', quantity: 0 }).success).toBe(true);
    expect(adjustStockSchema.safeParse({ reason: 'count', quantity: -1 }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ reason: 'loss', quantity: 0 }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ reason: 'correction', quantity: 0 }).success).toBe(false);
    expect(adjustStockSchema.parse({ reason: 'damage', quantity: 2, note: '' })).toEqual({
      reason: 'damage',
      quantity: 2,
      note: null,
    });
  });

  it('updates costs by default and needs products with a positive quantity', () => {
    expect(
      createPurchaseSchema.parse({ items: [{ productId: PRODUCT, quantity: 12, unitCost: 3.5 }] }),
    ).toMatchObject({ updateCosts: true, docType: 'none' });
    expect(createPurchaseSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      createPurchaseSchema.safeParse({ items: [{ productId: PRODUCT, quantity: 0, unitCost: 1 }] })
        .success,
    ).toBe(false);
  });

  it('keeps supplier phone and RUC optional', () => {
    expect(createSupplierSchema.parse({ name: 'Distribuidora Norte', phone: '' })).toEqual({
      name: 'Distribuidora Norte',
      phone: null,
    });
    expect(() => createSupplierSchema.parse({ name: 'Proveedor X', phone: '12' })).toThrow();
  });
});

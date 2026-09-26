import { describe, expect, it } from 'vitest';
import { mainMethod, mergeParts, partsMatch, sumParts } from '../src/domain/payments';
import { createPurchaseSchema } from '../src/validators/inventory.schemas';
import { createPaymentSchema } from '../src/validators/receivable.schemas';
import { createSaleSchema } from '../src/validators/sale.schemas';

const PRODUCT = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '33333333-3333-4333-8333-333333333333';
const items = [{ productId: PRODUCT, quantity: 1 }];

describe('payment parts', () => {
  it('keeps one part per method, in order, without empty ones', () => {
    expect(
      mergeParts([
        { method: 'cash', amount: 10.1 },
        { method: 'yape', amount: 5 },
        { method: 'cash', amount: 4.2 },
        { method: 'plin', amount: 0 },
      ]),
    ).toEqual([
      { method: 'cash', amount: 14.3 },
      { method: 'yape', amount: 5 },
    ]);
  });

  it('adds up to the cent and picks the method that brought the most', () => {
    const parts = mergeParts([
      { method: 'yape', amount: 20.1 },
      { method: 'cash', amount: 29.9 },
    ]);
    expect(sumParts(parts)).toBe(50);
    expect(partsMatch(parts, 50)).toBe(true);
    expect(partsMatch(parts, 50.01)).toBe(false);
    expect(mainMethod(parts)).toBe('cash');
    expect(mainMethod([])).toBeNull();
  });
});

describe('split payment schemas', () => {
  it('takes a cash sale with one method or with several', () => {
    expect(createSaleSchema.parse({ paymentType: 'cash', method: 'cash', items })).toMatchObject({
      method: 'cash',
    });
    expect(
      createSaleSchema.parse({
        paymentType: 'cash',
        items,
        payments: [
          { method: 'cash', amount: 30 },
          { method: 'yape', amount: '20' },
        ],
      }).payments,
    ).toEqual([
      { method: 'cash', amount: 30 },
      { method: 'yape', amount: 20 },
    ]);
    expect(() => createSaleSchema.parse({ paymentType: 'cash', items })).toThrow();
    expect(() => createSaleSchema.parse({ paymentType: 'cash', items, payments: [] })).toThrow();
  });

  it('keeps each list where it belongs', () => {
    const credit = { paymentType: 'credit', customerId: CUSTOMER, dueDate: '2026-10-30', items };
    expect(
      createSaleSchema.parse({
        ...credit,
        downPayments: [
          { method: 'cash', amount: 5 },
          { method: 'plin', amount: 5 },
        ],
      }).downPayments,
    ).toHaveLength(2);
    expect(() =>
      createSaleSchema.parse({ ...credit, payments: [{ method: 'cash', amount: 5 }] }),
    ).toThrow();
    expect(() =>
      createSaleSchema.parse({
        paymentType: 'cash',
        method: 'cash',
        items,
        downPayments: [{ method: 'cash', amount: 5 }],
      }),
    ).toThrow();
  });

  it('takes at most 4 parts of positive amounts', () => {
    const part = { method: 'cash', amount: 1 };
    expect(() =>
      createSaleSchema.parse({ paymentType: 'cash', items, payments: Array(5).fill(part) }),
    ).toThrow();
    expect(() =>
      createSaleSchema.parse({
        paymentType: 'cash',
        items,
        payments: [{ method: 'cash', amount: 0 }],
      }),
    ).toThrow();
  });

  it('records a receivable payment with one method or with parts, also from a form', () => {
    expect(createPaymentSchema.parse({ amount: 10, method: 'yape' })).toMatchObject({
      amount: 10,
      method: 'yape',
    });
    expect(
      createPaymentSchema.parse({
        parts: JSON.stringify([
          { method: 'cash', amount: 6 },
          { method: 'yape', amount: 4 },
        ]),
      }).parts,
    ).toEqual([
      { method: 'cash', amount: 6 },
      { method: 'yape', amount: 4 },
    ]);
    expect(() => createPaymentSchema.parse({ amount: 10 })).toThrow();
    expect(() => createPaymentSchema.parse({ parts: 'not json' })).toThrow();
  });

  it('lets a purchase say how it was paid, or not', () => {
    const purchase = { items: [{ productId: PRODUCT, quantity: 2, unitCost: 3 }] };
    expect(createPurchaseSchema.parse(purchase).payments).toBeUndefined();
    expect(
      createPurchaseSchema.parse({
        ...purchase,
        payments: [
          { method: 'bank_transfer', amount: 4 },
          { method: 'cash', amount: 2 },
        ],
      }).payments,
    ).toHaveLength(2);
  });
});

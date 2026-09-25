import { describe, expect, it } from 'vitest';
import {
  DiscountTooHighError,
  priceSale,
  shortageOf,
  summarizeItems,
  UnknownProductError,
} from '../src/domain/sales';
import { createSaleSchema } from '../src/validators/sale.schemas';

const RICE = '11111111-1111-4111-8111-111111111111';
const OIL = '22222222-2222-4222-8222-222222222222';
const BREAD = '33333333-3333-4333-8333-333333333333';

const catalog = new Map([
  [RICE, { id: RICE, name: 'Arroz 5 kg', price: 24.5, trackStock: true }],
  [OIL, { id: OIL, name: 'Aceite 1 L', price: 11.9, trackStock: true }],
  [BREAD, { id: BREAD, name: 'Pan', price: 0.3, trackStock: false }],
]);

describe('priceSale', () => {
  it('prices lines from the catalog and totals them without float noise', () => {
    const { items, total } = priceSale(
      [
        { productId: RICE, quantity: 2 },
        { productId: BREAD, quantity: 7 },
        { productId: OIL, quantity: 1, unitPrice: 11 },
      ],
      catalog,
    );
    expect(items).toEqual([
      {
        productId: RICE,
        description: 'Arroz 5 kg',
        quantity: 2,
        unitPrice: 24.5,
        subtotal: 49,
        trackStock: true,
      },
      {
        productId: BREAD,
        description: 'Pan',
        quantity: 7,
        unitPrice: 0.3,
        subtotal: 2.1,
        trackStock: false,
      },
      {
        productId: OIL,
        description: 'Aceite 1 L',
        quantity: 1,
        unitPrice: 11,
        subtotal: 11,
        trackStock: true,
      },
    ]);
    expect(total).toBe(62.1);
  });

  it('merges the same product at the same price, keeps different prices apart', () => {
    const { items } = priceSale(
      [
        { productId: RICE, quantity: 1 },
        { productId: RICE, quantity: 1.5 },
        { productId: RICE, quantity: 1, unitPrice: 20 },
      ],
      catalog,
    );
    expect(items.map((item) => [item.quantity, item.unitPrice, item.subtotal])).toEqual([
      [2.5, 24.5, 61.25],
      [1, 20, 20],
    ]);
  });

  it('keeps free lines (services, things not in the catalog) out of stock', () => {
    const { items, total } = priceSale(
      [
        { description: 'Instalación', quantity: 1, unitPrice: 35 },
        { description: 'instalación ', quantity: 1, unitPrice: 35 },
        { productId: RICE, quantity: 1 },
      ],
      catalog,
    );
    expect(items[0]).toEqual({
      productId: null,
      description: 'Instalación',
      quantity: 2,
      unitPrice: 35,
      subtotal: 70,
      trackStock: false,
    });
    expect(total).toBe(94.5);
  });

  it('takes the discount off the sum of the lines, never more than it', () => {
    expect(priceSale([{ productId: RICE, quantity: 2 }], catalog, 4)).toMatchObject({
      subtotal: 49,
      discount: 4,
      total: 45,
    });
    expect(() => priceSale([{ productId: RICE, quantity: 1 }], catalog, 30)).toThrow(
      DiscountTooHighError,
    );
  });

  it('rejects a product outside the catalog', () => {
    expect(() => priceSale([{ productId: 'other', quantity: 1 }], catalog)).toThrow(
      UnknownProductError,
    );
  });
});

describe('summarizeItems', () => {
  it('lists what was taken, with quantities other than one', () => {
    expect(
      summarizeItems([
        { description: 'Arroz 5 kg', quantity: 2 },
        { description: 'Aceite 1 L', quantity: 1 },
        { description: 'Azúcar', quantity: 1.5 },
      ]),
    ).toBe('Arroz 5 kg ×2, Aceite 1 L, Azúcar ×1,5');
  });

  it('fits the 255 characters of a receivable description', () => {
    const text = summarizeItems(
      Array.from({ length: 40 }, (_, index) => ({ description: `Producto ${index}`, quantity: 1 })),
    );
    expect(text.length).toBeLessThanOrEqual(255);
    expect(text.endsWith('...')).toBe(true);
  });
});

describe('createSaleSchema', () => {
  const item = { productId: RICE, quantity: 1 };

  it('asks how a cash sale was paid', () => {
    expect(() => createSaleSchema.parse({ paymentType: 'cash', items: [item] })).toThrow(
      /How was it paid/,
    );
    expect(
      createSaleSchema.parse({ paymentType: 'cash', method: 'yape', items: [item] }),
    ).toMatchObject({ docType: 'none' });
  });

  it('asks who owes a credit sale and when they pay', () => {
    const result = createSaleSchema.safeParse({ paymentType: 'credit', items: [item] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'customerId',
      'dueDate',
    ]);
  });

  it('asks the name and price of a free line', () => {
    const result = createSaleSchema.safeParse({
      paymentType: 'cash',
      method: 'cash',
      items: [{ quantity: 1 }],
    });
    expect(result.error?.issues.map((issue) => issue.path.at(-1)).sort()).toEqual([
      'description',
      'unitPrice',
    ]);
    expect(
      createSaleSchema.parse({
        paymentType: 'cash',
        method: 'cash',
        items: [{ description: 'Delivery', quantity: 1, unitPrice: 5 }],
        notes: ' ',
      }),
    ).toMatchObject({ discount: 0, notes: null });
  });

  it('takes a down payment only on credit, with how it was paid', () => {
    const credit = {
      paymentType: 'credit',
      customerId: RICE,
      dueDate: '2026-10-30',
      items: [item],
    };
    expect(() => createSaleSchema.parse({ ...credit, downPayment: 10 })).toThrow(/How was it paid/);
    expect(
      createSaleSchema.parse({ ...credit, downPayment: 10, downPaymentMethod: 'yape' }),
    ).toMatchObject({ downPayment: 10 });
    expect(() =>
      createSaleSchema.parse({
        paymentType: 'cash',
        method: 'cash',
        items: [item],
        downPayment: 5,
        downPaymentMethod: 'cash',
      }),
    ).toThrow(/Only for credit/);
  });

  it('needs at least one product with a positive quantity', () => {
    expect(() =>
      createSaleSchema.parse({ paymentType: 'cash', method: 'cash', items: [] }),
    ).toThrow();
    expect(() =>
      createSaleSchema.parse({
        paymentType: 'cash',
        method: 'cash',
        items: [{ productId: RICE, quantity: 0 }],
      }),
    ).toThrow();
  });
});

describe('shortageOf', () => {
  it('is zero with enough stock, the excess with some, everything with none', () => {
    expect(shortageOf(10, 3)).toBe(0);
    expect(shortageOf(3, 3)).toBe(0);
    expect(shortageOf(2, 5)).toBe(3);
    expect(shortageOf(0, 4)).toBe(4);
    expect(shortageOf(-2, 1.5)).toBe(1.5);
    expect(shortageOf(0.4, 1)).toBe(0.6);
  });
});

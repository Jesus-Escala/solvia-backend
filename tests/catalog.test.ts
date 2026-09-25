import { describe, expect, it } from 'vitest';
import { hasModule } from '../src/domain/modules';
import { nextInternalCode } from '../src/domain/productCode';
import { updateTenantSchema } from '../src/validators/platform.schemas';
import {
  createProductSchema,
  productLookupQuerySchema,
  listProductsQuerySchema,
  updateProductSchema,
} from '../src/validators/product.schemas';

describe('tenant modules', () => {
  it('opens the catalog with any module and each module on its own', () => {
    expect(hasModule([], 'catalog')).toBe(false);
    expect(hasModule(['sales'], 'catalog')).toBe(true);
    expect(hasModule(['inventory'], 'catalog')).toBe(true);
    expect(hasModule(['sales'], 'inventory')).toBe(false);
    expect(hasModule(['sales', 'inventory'], 'inventory')).toBe(true);
    expect(hasModule(['collections'], 'catalog')).toBe(false);
    expect(hasModule(['collections'], 'customers')).toBe(true);
    expect(hasModule(['sales'], 'customers')).toBe(true);
    expect(hasModule(['inventory'], 'customers')).toBe(false);
    expect(hasModule(['sales', 'inventory'], 'collections')).toBe(false);
  });

  it('lets the backoffice replace the module list, without duplicates', () => {
    expect(updateTenantSchema.parse({ modules: ['sales', 'sales'] })).toEqual({
      modules: ['sales'],
    });
    expect(updateTenantSchema.parse({ modules: ['inventory'] })).toEqual({
      modules: ['inventory'],
    });
    expect(() => updateTenantSchema.parse({ modules: [] })).toThrow();
    expect(() => updateTenantSchema.parse({ modules: ['accounting'] })).toThrow();
    expect(() => updateTenantSchema.parse({})).toThrow();
  });
});

describe('product schemas', () => {
  it('numbers internal codes after the highest one, in the in-store range', () => {
    expect(nextInternalCode(null)).toBe('20000001');
    expect(nextInternalCode('20000041')).toBe('20000042');
    expect(nextInternalCode('7750000000017')).toBe('20000001');
  });

  it('takes products and services, products by default', () => {
    expect(createProductSchema.parse({ name: 'Arroz', price: 4 })).toMatchObject({
      kind: 'product',
    });
    expect(
      createProductSchema.parse({ name: 'Instalación', price: 30, kind: 'service' }),
    ).toMatchObject({
      kind: 'service',
    });
    expect(() => createProductSchema.parse({ name: 'Otro', price: 1, kind: 'bundle' })).toThrow();
  });

  it('serves the point-of-sale catalog by best sellers, up to 60', () => {
    expect(productLookupQuerySchema.parse({})).toEqual({ search: '', limit: 8, sort: 'relevance' });
    expect(productLookupQuerySchema.parse({ limit: '48', sort: 'popular' })).toMatchObject({
      limit: 48,
      sort: 'popular',
    });
    expect(() => productLookupQuerySchema.parse({ limit: 61 })).toThrow();
  });

  it('applies defaults and turns an empty code into null', () => {
    expect(createProductSchema.parse({ name: ' Arroz 5 kg ', price: '24.5', code: '' })).toEqual({
      kind: 'product',
      name: 'Arroz 5 kg',
      price: 24.5,
      code: null,
      unit: 'unit',
      trackStock: true,
    });
  });

  it('rejects a zero price, 3-decimal money and 4-decimal quantities', () => {
    expect(() => createProductSchema.parse({ name: 'Pan', price: 0 })).toThrow();
    expect(() => createProductSchema.parse({ name: 'Pan', price: 1.005 })).toThrow();
    expect(() => createProductSchema.parse({ name: 'Pan', price: 1, minStock: 1.0005 })).toThrow();
    expect(
      createProductSchema.parse({ name: 'Queso', price: 30, unit: 'kg', minStock: 2.5 }),
    ).toMatchObject({ unit: 'kg', minStock: 2.5 });
  });

  it('takes the size of the sack it is bought in', () => {
    expect(
      createProductSchema.parse({ name: 'Arroz', price: 4.5, unit: 'kg', packSize: '50' }),
    ).toMatchObject({ unit: 'kg', packSize: 50 });
    expect(updateProductSchema.parse({ packSize: null })).toEqual({ packSize: null });
    expect(() => createProductSchema.parse({ name: 'Arroz', price: 4.5, packSize: 0 })).toThrow();
  });

  it('allows archiving alone and requires at least one field', () => {
    expect(updateProductSchema.parse({ active: false })).toEqual({ active: false });
    expect(() => updateProductSchema.parse({})).toThrow();
  });

  it('lists active products by name by default', () => {
    expect(listProductsQuerySchema.parse({})).toMatchObject({
      status: 'active',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      pageSize: 20,
    });
  });
});

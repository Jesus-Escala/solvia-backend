import { describe, expect, it } from 'vitest';
import { hasModule } from '../src/domain/modules';
import { updateTenantSchema } from '../src/validators/platform.schemas';
import {
  createProductSchema,
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
  });

  it('lets the backoffice replace the module list, without duplicates', () => {
    expect(updateTenantSchema.parse({ modules: ['sales', 'sales'] })).toEqual({
      modules: ['sales'],
    });
    expect(updateTenantSchema.parse({ modules: [] })).toEqual({ modules: [] });
    expect(() => updateTenantSchema.parse({ modules: ['accounting'] })).toThrow();
    expect(() => updateTenantSchema.parse({})).toThrow();
  });
});

describe('product schemas', () => {
  it('applies defaults and turns an empty code into null', () => {
    expect(createProductSchema.parse({ name: ' Arroz 5 kg ', price: '24.5', code: '' })).toEqual({
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

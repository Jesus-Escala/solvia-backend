import { describe, expect, it } from 'vitest';
import {
  mapImageSchema,
  mapSchema,
  spotProductsSchema,
  spotSchema,
  updateMapSchema,
  updateSpotSchema,
} from '../src/validators/map.schemas';
import { createProductSchema, updateProductSchema } from '../src/validators/product.schemas';

const id = '33333333-3333-4333-8333-333333333333';

describe('floor plan schemas', () => {
  it('takes a named plan and its picture shape', () => {
    expect(mapSchema.parse({ name: '  Tienda ' })).toEqual({ name: 'Tienda', aspect: 1.5 });
    expect(mapSchema.parse({ name: 'Almacén', aspect: 2.2 })).toEqual({
      name: 'Almacén',
      aspect: 2.2,
    });
    expect(updateMapSchema.parse({ aspect: 1 })).toEqual({ aspect: 1 });
    expect(() => mapSchema.parse({ name: '' })).toThrow();
    expect(mapImageSchema.parse({ aspect: '1.25' })).toEqual({ aspect: 1.25 });
    expect(mapImageSchema.parse({})).toEqual({ aspect: 1.5 });
    expect(() => mapImageSchema.parse({ aspect: 40 })).toThrow();
    expect(() => updateMapSchema.parse({})).toThrow();
  });

  it('places spots inside the plan, with a theme color', () => {
    expect(spotSchema.parse({ name: 'Estante A', x: 0.2, y: '0.8' })).toEqual({
      name: 'Estante A',
      x: 0.2,
      y: 0.8,
      w: 0.1,
      h: 0.08,
      color: 'primary',
    });
    expect(spotSchema.parse({ name: 'Góndola', x: 0.5, y: 0.5, w: 0.3, h: '0.2' })).toMatchObject({
      w: 0.3,
      h: 0.2,
    });
    expect(() => spotSchema.parse({ name: 'Punto', x: 0.5, y: 0.5, w: 0 })).toThrow();
    expect(() => spotSchema.parse({ name: 'Fuera', x: 1.2, y: 0.5 })).toThrow();
    expect(() => spotSchema.parse({ name: 'Rojo', x: 0, y: 0, color: '#f00' })).toThrow();
    expect(() => spotSchema.parse({ name: 'Rojo', x: 0, y: 0, color: 'red' })).toThrow();
    expect(spotSchema.parse({ name: 'Rosa', x: 0, y: 0, color: '#EC4899' })).toMatchObject({
      color: '#ec4899',
    });
    expect(updateSpotSchema.parse({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
    expect(() => updateSpotSchema.parse({})).toThrow();
  });

  it('puts products in a spot and in the product form', () => {
    expect(spotProductsSchema.parse({ productIds: [id] })).toEqual({ productIds: [id] });
    expect(() => spotProductsSchema.parse({ productIds: [] })).toThrow();
    expect(createProductSchema.parse({ name: 'Arroz', price: 4, spotId: id })).toMatchObject({
      spotId: id,
    });
    expect(updateProductSchema.parse({ spotId: null })).toEqual({ spotId: null });
  });
});

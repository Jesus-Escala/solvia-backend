import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';

/** What a spot shows of each product kept there. */
const spotProductSelect = {
  id: true,
  name: true,
  code: true,
  imageUrl: true,
  unit: true,
  trackStock: true,
  stock: true,
} as const;

export const mapInclude = {
  spots: {
    orderBy: { name: 'asc' },
    include: {
      products: { where: { active: true }, orderBy: { name: 'asc' }, select: spotProductSelect },
    },
  },
} as const satisfies Prisma.StoreMapInclude;

export type MapWithSpots = Prisma.StoreMapGetPayload<{ include: typeof mapInclude }>;

export const mapRepository = {
  list() {
    return prisma.storeMap.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: mapInclude,
    });
  },

  findById(id: string) {
    return prisma.storeMap.findUnique({ where: { id }, include: mapInclude });
  },

  findByName(name: string) {
    return prisma.storeMap.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  },

  count() {
    return prisma.storeMap.count();
  },

  create(name: string, position: number) {
    return prisma.storeMap.create({
      data: { name, position, tenantId: requireTenantId() },
      include: mapInclude,
    });
  },

  update(id: string, data: Prisma.StoreMapUpdateInput) {
    return prisma.storeMap.update({ where: { id }, data, include: mapInclude });
  },

  /** Its spots go with it; their products stay, without a place. */
  delete(id: string) {
    return prisma.storeMap.delete({ where: { id } });
  },
};

export const spotRepository = {
  findById(id: string) {
    return prisma.mapSpot.findUnique({ where: { id } });
  },

  create(mapId: string, data: { name: string; x: number; y: number; color: string }) {
    return prisma.mapSpot.create({ data: { ...data, mapId, tenantId: requireTenantId() } });
  },

  update(id: string, data: Prisma.MapSpotUpdateInput) {
    return prisma.mapSpot.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.mapSpot.delete({ where: { id } });
  },

  /** Moves these products to the spot; returns how many of them are of the business. */
  async place(spotId: string, productIds: string[]) {
    const result = await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { spotId },
    });
    return result.count;
  },

  unplace(spotId: string, productId: string) {
    return prisma.product.updateMany({ where: { id: productId, spotId }, data: { spotId: null } });
  },
};

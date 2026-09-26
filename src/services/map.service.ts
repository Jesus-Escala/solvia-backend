import { AppError } from '../errors/AppError';
import { toNumber } from '../lib/money';
import { mapRepository, spotRepository, type MapWithSpots } from '../repositories/map.repository';
import { storageService } from './storage.service';
import type {
  MapInput,
  SpotInput,
  UpdateMapInput,
  UpdateSpotInput,
} from '../validators/map.schemas';

/** A business keeps a handful of plans (shop, storeroom, second floor…). */
export const MAX_MAPS = 10;
/** Spots on one plan: plenty for a shop, and the plan stays readable. */
export const MAX_SPOTS_PER_MAP = 150;

export function toMapDto(map: MapWithSpots) {
  return {
    id: map.id,
    name: map.name,
    imageUrl: map.imageUrl,
    aspect: map.aspect,
    position: map.position,
    spots: map.spots.map((spot) => ({
      id: spot.id,
      name: spot.name,
      x: spot.x,
      y: spot.y,
      w: spot.w,
      h: spot.h,
      color: spot.color,
      products: spot.products.map((product) => ({
        id: product.id,
        name: product.name,
        code: product.code,
        imageUrl: product.imageUrl,
        unit: product.unit,
        trackStock: product.trackStock,
        stock: toNumber(product.stock),
      })),
    })),
  };
}

const mapTaken = () => new AppError(409, 'MAP_NAME_TAKEN', 'Another plan already has this name');

async function assertNameAvailable(name: string, exceptId?: string) {
  const existing = await mapRepository.findByName(name);
  if (existing && existing.id !== exceptId) throw mapTaken();
}

async function findMap(id: string) {
  const map = await mapRepository.findById(id);
  if (!map) throw AppError.notFound('Plan');
  return map;
}

async function findSpot(id: string) {
  const spot = await spotRepository.findById(id);
  if (!spot) throw AppError.notFound('Spot');
  return spot;
}

/** Floor plans of the business with the spots where its products are kept (any business). */
export const mapService = {
  async list() {
    return (await mapRepository.list()).map(toMapDto);
  },

  async create(input: MapInput) {
    const count = await mapRepository.count();
    if (count >= MAX_MAPS) {
      throw new AppError(422, 'MAP_LIMIT_REACHED', `A business can keep up to ${MAX_MAPS} plans`);
    }
    await assertNameAvailable(input.name);
    return toMapDto(await mapRepository.create(input.name, input.aspect, count));
  },

  async update(id: string, input: UpdateMapInput) {
    await findMap(id);
    if (input.name) await assertNameAvailable(input.name, id);
    return toMapDto(await mapRepository.update(id, input));
  },

  async delete(id: string) {
    await findMap(id);
    await mapRepository.delete(id);
  },

  async setImage(id: string, file: { buffer: Buffer; mimetype: string }, aspect: number) {
    await findMap(id);
    const imageUrl = await storageService.saveMapImage(file.buffer, file.mimetype);
    return toMapDto(await mapRepository.update(id, { imageUrl, aspect }));
  },

  async removeImage(id: string) {
    await findMap(id);
    return toMapDto(await mapRepository.update(id, { imageUrl: null }));
  },

  async addSpot(mapId: string, input: SpotInput) {
    const map = await findMap(mapId);
    if (map.spots.length >= MAX_SPOTS_PER_MAP) {
      throw new AppError(
        422,
        'SPOT_LIMIT_REACHED',
        `A plan can have up to ${MAX_SPOTS_PER_MAP} spots`,
      );
    }
    await spotRepository.create(mapId, input);
    return toMapDto(await findMap(mapId));
  },

  async updateSpot(spotId: string, input: UpdateSpotInput) {
    const spot = await findSpot(spotId);
    await spotRepository.update(spotId, input);
    return toMapDto(await findMap(spot.mapId));
  },

  /** Its products stay, without a place. */
  async deleteSpot(spotId: string) {
    const spot = await findSpot(spotId);
    await spotRepository.delete(spotId);
    return toMapDto(await findMap(spot.mapId));
  },

  /** Puts products in the spot, taking them out of wherever they were. */
  async placeProducts(spotId: string, productIds: string[]) {
    const spot = await findSpot(spotId);
    const ids = [...new Set(productIds)];
    const placed = await spotRepository.place(spotId, ids);
    if (placed !== ids.length) throw AppError.notFound('Product');
    return toMapDto(await findMap(spot.mapId));
  },

  async unplaceProduct(spotId: string, productId: string) {
    const spot = await findSpot(spotId);
    await spotRepository.unplace(spotId, productId);
    return toMapDto(await findMap(spot.mapId));
  },
};

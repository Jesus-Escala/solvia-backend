import type { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { mapService } from '../services/map.service';
import { idParamSchema } from '../validators/common.schemas';
import {
  mapImageSchema,
  mapSchema,
  spotParamSchema,
  spotProductParamSchema,
  spotProductsSchema,
  spotSchema,
  updateMapSchema,
  updateSpotSchema,
} from '../validators/map.schemas';

export const mapController = {
  async list(_req: Request, res: Response) {
    res.json({ data: await mapService.list() });
  },

  async create(req: Request, res: Response) {
    res.status(201).json(await mapService.create(mapSchema.parse(req.body)));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await mapService.update(id, updateMapSchema.parse(req.body)));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await mapService.delete(id);
    res.status(204).send();
  },

  async setImage(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    if (!req.file) throw new AppError(400, 'IMAGE_REQUIRED', 'Send the picture in the image field');
    const { aspect } = mapImageSchema.parse(req.body ?? {});
    res.json(await mapService.setImage(id, req.file, aspect));
  },

  async removeImage(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await mapService.removeImage(id));
  },

  async addSpot(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.status(201).json(await mapService.addSpot(id, spotSchema.parse(req.body)));
  },

  async updateSpot(req: Request, res: Response) {
    const { spotId } = spotParamSchema.parse(req.params);
    res.json(await mapService.updateSpot(spotId, updateSpotSchema.parse(req.body)));
  },

  async removeSpot(req: Request, res: Response) {
    const { spotId } = spotParamSchema.parse(req.params);
    res.json(await mapService.deleteSpot(spotId));
  },

  async placeProducts(req: Request, res: Response) {
    const { spotId } = spotParamSchema.parse(req.params);
    const { productIds } = spotProductsSchema.parse(req.body);
    res.json(await mapService.placeProducts(spotId, productIds));
  },

  async unplaceProduct(req: Request, res: Response) {
    const { spotId, productId } = spotProductParamSchema.parse(req.params);
    res.json(await mapService.unplaceProduct(spotId, productId));
  },
};

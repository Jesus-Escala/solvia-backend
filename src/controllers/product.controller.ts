import type { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { getAuth } from '../middleware/tenantScope';
import { productService } from '../services/product.service';
import { adjustStockSchema } from '../validators/inventory.schemas';
import { idParamSchema, paginationSchema } from '../validators/common.schemas';
import {
  createProductSchema,
  listProductsQuerySchema,
  productLookupQuerySchema,
  updateProductSchema,
} from '../validators/product.schemas';

export const productController = {
  async list(req: Request, res: Response) {
    res.json(await productService.list(listProductsQuerySchema.parse(req.query)));
  },

  async lookup(req: Request, res: Response) {
    const { search, limit, sort } = productLookupQuerySchema.parse(req.query);
    res.json({ data: await productService.lookup(search, limit, sort) });
  },

  async get(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await productService.getById(id));
  },

  async movements(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await productService.movements(id, paginationSchema.parse(req.query)));
  },

  async adjust(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = adjustStockSchema.parse(req.body);
    res.json(await productService.adjust(id, input, getAuth(req).userId));
  },

  async create(req: Request, res: Response) {
    res.status(201).json(await productService.create(createProductSchema.parse(req.body)));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await productService.update(id, updateProductSchema.parse(req.body)));
  },

  async setImage(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    if (!req.file) throw new AppError(400, 'IMAGE_REQUIRED', 'Send the picture in the image field');
    res.json(await productService.setImage(id, req.file));
  },

  async removeImage(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await productService.removeImage(id));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await productService.delete(id);
    res.status(204).send();
  },
};

import type { Request, Response } from 'express';
import { productService } from '../services/product.service';
import { idParamSchema } from '../validators/common.schemas';
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from '../validators/product.schemas';

export const productController = {
  async list(req: Request, res: Response) {
    res.json(await productService.list(listProductsQuerySchema.parse(req.query)));
  },

  async get(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await productService.getById(id));
  },

  async create(req: Request, res: Response) {
    res.status(201).json(await productService.create(createProductSchema.parse(req.body)));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await productService.update(id, updateProductSchema.parse(req.body)));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await productService.delete(id);
    res.status(204).send();
  },
};

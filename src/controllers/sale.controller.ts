import type { Request, Response } from 'express';
import { getAuth } from '../middleware/tenantScope';
import { ticketService } from '../services/ticket.service';
import { saleService } from '../services/sale.service';
import { idParamSchema } from '../validators/common.schemas';
import { createSaleSchema, listSalesQuerySchema } from '../validators/sale.schemas';

export const saleController = {
  async list(req: Request, res: Response) {
    res.json(await saleService.list(listSalesQuerySchema.parse(req.query)));
  },

  async get(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await saleService.getById(id));
  },

  async ticket(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const { buffer, fileName } = await ticketService.salePdf(id);
    res
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `inline; filename="${fileName}"`)
      .send(buffer);
  },

  async create(req: Request, res: Response) {
    const input = createSaleSchema.parse(req.body);
    res.status(201).json(await saleService.create(input, getAuth(req).userId));
  },

  async void(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await saleService.void(id));
  },
};

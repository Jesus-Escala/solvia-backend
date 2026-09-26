import type { Request, Response } from 'express';
import { getAuth } from '../middleware/tenantScope';
import { purchaseService } from '../services/purchase.service';
import { supplierService } from '../services/supplier.service';
import { ticketService } from '../services/ticket.service';
import { idParamSchema, lookupQuerySchema } from '../validators/common.schemas';
import {
  createPurchaseSchema,
  createSupplierSchema,
  listPurchasesQuerySchema,
  listSuppliersQuerySchema,
  updateSupplierSchema,
} from '../validators/inventory.schemas';

export const supplierController = {
  async list(req: Request, res: Response) {
    res.json(await supplierService.list(listSuppliersQuerySchema.parse(req.query)));
  },

  async lookup(req: Request, res: Response) {
    const { search, limit } = lookupQuerySchema.parse(req.query);
    res.json({ data: await supplierService.lookup(search, limit) });
  },

  async create(req: Request, res: Response) {
    res.status(201).json(await supplierService.create(createSupplierSchema.parse(req.body)));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await supplierService.update(id, updateSupplierSchema.parse(req.body)));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await supplierService.delete(id);
    res.status(204).send();
  },
};

export const purchaseController = {
  async list(req: Request, res: Response) {
    res.json(await purchaseService.list(listPurchasesQuerySchema.parse(req.query)));
  },

  async get(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await purchaseService.getById(id));
  },

  /** The purchase as an 80 mm PDF (like a sale ticket), sent inline to preview it. */
  async ticket(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const { buffer, fileName } = await ticketService.purchasePdf(id);
    res
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `inline; filename="${fileName}"`)
      .send(buffer);
  },

  async create(req: Request, res: Response) {
    const input = createPurchaseSchema.parse(req.body);
    res.status(201).json(await purchaseService.create(input, getAuth(req).userId));
  },

  async void(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await purchaseService.void(id, getAuth(req).userId));
  },
};

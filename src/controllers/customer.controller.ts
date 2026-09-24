import type { Request, Response } from 'express';
import { customerService } from '../services/customer.service';
import { statementService } from '../services/statement.service';
import { idParamSchema, lookupQuerySchema } from '../validators/common.schemas';
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from '../validators/customer.schemas';

export const customerController = {
  async list(req: Request, res: Response) {
    const query = listCustomersQuerySchema.parse(req.query);
    res.json(await customerService.list(query));
  },

  async lookup(req: Request, res: Response) {
    const { search, limit } = lookupQuerySchema.parse(req.query);
    res.json({ data: await customerService.lookup(search, limit) });
  },

  async get(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await customerService.getById(id));
  },

  async create(req: Request, res: Response) {
    const input = createCustomerSchema.parse(req.body);
    res.status(201).json(await customerService.create(input));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = updateCustomerSchema.parse(req.body);
    res.json(await customerService.update(id, input));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await customerService.delete(id);
    res.status(204).send();
  },

  async risk(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await customerService.getRisk(id));
  },

  async downloadStatement(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const { buffer, fileName } = await statementService.generatePdf(id);
    res
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `inline; filename="${fileName}"`)
      .send(buffer);
  },

  async sendStatement(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.status(201).json(await statementService.sendStatement(id));
  },
};

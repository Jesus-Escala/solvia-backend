import type { Request, Response } from 'express';
import { paymentService } from '../services/payment.service';
import { receivableService } from '../services/receivable.service';
import { reminderService } from '../services/reminder.service';
import { idParamSchema } from '../validators/common.schemas';
import {
  createPaymentSchema,
  createReceivableSchema,
  listReceivablesQuerySchema,
  updateReceivableSchema,
} from '../validators/receivable.schemas';

export const receivableController = {
  async list(req: Request, res: Response) {
    const query = listReceivablesQuerySchema.parse(req.query);
    res.json(await receivableService.list(query));
  },

  async get(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await receivableService.getById(id));
  },

  async create(req: Request, res: Response) {
    const input = createReceivableSchema.parse(req.body);
    res.status(201).json(await receivableService.create(input));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = updateReceivableSchema.parse(req.body);
    res.json(await receivableService.update(id, input));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await receivableService.delete(id);
    res.status(204).send();
  },

  async listPayments(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json({ data: await paymentService.listByReceivable(id) });
  },

  async registerPayment(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = createPaymentSchema.parse(req.body ?? {});
    const proof = req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype } : undefined;
    res.status(201).json(await paymentService.register(id, input, proof));
  },

  async createPaymentLink(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.status(201).json(await receivableService.createPaymentLink(id));
  },

  async sendReminder(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.status(201).json(await reminderService.sendNow(id));
  },
};

import type { Request, Response } from 'express';
import { env } from '../config/env';
import { todayInTimezone } from '../lib/dates';
import { reportService } from '../services/report.service';
import { reportRangeSchema } from '../validators/report.schemas';

const rangeOf = (req: Request) =>
  reportRangeSchema(todayInTimezone(env.APP_TIMEZONE)).parse(req.query);

export const reportController = {
  async salesByCustomer(req: Request, res: Response) {
    res.json(await reportService.salesByCustomer(rangeOf(req)));
  },

  async collectionsByCustomer(req: Request, res: Response) {
    res.json(await reportService.collectionsByCustomer(rangeOf(req)));
  },

  async salesByProduct(req: Request, res: Response) {
    res.json(await reportService.salesByProduct(rangeOf(req)));
  },

  async stock(_req: Request, res: Response) {
    res.json(await reportService.stock());
  },

  async shortages(req: Request, res: Response) {
    res.json(await reportService.shortages(rangeOf(req)));
  },
};

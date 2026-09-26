import type { Request, Response } from 'express';
import { env } from '../config/env';
import { todayInTimezone } from '../lib/dates';
import { reportExportService } from '../services/reportExport.service';
import { insightsService } from '../services/insights.service';
import { reportService } from '../services/report.service';
import {
  exportFormatSchema,
  exportParamsSchema,
  reportRangeSchema,
  tableParamsSchema,
} from '../validators/report.schemas';

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

  /** A self-describing report: columns, rows, totals and headline figures, in the request language. */
  async table(req: Request, res: Response) {
    const { report } = tableParamsSchema.parse(req.params);
    res.json(await insightsService.layout(report, rangeOf(req)));
  },

  async salesDashboard(req: Request, res: Response) {
    res.json(await insightsService.sales(rangeOf(req)));
  },

  async purchasesDashboard(req: Request, res: Response) {
    res.json(await insightsService.purchases(rangeOf(req)));
  },

  /** The report as a file (`xlsx` or `pdf`), sent inline so the app can preview it. */
  async export(req: Request, res: Response) {
    const { report } = exportParamsSchema.parse(req.params);
    const { format } = exportFormatSchema.parse(req.query);
    const { buffer, fileName, contentType } = await reportExportService.export(
      report,
      rangeOf(req),
      format,
    );
    res
      .status(200)
      .setHeader('Content-Type', contentType)
      .setHeader('Content-Disposition', `inline; filename="${fileName}"`)
      .send(buffer);
  },
};

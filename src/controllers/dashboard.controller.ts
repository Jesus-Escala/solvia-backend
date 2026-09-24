import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { todayInTimezone } from '../lib/dates';
import { dashboardService } from '../services/dashboard.service';
import { monthlyReportService } from '../services/monthlyReport.service';
import { notificationService } from '../services/notification.service';
import { reminderService } from '../services/reminder.service';
import { analyticsQuerySchema } from '../validators/analytics.schemas';
import { paginationSchema } from '../validators/common.schemas';
import {
  cashFlowQuerySchema,
  concentrationQuerySchema,
  generateReportSchema,
  reportPeriodParamSchema,
} from '../validators/settings.schemas';

const notificationsQuerySchema = paginationSchema.extend({
  receivableId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  status: z.enum(['sent', 'failed']).optional(),
});

export const dashboardController = {
  async summary(_req: Request, res: Response) {
    res.json(await dashboardService.summary());
  },

  async cashFlow(req: Request, res: Response) {
    const { groupBy, periods } = cashFlowQuerySchema.parse(req.query);
    res.json(await dashboardService.cashFlow(groupBy, periods));
  },

  async analytics(req: Request, res: Response) {
    const period = analyticsQuerySchema(todayInTimezone(env.APP_TIMEZONE)).parse(req.query);
    res.json(await dashboardService.analytics(period));
  },

  async concentration(req: Request, res: Response) {
    const { limit } = concentrationQuerySchema.parse(req.query);
    res.json(await dashboardService.concentration(limit));
  },

  async listReports(_req: Request, res: Response) {
    res.json({ data: await monthlyReportService.list() });
  },

  async getReport(req: Request, res: Response) {
    const { period } = reportPeriodParamSchema.parse(req.params);
    res.json(await monthlyReportService.getByPeriod(period));
  },

  async generateReport(req: Request, res: Response) {
    const { period } = generateReportSchema.parse(req.body ?? {});
    const referenceDate = period ? monthlyReportService.periodToDate(period) : undefined;
    res.status(201).json(await monthlyReportService.generateForCurrentTenant(referenceDate));
  },

  async listNotifications(req: Request, res: Response) {
    const { receivableId, customerId, status, ...pagination } = notificationsQuerySchema.parse(
      req.query,
    );
    res.json(await notificationService.list({ receivableId, customerId, status }, pagination));
  },

  async runReminders(_req: Request, res: Response) {
    res.json(await reminderService.runForCurrentTenant());
  },
};

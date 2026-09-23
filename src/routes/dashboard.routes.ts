import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { requireRole } from '../middleware/authenticate';

export const dashboardRouter = Router();

/**
 * @openapi
 * /dashboard/summary:
 *   get:
 *     tags: [Dashboard]
 *     summary: Collections summary, status breakdown, overdue alerts and latest monthly report
 *     responses:
 *       200: { description: Summary }
 * /dashboard/cash-flow:
 *   get:
 *     tags: [Dashboard]
 *     summary: Projected cash flow of pending receivables grouped by due date
 *     parameters:
 *       - { in: query, name: groupBy, schema: { type: string, enum: [week, month], default: week } }
 *       - { in: query, name: periods, schema: { type: integer, minimum: 1, maximum: 24, default: 8 } }
 *     responses:
 *       200:
 *         description: Projection
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CashFlow' }
 * /dashboard/analytics:
 *   get:
 *     tags: [Dashboard]
 *     summary: Period analytics (KPIs vs the previous period, series, breakdowns, top payers)
 *     description: >
 *       Aggregated in SQL. The previous period is the same number of days immediately before
 *       `from`. Defaults to the current month to date. Ranges longer than 3 years or with
 *       `from` after `to` are rejected with `VALIDATION_ERROR`.
 *     parameters:
 *       - { in: query, name: from, schema: { type: string, format: date }, description: 'Inclusive (YYYY-MM-DD). Default: first day of the month of `to`' }
 *       - { in: query, name: to, schema: { type: string, format: date }, description: 'Inclusive (YYYY-MM-DD). Default: today (APP_TIMEZONE)' }
 *       - in: query
 *         name: granularity
 *         schema: { type: string, enum: [day, week, month] }
 *         description: 'Default: day up to 31 days, ISO week up to 120 days, month beyond'
 *     responses:
 *       200:
 *         description: Analytics
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/DashboardAnalytics' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
dashboardRouter.get('/dashboard/summary', dashboardController.summary);
dashboardRouter.get('/dashboard/cash-flow', dashboardController.cashFlow);
dashboardRouter.get('/dashboard/analytics', dashboardController.analytics);

/**
 * @openapi
 * /reports/monthly:
 *   get:
 *     tags: [Reports]
 *     summary: Monthly reports (latest 12)
 *     responses:
 *       200: { description: Reports }
 * /reports/monthly/generate:
 *   post:
 *     tags: [Reports]
 *     summary: Generate or refresh a monthly report on demand (admin only)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               period: { type: string, example: '2026-09', description: Defaults to the current month }
 *     responses:
 *       201:
 *         description: Report
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MonthlyReport' }
 * /reports/monthly/{period}:
 *   get:
 *     tags: [Reports]
 *     summary: Monthly report for a period
 *     parameters:
 *       - { in: path, name: period, required: true, schema: { type: string, example: '2026-09' } }
 *     responses:
 *       200: { description: Report }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
dashboardRouter.get('/reports/monthly', dashboardController.listReports);
dashboardRouter.post(
  '/reports/monthly/generate',
  requireRole('admin'),
  dashboardController.generateReport,
);
dashboardRouter.get('/reports/monthly/:period', dashboardController.getReport);

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Reminders]
 *     summary: Message send log
 *     parameters:
 *       - { in: query, name: receivableId, schema: { type: string, format: uuid } }
 *       - { in: query, name: customerId, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string, enum: [sent, failed] } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/PageSize' }
 *     responses:
 *       200: { description: Notifications }
 * /reminders/run:
 *   post:
 *     tags: [Reminders]
 *     summary: Run the reminder engine now for the current tenant (admin only)
 *     description: The same logic the hourly job runs. Already-sent reminders are not repeated.
 *     responses:
 *       200: { description: Run summary }
 */
dashboardRouter.get('/notifications', dashboardController.listNotifications);
dashboardRouter.post('/reminders/run', requireRole('admin'), dashboardController.runReminders);

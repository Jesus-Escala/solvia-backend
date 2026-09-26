import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { reportController } from '../controllers/report.controller';
import { requireRole } from '../middleware/authenticate';
import { requireModule } from '../middleware/requireModule';

export const dashboardRouter = Router();

/** The dashboard, monthly reports, the send log and reminders are the Cobranza module. */
const collections = requireModule('collections');

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
 *       `from` after `to` are rejected with `VALIDATION_ERROR`. Cross-filters (`method`,
 *       `customerId`, `weekday`) apply to payment data; receivables and reminders only honour
 *       `customerId`; new customers and the snapshot ignore them. Each breakdown ignores its own
 *       dimension (`byMethod` ignores `method`, `byWeekday` ignores `weekday`, `topPayers` ignores
 *       `customerId`) so the other options stay visible.
 *     parameters:
 *       - { in: query, name: from, schema: { type: string, format: date }, description: 'Inclusive (YYYY-MM-DD). Default: first day of the month of `to`' }
 *       - { in: query, name: to, schema: { type: string, format: date }, description: 'Inclusive (YYYY-MM-DD). Default: today (APP_TIMEZONE)' }
 *       - in: query
 *         name: granularity
 *         schema: { type: string, enum: [day, week, month] }
 *         description: 'Default: day up to 31 days, ISO week up to 120 days, month beyond'
 *       - { in: query, name: method, schema: { type: string, enum: [yape, plin, cash, bank_transfer] }, description: 'Cross-filter: payment method (payment data only)' }
 *       - { in: query, name: customerId, schema: { type: string, format: uuid }, description: 'Cross-filter: customer (payments, receivables and reminders)' }
 *       - { in: query, name: weekday, schema: { type: integer, minimum: 1, maximum: 7 }, description: 'Cross-filter: ISO weekday of the payment, 1 = Monday (payment data only)' }
 *     responses:
 *       200:
 *         description: Analytics
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/DashboardAnalytics' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 * /dashboard/concentration:
 *   get:
 *     tags: [Dashboard]
 *     summary: Pareto / ABC of the debtors (how concentrated the open balance is)
 *     description: >
 *       Debtors ranked by open balance. Class A: the largest debtors that together owe up to 80%
 *       of the balance (the one crossing 80% included); B: up to 95%; C: the rest. The curve is
 *       sampled in at most 100 segments from (0, 0) to (1, 1).
 *     parameters:
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 5000, default: 20 }, description: How many of the largest debtors to list }
 *     responses:
 *       200:
 *         description: Concentration
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/DebtConcentration' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
/**
 * @openapi
 * /dashboard/sales:
 *   get:
 *     tags: [Dashboard]
 *     summary: Sales dashboard of a range (sales module)
 *     description: Totals and the previous range of the same length, by day, by local hour, the 10 best-selling products, the 10 best customers, how it was paid and by category.
 *     parameters:
 *       - { $ref: '#/components/parameters/ReportFrom' }
 *       - { $ref: '#/components/parameters/ReportTo' }
 *     responses:
 *       200: { description: Sales dashboard }
 * /dashboard/purchases:
 *   get:
 *     tags: [Dashboard]
 *     summary: Purchases dashboard of a range (inventory module)
 *     description: Totals and the previous range, by day, the 10 main suppliers and products, and how they were paid.
 *     parameters:
 *       - { $ref: '#/components/parameters/ReportFrom' }
 *       - { $ref: '#/components/parameters/ReportTo' }
 *     responses:
 *       200: { description: Purchases dashboard }
 */
dashboardRouter.get('/dashboard/sales', requireModule('sales'), reportController.salesDashboard);
dashboardRouter.get(
  '/dashboard/purchases',
  requireModule('inventory'),
  reportController.purchasesDashboard,
);
dashboardRouter.get('/dashboard/summary', collections, dashboardController.summary);
dashboardRouter.get('/dashboard/cash-flow', collections, dashboardController.cashFlow);
dashboardRouter.get('/dashboard/analytics', collections, dashboardController.analytics);
dashboardRouter.get('/dashboard/concentration', collections, dashboardController.concentration);

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
dashboardRouter.get('/reports/monthly', collections, dashboardController.listReports);
dashboardRouter.post(
  '/reports/monthly/generate',
  collections,
  requireRole('admin'),
  dashboardController.generateReport,
);
dashboardRouter.get('/reports/monthly/:period', collections, dashboardController.getReport);

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
dashboardRouter.get('/notifications', collections, dashboardController.listNotifications);
dashboardRouter.post(
  '/reminders/run',
  collections,
  requireRole('admin'),
  dashboardController.runReminders,
);

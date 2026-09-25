import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import type { ModuleRequirement } from '../domain/modules';
import { requireModule } from '../middleware/requireModule';
import type { ReportId } from '../validators/report.schemas';

/** Tabular reports (the monthly PDF-style reports live under `/reports/monthly`). */
export const reportRouter = Router();

/**
 * @openapi
 * components:
 *   parameters:
 *     ReportFrom: { in: query, name: from, schema: { type: string, format: date }, description: 'Inclusive. Default: first day of the current month' }
 *     ReportTo: { in: query, name: to, schema: { type: string, format: date }, description: 'Inclusive. Default: today (max 3 years after from)' }
 * /reports/sales-by-customer:
 *   get:
 *     tags: [Reports]
 *     summary: Completed sales per customer in the range (requires the sales module)
 *     description: Walk-in sales are grouped in a row with customerId and name null. Rows plus totals.
 *     parameters: [{ $ref: '#/components/parameters/ReportFrom' }, { $ref: '#/components/parameters/ReportTo' }]
 *     responses:
 *       200: { description: '{ period, rows: [{ customerId, name, sales, total, cash, credit, lastSale }], totals }' }
 *       403: { description: MODULE_NOT_ENABLED }
 * /reports/collections-by-customer:
 *   get:
 *     tags: [Reports]
 *     summary: Payments received per customer in the range, split by method
 *     parameters: [{ $ref: '#/components/parameters/ReportFrom' }, { $ref: '#/components/parameters/ReportTo' }]
 *     responses:
 *       200: { description: '{ period, rows: [{ customerId, name, payments, amount, yape, plin, cash, bankTransfer, lastPayment }], totals }' }
 * /reports/sales-by-product:
 *   get:
 *     tags: [Reports]
 *     summary: Units sold and revenue per product in the range (requires the sales module)
 *     description: cost and profit are estimated with the product's current cost (null when it has none).
 *     parameters: [{ $ref: '#/components/parameters/ReportFrom' }, { $ref: '#/components/parameters/ReportTo' }]
 *     responses:
 *       200: { description: '{ period, rows: [{ productId, name, unit, quantity, sales, revenue, cost, profit }], totals }' }
 *       403: { description: MODULE_NOT_ENABLED }
 * /reports/stock:
 *   get:
 *     tags: [Reports]
 *     summary: Stock valuation of the active counted products, with out-of-stock and low ones
 *     description: value = stock × cost and retail = stock × price (negative stock counts as 0). status is out, low or ok.
 *     responses:
 *       200: { description: '{ rows: [{ productId, name, code, unit, stock, minStock, cost, price, value, retail, status }], totals }' }
 *       403: { description: MODULE_NOT_ENABLED }
 * /reports/shortages:
 *   get:
 *     tags: [Reports]
 *     summary: Sale lines sold without enough stock (when, which sale, how much was missing)
 *     description: Includes lines of sales voided later (sale.status says so). balanceAfter is the stock the line left.
 *     parameters: [{ $ref: '#/components/parameters/ReportFrom' }, { $ref: '#/components/parameters/ReportTo' }]
 *     responses:
 *       200: { description: '{ period, rows: [{ movementId, at, sale, customer, productId, product, quantity, shortage, balanceAfter }], totals }' }
 *       403: { description: MODULE_NOT_ENABLED }
 */
reportRouter.get('/sales-by-customer', requireModule('sales'), reportController.salesByCustomer);
reportRouter.get(
  '/collections-by-customer',
  requireModule('collections'),
  reportController.collectionsByCustomer,
);
reportRouter.get('/sales-by-product', requireModule('sales'), reportController.salesByProduct);
reportRouter.get('/stock', requireModule('catalog'), reportController.stock);
reportRouter.get('/shortages', requireModule('sales'), reportController.shortages);

/** Module each report needs; the collections report is always available. */
const EXPORT_MODULES: Record<ReportId, ModuleRequirement | null> = {
  'sales-by-customer': 'sales',
  'sales-by-product': 'sales',
  'collections-by-customer': 'collections',
  stock: 'catalog',
  shortages: 'sales',
};

/**
 * @openapi
 * /reports/{report}/export:
 *   get:
 *     tags: [Reports]
 *     summary: A report as an Excel (xlsx) or PDF file, in the request language
 *     description: >
 *       Same rows and totals as the JSON report. Sent inline (Content-Disposition inline with a
 *       file name) so the app can preview it before downloading. Excel keeps real numbers and
 *       dates, a frozen header and filters; the PDF is landscape A4 with the Solvia header.
 *     parameters:
 *       - { in: path, name: report, required: true, schema: { type: string, enum: [sales-by-customer, sales-by-product, collections-by-customer, stock, shortages] } }
 *       - { in: query, name: format, required: true, schema: { type: string, enum: [xlsx, pdf] } }
 *       - { $ref: '#/components/parameters/ReportFrom' }
 *       - { $ref: '#/components/parameters/ReportTo' }
 *     responses:
 *       200: { description: The file }
 *       403: { description: MODULE_NOT_ENABLED }
 */
reportRouter.get(
  '/:report/export',
  (req, res, next) => {
    const module = EXPORT_MODULES[req.params.report as ReportId];
    if (!module) return next();
    return requireModule(module)(req, res, next);
  },
  reportController.export,
);

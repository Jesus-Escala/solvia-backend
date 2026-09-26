import { Router } from 'express';
import { saleController } from '../controllers/sale.controller';
import { requireModule } from '../middleware/requireModule';

export const saleRouter = Router();

saleRouter.use(requireModule('sales'));

/**
 * @openapi
 * /sales:
 *   get:
 *     tags: [Sales]
 *     summary: Sales, newest first (requires the sales module)
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: 'Sale number (12 or #12) or customer name' }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: paymentType, schema: { type: string, enum: [cash, credit] } }
 *       - { in: query, name: status, schema: { type: string, enum: [completed, voided] } }
 *       - { in: query, name: shortage, schema: { type: string, enum: ['true'] }, description: Only sales that sold counted products beyond their stock }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/PageSize' }
 *     responses:
 *       200: { description: Paginated sales }
 *       403: { description: MODULE_NOT_ENABLED }
 *   post:
 *     tags: [Sales]
 *     summary: Record a sale (cash, or on credit creating the receivable)
 *     description: >
 *       Lines are priced from the catalog (unitPrice defaults to the product price; repeated
 *       products at the same price are merged). Counted products (trackStock) leave stock;
 *       stock may go negative, the sale is never blocked, and `lowStock` lists the products
 *       left at or below their alert level. A credit sale needs customerId and dueDate and
 *       creates a receivable linked to the sale; `downPayment` (with `downPaymentMethod`) is
 *       recorded as its first payment and must be less than the total. Lines without productId
 *       are free lines (a service or something not in the catalog: description + unitPrice) and
 *       never move stock. `discount` comes off the sum of the lines (400 DISCOUNT_TOO_HIGH when
 *       it is more). Receipts are recorded (docType, docNumber), not issued.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentType, items]
 *             properties:
 *               paymentType: { type: string, enum: [cash, credit] }
 *               method: { type: string, enum: [yape, plin, cash, bank_transfer], description: Cash sale paid with one method }
 *               payments: { type: array, maxItems: 4, items: { type: object, required: [method, amount], properties: { method: { type: string, enum: [yape, plin, cash, bank_transfer] }, amount: { type: number } } }, description: Cash sale paid with several methods (they add up to the total; PAYMENTS_DONT_MATCH_TOTAL otherwise) }
 *               customerId: { type: string, format: uuid, description: Required for credit sales }
 *               dueDate: { type: string, format: date, description: Required for credit sales }
 *               date: { type: string, format: date, description: 'Default: today' }
 *               docType: { type: string, enum: [none, sale_note, receipt, invoice], default: none }
 *               docNumber: { type: string, nullable: true }
 *               discount: { type: number, default: 0, description: Amount off the sum of the lines }
 *               downPayment: { type: number, description: Credit sale - paid now, less than the total }
 *               downPaymentMethod: { type: string, enum: [yape, plin, cash, bank_transfer] }
 *               downPayments: { type: array, maxItems: 4, items: { type: object, required: [method, amount], properties: { method: { type: string, enum: [yape, plin, cash, bank_transfer] }, amount: { type: number } } }, description: Credit sale - a down payment with several methods }
 *               notes: { type: string, nullable: true, maxLength: 500 }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [quantity]
 *                   properties:
 *                     productId: { type: string, format: uuid, description: Omit for a free line }
 *                     description: { type: string, description: Name of a free line }
 *                     quantity: { type: number, description: Up to 3 decimals }
 *                     unitPrice: { type: number }
 *     responses:
 *       201: { description: '{ sale, lowStock }' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /sales/{id}:
 *   get:
 *     tags: [Sales]
 *     summary: Sale detail with its items and receivable
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       200: { description: Sale }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /sales/{id}/void:
 *   post:
 *     tags: [Sales]
 *     summary: Void a sale (stock goes back; the receivable of a credit sale is removed)
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       200: { description: Voided sale }
 *       422: { description: SALE_HAS_PAYMENTS or SALE_ALREADY_VOIDED }
 */
saleRouter.get('/', saleController.list);
saleRouter.post('/', saleController.create);
saleRouter.get('/:id', saleController.get);
saleRouter.post('/:id/void', saleController.void);

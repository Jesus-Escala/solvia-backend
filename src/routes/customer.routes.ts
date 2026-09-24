import { Router } from 'express';
import { customerController } from '../controllers/customer.controller';
import { requireRole } from '../middleware/authenticate';

export const customerRouter = Router();

/**
 * @openapi
 * /customers:
 *   get:
 *     tags: [Customers]
 *     summary: List customers with their risk score and balance summary
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: Name, phone or document ID }
 *       - { in: query, name: risk, schema: { type: string, enum: [low, medium, high] } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/PageSize' }
 *     responses:
 *       200:
 *         description: Paginated customers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: '#/components/schemas/CustomerWithRisk' } }
 *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
 *   post:
 *     tags: [Customers]
 *     summary: Create a customer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CustomerInput' }
 *     responses:
 *       201:
 *         description: Customer created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Customer' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
customerRouter.get('/', customerController.list);
customerRouter.post('/', customerController.create);

/**
 * @openapi
 * /customers/lookup:
 *   get:
 *     tags: [Customers]
 *     summary: Light search for pickers (name, phone digits or document) with what each one owes
 *     description: No pagination, risk or receivable rows; the balance is computed in SQL. Without text, the ones who owe the most first.
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 20, default: 8 } }
 *     responses:
 *       200: { description: '{ data: [{ id, name, phone, outstanding }] }' }
 * /customers/{id}:
 *   parameters:
 *     - { $ref: '#/components/parameters/Id' }
 *   get:
 *     tags: [Customers]
 *     summary: Customer detail with receivables, payments and risk score
 *     responses:
 *       200: { description: Customer detail }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Customers]
 *     summary: Update a customer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CustomerInput' }
 *     responses:
 *       200: { description: Customer updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Customers]
 *     summary: Delete a customer and all its receivables (admin only)
 *     responses:
 *       204: { description: Deleted }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
customerRouter.get('/lookup', customerController.lookup);
customerRouter.get('/:id', customerController.get);
customerRouter.patch('/:id', customerController.update);
customerRouter.delete('/:id', requireRole('admin'), customerController.remove);

/**
 * @openapi
 * /customers/{id}/risk:
 *   get:
 *     tags: [Customers]
 *     summary: Risk score computed from the customer's payment history
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       200:
 *         description: Risk score
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RiskScore' }
 */
customerRouter.get('/:id/risk', customerController.risk);

/**
 * @openapi
 * /customers/{id}/statement:
 *   get:
 *     tags: [Statements]
 *     summary: Download the customer's account statement as PDF
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       200:
 *         description: PDF document
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 * /customers/{id}/statement/send:
 *   post:
 *     tags: [Statements]
 *     summary: Generate the statement and send it to the customer via WhatsApp
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       201: { description: Statement generated and sent (see notification status) }
 */
customerRouter.get('/:id/statement', customerController.downloadStatement);
customerRouter.post('/:id/statement/send', customerController.sendStatement);

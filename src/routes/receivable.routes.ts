import { Router } from 'express';
import { receivableController } from '../controllers/receivable.controller';
import { requireRole } from '../middleware/authenticate';
import { optionalProofUpload } from '../middleware/upload';

export const receivableRouter = Router();

/**
 * @openapi
 * /receivables:
 *   get:
 *     tags: [Receivables]
 *     summary: List receivables with filters
 *     parameters:
 *       - in: query
 *         name: status
 *         description: One or more statuses, comma separated (e.g. pending,overdue)
 *         schema: { type: string, example: 'pending,overdue' }
 *       - { in: query, name: customerId, schema: { type: string, format: uuid } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: dueFrom, schema: { type: string, format: date } }
 *       - { in: query, name: dueTo, schema: { type: string, format: date } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/PageSize' }
 *     responses:
 *       200:
 *         description: Paginated receivables
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: '#/components/schemas/Receivable' } }
 *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
 *   post:
 *     tags: [Receivables]
 *     summary: Create a receivable for a customer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ReceivableInput' }
 *     responses:
 *       201:
 *         description: Receivable created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Receivable' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
receivableRouter.get('/', receivableController.list);
receivableRouter.post('/', receivableController.create);

/**
 * @openapi
 * /receivables/{id}:
 *   parameters:
 *     - { $ref: '#/components/parameters/Id' }
 *   get:
 *     tags: [Receivables]
 *     summary: Receivable detail with payments and notification log
 *     responses:
 *       200: { description: Receivable detail }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Receivables]
 *     summary: Update description, amount or dates
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description: { type: string }
 *               totalAmount: { type: number }
 *               issueDate: { type: string, format: date }
 *               dueDate: { type: string, format: date }
 *     responses:
 *       200: { description: Receivable updated }
 *       422: { $ref: '#/components/responses/Unprocessable' }
 *   delete:
 *     tags: [Receivables]
 *     summary: Delete a receivable (admin only)
 *     responses:
 *       204: { description: Deleted }
 */
receivableRouter.get('/:id', receivableController.get);
receivableRouter.patch('/:id', receivableController.update);
receivableRouter.delete('/:id', requireRole('admin'), receivableController.remove);

/**
 * @openapi
 * /receivables/{id}/payments:
 *   parameters:
 *     - { $ref: '#/components/parameters/Id' }
 *   get:
 *     tags: [Payments]
 *     summary: List payments of a receivable
 *     responses:
 *       200: { description: Payments }
 *   post:
 *     tags: [Payments]
 *     summary: Register a partial or full payment (optionally with a proof image)
 *     description: Updates the receivable balance and status, then sends an updated account statement to the customer.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [amount, method]
 *             properties:
 *               amount: { type: number, example: 150.5 }
 *               method: { type: string, enum: [yape, plin, cash, bank_transfer] }
 *               date: { type: string, format: date }
 *               proof: { type: string, format: binary, description: JPEG, PNG, WEBP or PDF }
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, method]
 *             properties:
 *               amount: { type: number }
 *               method: { type: string, enum: [yape, plin, cash, bank_transfer] }
 *               date: { type: string, format: date }
 *     responses:
 *       201:
 *         description: Payment registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payment: { $ref: '#/components/schemas/Payment' }
 *                 receivable: { $ref: '#/components/schemas/Receivable' }
 *       422: { $ref: '#/components/responses/Unprocessable' }
 */
receivableRouter.get('/:id/payments', receivableController.listPayments);
receivableRouter.post('/:id/payments', optionalProofUpload, receivableController.registerPayment);

/**
 * @openapi
 * /receivables/{id}/payment-link:
 *   post:
 *     tags: [Payments]
 *     summary: Generate an online payment link for the outstanding balance
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       201: { description: Payment link }
 * /receivables/{id}/remind:
 *   post:
 *     tags: [Reminders]
 *     summary: Send a WhatsApp reminder now, regardless of the schedule
 *     description: >
 *       With the mock WhatsApp provider nothing reaches the customer, so the response also carries
 *       `whatsappUrl`, a click-to-chat link with the same message for the user to send it.
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       201:
 *         description: Notification log entry (plus `whatsappUrl` with the mock provider)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Notification' }
 */
receivableRouter.post('/:id/payment-link', receivableController.createPaymentLink);
receivableRouter.post('/:id/remind', receivableController.sendReminder);

import { Router } from 'express';
import { purchaseController, supplierController } from '../controllers/inventory.controller';
import { requireRole } from '../middleware/authenticate';
import { requireModule } from '../middleware/requireModule';

/** Logística: suppliers and purchases (inventory module). */
export const supplierRouter = Router();
export const purchaseRouter = Router();
supplierRouter.use(requireModule('inventory'));
purchaseRouter.use(requireModule('inventory'));

/**
 * @openapi
 * /suppliers:
 *   get:
 *     tags: [Inventory]
 *     summary: Suppliers (inventory module)
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: Name or RUC }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/PageSize' }
 *     responses:
 *       200: { description: Paginated suppliers with their purchase count }
 *   post:
 *     tags: [Inventory]
 *     summary: Create a supplier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               documentId: { type: string, nullable: true, description: RUC or DNI }
 *               phone: { type: string, nullable: true, description: E.164 WhatsApp }
 *               notes: { type: string, nullable: true }
 *     responses:
 *       201: { description: Supplier }
 * /suppliers/lookup:
 *   get:
 *     tags: [Inventory]
 *     summary: Light search for pickers
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 20, default: 8 } }
 *     responses:
 *       200: { description: '{ data: [{ id, name, phone }] }' }
 * /suppliers/{id}:
 *   patch:
 *     tags: [Inventory]
 *     summary: Update a supplier
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       200: { description: Supplier }
 *   delete:
 *     tags: [Inventory]
 *     summary: Delete a supplier without purchases (admin only)
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       204: { description: Deleted }
 *       409: { description: SUPPLIER_IN_USE }
 */
supplierRouter.get('/', supplierController.list);
supplierRouter.get('/lookup', supplierController.lookup);
supplierRouter.post('/', supplierController.create);
supplierRouter.patch('/:id', supplierController.update);
supplierRouter.delete('/:id', requireRole('admin'), supplierController.remove);

/**
 * @openapi
 * /purchases:
 *   get:
 *     tags: [Inventory]
 *     summary: Purchases, newest first (inventory module)
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: 'Purchase number or supplier name' }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: status, schema: { type: string, enum: [completed, voided] } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/PageSize' }
 *     responses:
 *       200: { description: Paginated purchases }
 *   post:
 *     tags: [Inventory]
 *     summary: Record a purchase (counted products enter stock)
 *     description: >
 *       Each counted product gets a `purchase` stock movement with the balance it left. With
 *       `updateCosts` (default true) each product cost becomes the unit cost paid now.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               supplierId: { type: string, format: uuid }
 *               date: { type: string, format: date }
 *               docType: { type: string, enum: [none, sale_note, receipt, invoice] }
 *               docNumber: { type: string, nullable: true }
 *               updateCosts: { type: boolean, default: true }
 *               payments: { type: array, maxItems: 4, items: { type: object, required: [method, amount], properties: { method: { type: string, enum: [yape, plin, cash, bank_transfer] }, amount: { type: number } } }, description: How it was paid to the supplier (optional; adds up to the total) }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [productId, quantity, unitCost]
 *                   properties:
 *                     productId: { type: string, format: uuid }
 *                     quantity: { type: number }
 *                     unitCost: { type: number }
 *     responses:
 *       201: { description: Purchase }
 * /purchases/{id}:
 *   get:
 *     tags: [Inventory]
 *     summary: Purchase detail
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       200: { description: Purchase }
 * /purchases/{id}/void:
 *   post:
 *     tags: [Inventory]
 *     summary: Void a purchase (its products leave stock again)
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       200: { description: Voided purchase }
 *       422: { description: PURCHASE_ALREADY_VOIDED }
 */
purchaseRouter.get('/', purchaseController.list);
purchaseRouter.post('/', purchaseController.create);
purchaseRouter.get('/:id', purchaseController.get);
purchaseRouter.post('/:id/void', purchaseController.void);

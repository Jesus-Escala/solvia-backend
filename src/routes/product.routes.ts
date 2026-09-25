import { Router } from 'express';
import { productController } from '../controllers/product.controller';
import { requireRole } from '../middleware/authenticate';
import { requireModule } from '../middleware/requireModule';
import { singleImageUpload } from '../middleware/upload';

export const productRouter = Router();

// The catalog exists for businesses with the sales or inventory module enabled.
productRouter.use(requireModule('catalog'));

/**
 * @openapi
 * /products:
 *   get:
 *     tags: [Catalog]
 *     summary: Products of the business catalog (requires the sales or inventory module)
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: Name or code }
 *       - { in: query, name: status, schema: { type: string, enum: [active, archived, all], default: active } }
 *       - { in: query, name: lowStock, schema: { type: string, enum: ['true'] }, description: Counted products at or below their alert level }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [name, code, price, cost, createdAt], default: name } }
 *       - { in: query, name: sortDir, schema: { type: string, enum: [asc, desc], default: asc } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/PageSize' }
 *     responses:
 *       200: { description: Paginated products }
 *       403: { description: MODULE_NOT_ENABLED }
 *   post:
 *     tags: [Catalog]
 *     summary: Create a product
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ProductInput' }
 *     responses:
 *       201:
 *         description: Product
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { description: PRODUCT_CODE_TAKEN }
 * /products/lookup:
 *   get:
 *     tags: [Catalog]
 *     summary: Light search for pickers (active products; exact code first, then name prefix)
 *     description: No pagination or count; uses the name trigram index. Built for search-as-you-type and barcode scanners.
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 60, default: 8 } }
 *       - { in: query, name: sort, schema: { type: string, enum: [relevance, popular], default: relevance }, description: popular puts the best sellers of the last 90 days first (point-of-sale catalog) }
 *     responses:
 *       200: { description: '{ data: [{ id, name, code, unit, price, cost, trackStock, stock, minStock, packSize, sold }] }' }
 * /products/{id}/adjust:
 *   post:
 *     tags: [Catalog]
 *     summary: Adjust the stock of a counted product (inventory module)
 *     description: >
 *       reason count - quantity is the stock counted (the change is counted minus current);
 *       loss / damage - quantity units leave; correction - quantity is the signed change.
 *       Always records an adjustment movement with the reason, note and balance.
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason, quantity]
 *             properties:
 *               reason: { type: string, enum: [count, loss, damage, correction] }
 *               quantity: { type: number }
 *               note: { type: string, nullable: true }
 *     responses:
 *       200: { description: Product with its new stock }
 *       422: { description: PRODUCT_NOT_COUNTED }
 * /products/{id}/movements:
 *   get:
 *     tags: [Catalog]
 *     summary: Kardex of a product (every stock change, newest first)
 *     description: Each movement has its signed quantity, the balance it left (balanceAfter) and the part that left without stock (shortage), with the sale it comes from.
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/PageSize' }
 *     responses:
 *       200: { description: Paginated movements }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /products/{id}:
 *   get:
 *     tags: [Catalog]
 *     summary: Product detail
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       200:
 *         description: Product
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Catalog]
 *     summary: Update a product, or archive / restore it with `active`
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - { $ref: '#/components/schemas/ProductInput' }
 *               - { type: object, properties: { active: { type: boolean } } }
 *     responses:
 *       200:
 *         description: Product
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 *       409: { description: PRODUCT_CODE_TAKEN }
 *   delete:
 *     tags: [Catalog]
 *     summary: Delete a product (admin only)
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       204: { description: Deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
productRouter.get('/', productController.list);
productRouter.post('/', productController.create);
productRouter.get('/lookup', productController.lookup);
productRouter.get('/:id', productController.get);
productRouter.get('/:id/movements', productController.movements);
productRouter.post('/:id/adjust', requireModule('inventory'), productController.adjust);
productRouter.patch('/:id', productController.update);
/**
 * @openapi
 * /products/{id}/image:
 *   put:
 *     tags: [Catalog]
 *     summary: Set the picture of a product (multipart, field "image"; JPEG, PNG or WEBP)
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 *       400: { description: INVALID_IMAGE_TYPE, IMAGE_REQUIRED or FILE_TOO_LARGE }
 *   delete:
 *     tags: [Catalog]
 *     summary: Remove the picture of a product
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 */
productRouter.put('/:id/image', singleImageUpload, productController.setImage);
productRouter.delete('/:id/image', productController.removeImage);
productRouter.delete('/:id', requireRole('admin'), productController.remove);

import { Router } from 'express';
import { productController } from '../controllers/product.controller';
import { requireRole } from '../middleware/authenticate';
import { requireModule } from '../middleware/requireModule';

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
productRouter.get('/:id', productController.get);
productRouter.patch('/:id', productController.update);
productRouter.delete('/:id', requireRole('admin'), productController.remove);

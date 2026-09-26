import { Router } from 'express';
import { mapController } from '../controllers/map.controller';
import { requireRole } from '../middleware/authenticate';
import { singleImageUpload } from '../middleware/upload';

/** Floor plans of the business and where its products are kept (a tool of every business). */
export const mapRouter = Router();

/**
 * @openapi
 * /maps:
 *   get:
 *     tags: [Inventory]
 *     summary: Floor plans with their spots and the products kept in each
 *     responses:
 *       200: { description: '{ data: [{ id, name, imageUrl, aspect, position, spots: [{ id, name, x, y, color, products: [{ id, name, code, imageUrl, unit, trackStock, stock }] }] }] }' }
 *   post:
 *     tags: [Inventory]
 *     summary: Create a floor plan (the picture is uploaded next)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: Tienda }
 *               aspect: { type: number, description: 'Width / height of a shop drawn in the app (1.5 by default); a picture sets its own' }
 *     responses:
 *       201: { description: The plan }
 *       409: { description: MAP_NAME_TAKEN }
 *       422: { description: MAP_LIMIT_REACHED }
 * /maps/{id}:
 *   patch:
 *     tags: [Inventory]
 *     summary: Rename or reorder a floor plan
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               aspect: { type: number }
 *               position: { type: integer }
 *     responses:
 *       200: { description: The plan }
 *       409: { description: MAP_NAME_TAKEN }
 *   delete:
 *     tags: [Inventory]
 *     summary: Delete a floor plan and its spots (admins; the products stay, without a place)
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       204: { description: Deleted }
 * /maps/{id}/image:
 *   put:
 *     tags: [Inventory]
 *     summary: Set the picture of a floor plan (multipart, field "image"; JPEG, PNG or WEBP)
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
 *               aspect: { type: number, description: Width / height of the picture }
 *     responses:
 *       200: { description: The plan }
 *       400: { description: INVALID_IMAGE_TYPE, IMAGE_REQUIRED or FILE_TOO_LARGE }
 *   delete:
 *     tags: [Inventory]
 *     summary: Remove the picture of a floor plan (its spots stay)
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     responses:
 *       200: { description: The plan }
 * /maps/{id}/spots:
 *   post:
 *     tags: [Inventory]
 *     summary: Mark an area on the plan (a shelf, a fridge…); x and y are its center
 *     parameters:
 *       - { $ref: '#/components/parameters/Id' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, x, y]
 *             properties:
 *               name: { type: string, example: Estante A }
 *               x: { type: number, minimum: 0, maximum: 1, description: Fraction of the width }
 *               y: { type: number, minimum: 0, maximum: 1, description: Fraction of the height }
 *               w: { type: number, minimum: 0.01, maximum: 1, description: Width of the area (fraction), 0.1 by default }
 *               h: { type: number, minimum: 0.01, maximum: 1, description: Height of the area (fraction), 0.08 by default }
 *               color: { type: string, description: 'A color like #0d9488 (or a theme color: primary, info, success, warning, danger, accent)' }
 *     responses:
 *       201: { description: The plan with the new spot }
 *       422: { description: SPOT_LIMIT_REACHED }
 * /maps/spots/{spotId}:
 *   patch:
 *     tags: [Inventory]
 *     summary: Rename, move or recolor a spot
 *     parameters:
 *       - { in: path, name: spotId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               x: { type: number }
 *               y: { type: number }
 *               w: { type: number }
 *               h: { type: number }
 *               color: { type: string }
 *     responses:
 *       200: { description: The plan }
 *   delete:
 *     tags: [Inventory]
 *     summary: Delete a spot (its products stay, without a place)
 *     parameters:
 *       - { in: path, name: spotId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: The plan }
 * /maps/spots/{spotId}/products:
 *   post:
 *     tags: [Inventory]
 *     summary: Put products in a spot (taken out of the spot they were in)
 *     parameters:
 *       - { in: path, name: spotId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productIds]
 *             properties:
 *               productIds: { type: array, items: { type: string, format: uuid } }
 *     responses:
 *       200: { description: The plan }
 * /maps/spots/{spotId}/products/{productId}:
 *   delete:
 *     tags: [Inventory]
 *     summary: Take a product out of a spot
 *     parameters:
 *       - { in: path, name: spotId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: productId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: The plan }
 */
mapRouter.get('/', mapController.list);
mapRouter.post('/', mapController.create);
mapRouter.patch('/spots/:spotId', mapController.updateSpot);
mapRouter.delete('/spots/:spotId', mapController.removeSpot);
mapRouter.post('/spots/:spotId/products', mapController.placeProducts);
mapRouter.delete('/spots/:spotId/products/:productId', mapController.unplaceProduct);
mapRouter.patch('/:id', mapController.update);
mapRouter.delete('/:id', requireRole('admin'), mapController.remove);
mapRouter.put('/:id/image', singleImageUpload, mapController.setImage);
mapRouter.delete('/:id/image', mapController.removeImage);
mapRouter.post('/:id/spots', mapController.addSpot);

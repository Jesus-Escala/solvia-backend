import { Router } from 'express';
import { platformController } from '../controllers/platform.controller';
import { authenticatePlatformAdmin } from '../middleware/authenticate';
import { notFoundHandler } from '../middleware/errorHandler';

/**
 * Platform backoffice (Solvia staff). Uses its own admin accounts and tokens: tenant tokens are
 * rejected here and platform tokens are rejected by every tenant route.
 */
export const platformRouter = Router();

/**
 * @openapi
 * /admin/auth/login:
 *   post:
 *     tags: [Platform admin]
 *     summary: Log in as a platform administrator
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: admin@solvia.app }
 *               password: { type: string, example: Password123! }
 *     responses:
 *       200:
 *         description: Platform session
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PlatformSession' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 * /admin/auth/refresh:
 *   post:
 *     tags: [Platform admin]
 *     summary: Exchange a platform refresh token for a new token pair
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New token pair
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/TokenPair' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
platformRouter.post('/auth/login', platformController.login);
platformRouter.post('/auth/refresh', platformController.refresh);

// Everything below requires a platform access token.
platformRouter.use(authenticatePlatformAdmin);

/**
 * @openapi
 * /admin/auth/me:
 *   get:
 *     tags: [Platform admin]
 *     summary: Current platform administrator
 *     responses:
 *       200:
 *         description: Administrator profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 admin: { $ref: '#/components/schemas/PlatformAdmin' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
platformRouter.get('/auth/me', platformController.me);

/**
 * @openapi
 * /admin/overview:
 *   get:
 *     tags: [Platform admin]
 *     summary: Platform-wide totals, plan mix, sign-up and collection trends, top tenants
 *     responses:
 *       200:
 *         description: Overview
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PlatformOverview' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
platformRouter.get('/overview', platformController.overview);

/**
 * @openapi
 * /admin/tenants:
 *   get:
 *     tags: [Platform admin]
 *     summary: List every tenant with usage and collection metrics
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: Tenant name or any user email }
 *       - { in: query, name: plan, schema: { type: string, enum: [free, starter, pro] } }
 *       - { in: query, name: status, schema: { type: string, enum: [active, suspended] } }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [name, createdAt, outstanding, customers, users], default: createdAt }
 *       - { in: query, name: sortDir, schema: { type: string, enum: [asc, desc], default: desc } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/PageSize' }
 *     responses:
 *       200:
 *         description: Paginated tenants
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: '#/components/schemas/PlatformTenantRow' } }
 *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
platformRouter.get('/tenants', platformController.listTenants);

/**
 * @openapi
 * /admin/tenants/{id}:
 *   parameters:
 *     - { $ref: '#/components/parameters/Id' }
 *   get:
 *     tags: [Platform admin]
 *     summary: Tenant detail with its users
 *     responses:
 *       200:
 *         description: Tenant detail
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PlatformTenantDetail' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Platform admin]
 *     summary: Change a tenant's plan or suspend / reactivate it
 *     description: Users of a suspended tenant cannot log in or refresh their session (403 TENANT_SUSPENDED).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               plan: { type: string, enum: [free, starter, pro] }
 *               status: { type: string, enum: [active, suspended] }
 *     responses:
 *       200:
 *         description: Updated tenant detail
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PlatformTenantDetail' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
platformRouter.get('/tenants/:id', platformController.getTenant);
platformRouter.patch('/tenants/:id', platformController.updateTenant);

// Unknown admin routes end here instead of falling through to the tenant routes.
platformRouter.use(notFoundHandler);

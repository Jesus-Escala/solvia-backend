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
 *     description: >
 *       With any of `from`, `to` or `granularity` (same rules as `/dashboard/analytics`), the
 *       response also includes `period`, `periodTotals` and `periodSeries`.
 *       `modules` counts active businesses with each optional module and without any
 *       (`none`: businesses to offer them to).
 *     parameters:
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: granularity, schema: { type: string, enum: [day, week, month] } }
 *     responses:
 *       200:
 *         description: Overview
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PlatformOverview' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
platformRouter.get('/overview', platformController.overview);

/**
 * @openapi
 * /admin/pricing:
 *   get:
 *     tags: [Platform admin]
 *     summary: Module prices, discounts and plan allowances (the plan builder of the backoffice)
 *     responses:
 *       200:
 *         description: >
 *           `modules` (monthly price of Cobranza, Ventas, Inventario), `discounts` by number of
 *           modules, `annualMonthsPaid`, `free` and `paid` allowances (automatic WhatsApp
 *           messages, users, customers; null = unlimited) and `packSize`.
 */
platformRouter.get('/pricing', platformController.pricing);

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
 *       - { in: query, name: module, schema: { type: string, enum: [sales, inventory, none] }, description: 'Businesses with that module, or none: without optional modules' }
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
 * /admin/tenants:
 *   post:
 *     tags: [Platform admin]
 *     summary: Create a business and its first admin (managed onboarding)
 *     description: |
 *       Creates the tenant with the default message templates and reminder rules, plus its first
 *       admin with a temporary password (returned only here; it must be changed at first
 *       sign-in). With `accessRequestId`, that request is marked as converted.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, admin]
 *             properties:
 *               name: { type: string, example: Botica Santa Rosa }
 *               industry: { type: string, example: Pharmacy }
 *               plan: { type: string, enum: [free, starter, pro], default: free }
 *               admin:
 *                 type: object
 *                 required: [name, email]
 *                 properties:
 *                   name: { type: string, example: Julia Condori }
 *                   email: { type: string, format: email, example: julia@boticasantarosa.pe }
 *               accessRequestId: { type: string, format: uuid }
 *               modules: { type: array, items: { type: string, enum: [sales, inventory] }, description: Optional modules enabled from the start }
 *     responses:
 *       201:
 *         description: Tenant created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tenant: { $ref: '#/components/schemas/PlatformTenantDetail' }
 *                 temporaryPassword: { type: string }
 *       400: { description: VALIDATION_ERROR or ACCESS_REQUEST_CONVERTED }
 *       404: { description: ACCESS_REQUEST_NOT_FOUND }
 *       409: { description: EMAIL_TAKEN }
 */
platformRouter.post('/tenants', platformController.createTenant);

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
 *     summary: Change a tenant's plan or modules, or suspend / reactivate it
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
 *               modules:
 *                 type: array
 *                 description: Full list of enabled optional modules (replaces the current one)
 *                 items: { type: string, enum: [sales, inventory] }
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

/**
 * @openapi
 * /admin/tenants/{id}/usage:
 *   get:
 *     tags: [Platform admin]
 *     summary: Plan allowance and use of the current month of a tenant
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200:
 *         description: >
 *           Allowance and use of the current month: `automaticMessages` (used, included by the
 *           plan, extra packs, limit, left), `users` and `customers` (used, limit; null =
 *           unlimited). Manual reminders from the owner's WhatsApp are never counted.
 * /admin/tenants/{id}/message-packs:
 *   post:
 *     tags: [Platform admin]
 *     summary: Add packs of extra automatic WhatsApp messages to the tenant's current month
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { packs: { type: integer, minimum: 1, maximum: 20, default: 1 } } }
 *     responses:
 *       201: { description: The updated usage }
 */
platformRouter.get('/tenants/:id/usage', platformController.tenantUsage);
platformRouter.post('/tenants/:id/message-packs', platformController.addMessagePacks);

/**
 * @openapi
 * /admin/tenants/{id}/users:
 *   parameters:
 *     - { $ref: '#/components/parameters/Id' }
 *   post:
 *     tags: [Platform admin]
 *     summary: Add a user to a tenant with a temporary password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TeamUserInput' }
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/TenantUserWithPassword' }
 *       404: { description: TENANT_NOT_FOUND }
 *       409: { description: EMAIL_TAKEN }
 * /admin/tenants/{id}/users/{userId}:
 *   parameters:
 *     - { $ref: '#/components/parameters/Id' }
 *     - { $ref: '#/components/parameters/UserId' }
 *   patch:
 *     tags: [Platform admin]
 *     summary: Rename a tenant user, change their role, or activate / deactivate them
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TeamUserUpdate' }
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/TenantUser' }
 *       400: { description: VALIDATION_ERROR or LAST_ADMIN }
 *       404: { description: TENANT_NOT_FOUND or USER_NOT_FOUND }
 * /admin/tenants/{id}/users/{userId}/reset-password:
 *   parameters:
 *     - { $ref: '#/components/parameters/Id' }
 *     - { $ref: '#/components/parameters/UserId' }
 *   post:
 *     tags: [Platform admin]
 *     summary: Give a tenant user a new temporary password
 *     responses:
 *       200:
 *         description: New temporary password (shown once)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/TemporaryPassword' }
 *       404: { description: TENANT_NOT_FOUND or USER_NOT_FOUND }
 */
platformRouter.post('/tenants/:id/users', platformController.createTenantUser);
platformRouter.patch('/tenants/:id/users/:userId', platformController.updateTenantUser);
platformRouter.post(
  '/tenants/:id/users/:userId/reset-password',
  platformController.resetTenantUserPassword,
);

/**
 * @openapi
 * /admin/access-requests:
 *   get:
 *     tags: [Platform admin]
 *     summary: Access requests from the landing page, newest first
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [pending, converted, dismissed] } }
 *       - { in: query, name: search, schema: { type: string }, description: Business, contact, email or phone }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/PageSize' }
 *     responses:
 *       200:
 *         description: Paginated access requests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: '#/components/schemas/AccessRequest' } }
 *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
 * /admin/access-requests/{id}:
 *   parameters:
 *     - { $ref: '#/components/parameters/Id' }
 *   patch:
 *     tags: [Platform admin]
 *     summary: Dismiss an access request or move it back to pending
 *     description: Converted requests cannot change (400 ACCESS_REQUEST_CONVERTED).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [pending, dismissed] }
 *     responses:
 *       200:
 *         description: Updated request
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AccessRequest' }
 *       400: { description: VALIDATION_ERROR or ACCESS_REQUEST_CONVERTED }
 *       404: { description: ACCESS_REQUEST_NOT_FOUND }
 */
platformRouter.get('/access-requests', platformController.listAccessRequests);
platformRouter.patch('/access-requests/:id', platformController.updateAccessRequest);

// Unknown admin routes end here instead of falling through to the tenant routes.
platformRouter.use(notFoundHandler);

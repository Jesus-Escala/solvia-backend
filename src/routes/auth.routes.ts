import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate, requireRole } from '../middleware/authenticate';
import { tenantScope } from '../middleware/tenantScope';

export const authRouter = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a business (tenant) and its first admin user
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [businessName, name, email, password]
 *             properties:
 *               businessName: { type: string, example: Bodega Don Lucho }
 *               industry: { type: string, example: Retail }
 *               plan: { type: string, enum: [free, starter, pro], default: free }
 *               name: { type: string, example: Luis Ramirez }
 *               email: { type: string, format: email, example: luis@bodega.pe }
 *               password: { type: string, minLength: 8, example: Password123! }
 *     responses:
 *       201:
 *         description: Tenant created; returns the session
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthSession' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
authRouter.post('/register', authController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: admin@bodegasanmartin.pe }
 *               password: { type: string, example: Password123! }
 *     responses:
 *       200:
 *         description: Authenticated session
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthSession' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
authRouter.post('/login', authController.login);

/**
 * @openapi
 * /auth/google:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in or register with Google (ID token from Google Identity Services)
 *     description: |
 *       Signs in the user linked to the Google account (or with the same verified email).
 *       For a new email it returns `needsRegistration: true`; call again with `businessName`
 *       to create the business with this user as admin.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credential]
 *             properties:
 *               credential: { type: string, description: Google ID token }
 *               businessName: { type: string }
 *               industry: { type: string }
 *     responses:
 *       200: { description: Session, or `{ needsRegistration, profile }` for new emails }
 *       201: { description: Business registered and signed in }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       503: { description: Google sign-in is not configured (GOOGLE_CLIENT_ID) }
 * /auth/config:
 *   get:
 *     tags: [Auth]
 *     summary: Public auth configuration (Google client ID when enabled)
 *     security: []
 *     responses:
 *       200: { description: Configuration }
 */
authRouter.post('/google', authController.google);
authRouter.get('/config', authController.config);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a refresh token for a new token pair
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
authRouter.post('/refresh', authController.refresh);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Current user and tenant
 *     responses:
 *       200: { description: Current user profile }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
authRouter.get('/me', authenticate, tenantScope, authController.me);

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List users of the tenant (admin only)
 *     responses:
 *       200: { description: Users }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   post:
 *     tags: [Users]
 *     summary: Create a user in the tenant (admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [admin, collector], default: collector }
 *     responses:
 *       201: { description: User created }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
export const usersRouter = Router();
usersRouter.get('/', requireRole('admin'), authController.listUsers);
usersRouter.post('/', requireRole('admin'), authController.createUser);

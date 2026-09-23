import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateAllowingPasswordChange } from '../middleware/authenticate';
import { tenantScope } from '../middleware/tenantScope';

export const authRouter = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a business (tenant) and its first admin user
 *     description: Only available when self sign-up is enabled (`SELF_SIGNUP_ENABLED`); otherwise 403 SIGNUP_DISABLED.
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
 *       403: { description: SIGNUP_DISABLED }
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
 *       403: { description: USER_DISABLED or TENANT_SUSPENDED }
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
 *       to create the business with this user as admin. When self sign-up is disabled, a new
 *       email is rejected with 403 GOOGLE_ACCOUNT_NOT_FOUND instead.
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
 *       403: { description: GOOGLE_ACCOUNT_NOT_FOUND, USER_DISABLED or TENANT_SUSPENDED }
 *       503: { description: Google sign-in is not configured (GOOGLE_CLIENT_ID) }
 * /auth/config:
 *   get:
 *     tags: [Auth]
 *     summary: Public auth configuration (Google client ID when enabled, self sign-up flag)
 *     security: []
 *     responses:
 *       200:
 *         description: Configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 googleClientId: { type: string, nullable: true }
 *                 signupEnabled: { type: boolean }
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
 *       403: { description: USER_DISABLED or TENANT_SUSPENDED }
 */
authRouter.post('/refresh', authController.refresh);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Current user and tenant
 *     description: Also available while the user must change a temporary password.
 *     responses:
 *       200: { description: Current user profile (includes `mustChangePassword`) }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change the caller's password (required after receiving a temporary one)
 *     description: |
 *       Clears `mustChangePassword` and returns a fresh session. `currentPassword` may be omitted
 *       only by Google-only accounts that have no password yet. While a user must change their
 *       password, every other tenant route answers 403 PASSWORD_CHANGE_REQUIRED.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: New session
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthSession' }
 *       400: { description: VALIDATION_ERROR or PASSWORD_REUSED }
 *       401: { description: INVALID_CREDENTIALS (wrong current password) or missing token }
 */
authRouter.get('/me', authenticateAllowingPasswordChange, tenantScope, authController.me);
authRouter.post(
  '/change-password',
  authenticateAllowingPasswordChange,
  tenantScope,
  authController.changePassword,
);

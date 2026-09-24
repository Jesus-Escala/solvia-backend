import { Router } from 'express';
import { publicController } from '../controllers/public.controller';
import { notFoundHandler } from '../middleware/errorHandler';
import { rateLimit } from '../middleware/rateLimit';

/** Unauthenticated endpoints for the public landing page. */
export const publicRouter = Router();

const ACCESS_REQUESTS_PER_HOUR = 5;

/**
 * @openapi
 * /public/access-requests:
 *   post:
 *     tags: [Public]
 *     summary: Request access to Solvia (landing page form)
 *     description: |
 *       Stores the request for review in the backoffice. `website` is a honeypot that people
 *       never fill in: when it has a value nothing is stored. A second request for an email that
 *       already has a pending one is not duplicated. Limited to 5 requests per hour per IP.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [businessName, contactName, email, phone]
 *             properties:
 *               businessName: { type: string, minLength: 2, maxLength: 120, example: Botica Santa Rosa }
 *               contactName: { type: string, minLength: 2, maxLength: 120, example: Julia Condori }
 *               email: { type: string, format: email, example: julia@boticasantarosa.pe }
 *               phone: { type: string, pattern: '^[\d\s+-]{6,20}$', example: '+51 954 123 456' }
 *               industry: { type: string, maxLength: 80, example: Pharmacy }
 *               modules: { type: array, items: { type: string, enum: [sales, inventory] }, description: Optional modules of interest }
 *               message: { type: string, maxLength: 1000 }
 *               website: { type: string, description: Honeypot; leave empty }
 *     responses:
 *       201:
 *         description: Request received
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ok: { type: boolean, example: true } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { description: TOO_MANY_REQUESTS }
 */
publicRouter.post(
  '/access-requests',
  rateLimit({ limit: ACCESS_REQUESTS_PER_HOUR, windowMs: 60 * 60 * 1000 }),
  publicController.createAccessRequest,
);

// Unknown public routes end here instead of falling through to the protected routes.
publicRouter.use(notFoundHandler);

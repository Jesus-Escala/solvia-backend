import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { tenantScope } from '../middleware/tenantScope';
import { authRouter } from './auth.routes';
import { customerRouter } from './customer.routes';
import { dashboardRouter } from './dashboard.routes';
import { platformRouter } from './platform.routes';
import { productRouter } from './product.routes';
import { publicRouter } from './public.routes';
import { receivableRouter } from './receivable.routes';
import { settingsRouter } from './settings.routes';
import { usersRouter } from './user.routes';

export const apiRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     security: []
 *     responses:
 *       200: { description: Service is up }
 */
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'solvia-backend', timestamp: new Date().toISOString() });
});

// Public routes
apiRouter.use('/auth', authRouter);
apiRouter.use('/public', publicRouter);

// Platform backoffice: separate admin accounts and tokens, cross-tenant by design.
apiRouter.use('/admin', platformRouter);

// Everything below requires a valid access token and runs inside the caller's tenant scope.
const protectedRouter = Router();
protectedRouter.use(authenticate, tenantScope);
protectedRouter.use('/users', usersRouter);
protectedRouter.use('/customers', customerRouter);
protectedRouter.use('/receivables', receivableRouter);
protectedRouter.use('/products', productRouter);
protectedRouter.use('/settings', settingsRouter);
protectedRouter.use('/', dashboardRouter);

apiRouter.use(protectedRouter);

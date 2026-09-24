import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { openApiSpec } from './config/swagger';
import { localeMiddleware } from './lib/locale';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';
import { FILES_ROUTE, storageRoot } from './services/storage.service';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Allow the frontend (another origin in development) to display proofs and statements.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  // Language of the customer-facing output (statements, WhatsApp messages).
  app.use(localeMiddleware);
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // Uploaded payment proofs and generated statements (random, unguessable file names).
  app.use(FILES_ROUTE, express.static(storageRoot, { fallthrough: false, maxAge: '1h' }));

  // API documentation
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, { customSiteTitle: 'Solvia API' }),
  );

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

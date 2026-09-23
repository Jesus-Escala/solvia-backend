import { createApp } from './app';
import { env } from './config/env';
import { seedIfEmpty } from './database/seed';
import { startScheduler, stopScheduler } from './jobs/scheduler';
import { logger } from './lib/logger';
import { basePrisma } from './lib/prisma';

async function main() {
  await basePrisma.$connect();

  if (env.SEED_ON_START) {
    await seedIfEmpty();
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`Solvia API listening on port ${env.PORT}`);
    logger.info(`API docs available at ${env.PUBLIC_API_URL}/api/docs`);
  });

  startScheduler();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    await stopScheduler();
    server.close(async () => {
      await basePrisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (error: unknown) => {
  logger.error('Failed to start the server', error);
  await basePrisma.$disconnect();
  process.exit(1);
});

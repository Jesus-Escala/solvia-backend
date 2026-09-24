/**
 * Local PostgreSQL for development, without Docker or a system install.
 *
 *   npm run db:local        # starts PostgreSQL 17 on localhost:5432 (Ctrl+C to stop)
 *
 * Data lives in `.local-db/` (gitignored), so it survives restarts. Credentials match the
 * default DATABASE_URL in .env.example: postgresql://solvia:solvia@localhost:5432/solvia
 * The first run initializes the cluster; then run `npm run db:deploy` and `npm run db:seed`.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const databaseDir = fileURLToPath(new URL('../.local-db', import.meta.url));
const port = Number(process.env.LOCAL_DB_PORT ?? 5432);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'solvia',
  password: 'solvia',
  port,
  persistent: true,
  // UTF-8 whatever the OS locale (on Windows it would default to WIN1252, which rejects emoji
  // and other characters outside that code page).
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

const firstRun = !existsSync(databaseDir);
if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase('solvia');

console.log(`PostgreSQL ready on localhost:${port} (data: .local-db)`);
if (firstRun) console.log('New database: run `npm run db:deploy` and `npm run db:seed`.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// Keep the process alive while PostgreSQL runs.
setInterval(() => {}, 1 << 30);

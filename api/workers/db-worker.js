// DB service worker — owns the single better-sqlite3 connection.
// All other PM2 processes connect as clients via Unix socket.
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { logger } from '../lib/logger.js';
import { runMigrations } from '../lib/migrations.js';
import { startDbService } from '../lib/db-service.js';

async function main() {
  logger.info('DB worker: running migrations');
  await runMigrations();
  logger.info('DB worker: migrations complete, starting DB service');
  await startDbService();
  logger.info('DB worker: ready');
}

main().catch((err) => {
  logger.error({ err }, 'DB worker: fatal error');
  process.exit(1);
});

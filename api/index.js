/**
 * SifterSearch API Entry Point
 *
 * Validates environment, starts the Fastify server, and signals PM2
 * readiness for zero-downtime reloads.
 * Run with: node api/index.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get project root (one level up from api/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Load environment files: .env-secrets first (overrides), then .env-public (defaults)
// Use absolute paths to ensure it works regardless of working directory
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { startApi } from './lib/api-runtime.js';
import { ALL_ROUTES } from './routes/sets/all.js';

// THE SEARCH API (siftersearch-api) — every route until the gateway sends Anís and ops traffic to their own services
// (docs/architecture/continuous-deploy.md); then SEARCH_ROUTES only.
await startApi({ name: 'siftersearch-api', routes: ALL_ROUTES, role: 'primary' });

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
import { SEARCH_ROUTES } from './routes/sets/search.js';

// THE SEARCH API (siftersearch-api, 7845 behind the gateway): search, library, documents, the public and admin APIs. Anís
// and ops traffic goes to their own services (api/gateway.js), so an Anís update never reloads search
// (docs/architecture/continuous-deploy.md). Tests use api/server.js — every route.
await startApi({ name: 'siftersearch-api', routes: SEARCH_ROUTES, role: 'primary' });

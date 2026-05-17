#!/usr/bin/env node
// Manual trigger: sync entity aliases → Meilisearch paragraphs synonym map.
// Run after adding/merging entities or after graph-promoter processes a batch.
// Usage: node scripts/sync-aliases-to-meili.js

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { runMigrations } from '../api/lib/migrations.js';
import { syncAliasesToMeili } from '../api/lib/graph-meili-sync.js';

await runMigrations();
const result = await syncAliasesToMeili();
console.log('Done:', result);
process.exit(0);

#!/usr/bin/env node
// Manual trigger for the sites ingester.
//
// Usage:
//   node scripts/sites-ingest.mjs                   # all sites
//   node scripts/sites-ingest.mjs --site oceanlibrary.com
//   node scripts/sites-ingest.mjs --site oceanlibrary.com --force
//
// `--force` bypasses the 4h Dropbox-stability cooldown and the file_hash
// unchanged short-circuit. Use after a confirmed full sync.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const args = process.argv.slice(2);
function arg(name, def = null) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; }
const siteId = arg('--site');
const force = args.includes('--force');
const thresholdArg = arg('--threshold');
const threshold = thresholdArg ? parseFloat(thresholdArg) : undefined;
const limitArg = arg('--limit');
const limit = limitArg ? parseInt(limitArg, 10) : undefined;

const opts = { force };
if (threshold !== undefined) opts.threshold = threshold;
if (limit !== undefined && !Number.isNaN(limit)) opts.limit = limit;

const { ingestSite, ingestAllSites } = await import(join(ROOT, 'api/services/sites-ingester.js'));

const start = Date.now();
let result;
if (siteId) {
  console.log(`▶ ingesting ${siteId} (force=${force})`);
  result = await ingestSite(siteId, opts);
} else {
  console.log(`▶ ingesting all sites (force=${force})`);
  result = await ingestAllSites(opts);
}

console.log(`✔ done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(JSON.stringify(result, null, 2));
process.exit(0);

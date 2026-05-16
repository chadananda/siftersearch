#!/usr/bin/env node
// Backfill source_url for locally-ingested docs that have an OceanLibrary.com
// equivalent in the DB (matched by exact title). Sets source_url on the local
// doc so search results cite the canonical OL URL instead of siftersearch.com/document/[id].
// After updating the DB, marks the affected docs for Meili re-sync by touching updated_at.
//
// Run on tower-nas: node scripts/backfill-doc-source-urls.mjs
// Or locally if DB accessible; defaults to env-configured path.

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

// Import DB from the API lib — uses the configured SQLite path
const require = createRequire(import.meta.url);
const { query, queryAll } = require('./api/lib/db.js');

// Step 1: Build a map of lowercase title → oceanlibrary source_url
console.log('Building OL source_url map...');
const olDocs = await queryAll(
  `SELECT id, title, source_url FROM docs WHERE source_url LIKE '%oceanlibrary.com%' AND title IS NOT NULL AND title != ''`
);
const olMap = new Map();
for (const d of olDocs) {
  olMap.set(d.title.trim().toLowerCase(), d.source_url);
}
console.log(`  ${olMap.size} OceanLibrary.com documents indexed by title\n`);

// Step 2: Find local docs (no source_url) whose titles match
const localDocs = await queryAll(
  `SELECT id, title FROM docs WHERE (source_url IS NULL OR source_url = '') AND title IS NOT NULL AND title != ''`
);
console.log(`  ${localDocs.length} local docs without source_url\n`);

let updated = 0;
const updates = [];
for (const d of localDocs) {
  const olUrl = olMap.get(d.title.trim().toLowerCase());
  if (olUrl) {
    updates.push({ id: d.id, title: d.title, source_url: olUrl });
  }
}

console.log(`Found ${updates.length} docs with OceanLibrary.com equivalents:\n`);
updates.slice(0, 20).forEach(u => console.log(`  [${u.id}] ${u.title.slice(0, 70)}`));
if (updates.length > 20) console.log(`  ... and ${updates.length - 20} more`);
console.log();

if (updates.length === 0) {
  console.log('Nothing to update.');
  process.exit(0);
}

// Step 3: Apply updates in batches
const BATCH = 50;
for (let i = 0; i < updates.length; i += BATCH) {
  const batch = updates.slice(i, i + BATCH);
  for (const u of batch) {
    await query(
      `UPDATE docs SET source_url = ?, source_site = 'oceanlibrary.com', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [u.source_url, u.id]
    );
  }
  process.stdout.write(`\r  Updated ${Math.min(i + BATCH, updates.length)}/${updates.length}...`);
}
console.log(`\n\n✓ Updated ${updates.length} docs with OceanLibrary.com source URLs`);

// Step 4: Mark updated docs as needing Meili re-sync
// The sync-processor watches for updated_at changes; touching it is enough.
console.log('\nDocs marked for Meili re-sync (via updated_at touch). The sync worker');
console.log('will pick them up on its next pass and update the source_url in Meili.\n');

console.log('Done. Re-start siftersearch-worker if re-sync is not automatic.');

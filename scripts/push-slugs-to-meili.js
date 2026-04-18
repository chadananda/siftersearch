#!/usr/bin/env node
// Push docs.slug for recently-regenerated documents up to Meilisearch.
// Used as a follow-up if regenerate-slugs.js couldn't reach Meili at the time.
//
// Finds docs whose slug was changed in the last N minutes (via redirects
// created_at) and batch-updates the Meili documents index.
//
// Usage: node scripts/push-slugs-to-meili.js [--since-minutes 60]

import { queryAll } from '../api/lib/db.js';
import { getMeili, INDEXES } from '../api/lib/search.js';

const args = process.argv.slice(2);
const mIdx = args.indexOf('--since-minutes');
const sinceMinutes = mIdx >= 0 ? parseInt(args[mIdx + 1], 10) : 60;

const rows = await queryAll(
  `SELECT DISTINCT d.id, d.slug FROM docs d
   JOIN redirects r ON r.doc_id = CAST(d.id AS TEXT)
   WHERE d.deleted_at IS NULL AND d.slug IS NOT NULL
     AND r.created_at > datetime('now', '-' || ? || ' minutes')`,
  [sinceMinutes]
);
console.log(`Pushing ${rows.length} slug updates to Meili`);

const meili = getMeili();
const idx = meili.index(INDEXES.DOCUMENTS);
let ok = 0, fail = 0;
const batchSize = 500;
for (let i = 0; i < rows.length; i += batchSize) {
  const chunk = rows.slice(i, i + batchSize).map(r => ({ id: r.id, slug: r.slug }));
  try {
    await idx.updateDocuments(chunk, { primaryKey: 'id' });
    ok += chunk.length;
    console.log(`  ${ok}/${rows.length}`);
  } catch (e) {
    fail += chunk.length;
    console.error(`  batch failed: ${e.message}`);
  }
}
console.log(`Done: ok=${ok} fail=${fail}`);
process.exit(0);

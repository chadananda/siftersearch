#!/usr/bin/env node
// Backfill slug for docs missing it. Safe to re-run: skips docs that already have slugs.
// Run on tower-nas: node scripts/backfill-missing-slugs.js [--dry-run]

import { query, queryAll } from '../api/lib/db.js';
import { generateDocSlug } from '../api/lib/slug.js';
import { runMigrations } from '../api/lib/migrations/runner.js';

const dryRun = process.argv.includes('--dry-run');

await runMigrations();

const docs = queryAll(`
  SELECT id, title, author, filename, religion, collection, language, source_url
  FROM docs
  WHERE (slug IS NULL OR slug = '')
    AND deleted_at IS NULL
  ORDER BY id
`);

console.log(`Found ${docs.length} docs missing slugs`);
if (dryRun) console.log('(dry-run — no changes written)');

let fixed = 0, skipped = 0;
for (const doc of docs) {
  const slug = generateDocSlug(doc);
  if (!slug) { skipped++; continue; }

  // Check uniqueness — append doc id if slug collides
  let finalSlug = slug;
  const existing = query('SELECT id FROM docs WHERE slug = ? AND id != ?', [slug, doc.id]);
  if (existing) finalSlug = `${slug}-${doc.id}`;

  if (!dryRun) {
    query('UPDATE docs SET slug = ? WHERE id = ?', [finalSlug, doc.id]);
  }
  console.log(`  ${doc.id}: "${doc.title?.slice(0, 50)}" → ${finalSlug}`);
  fixed++;
}

console.log(`\nDone: ${fixed} slugs backfilled, ${skipped} skipped (no title or filename)`);

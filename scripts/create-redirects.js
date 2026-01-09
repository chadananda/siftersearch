#!/usr/bin/env node
/**
 * Create redirects for old collection URLs
 */

import '../api/lib/config.js';
import { query, queryAll } from '../api/lib/db.js';

async function main() {
  console.log('Creating redirects for changed collection URLs...\n');

  // Core Tablets (was INBA)
  const coreDocs = await queryAll(`
    SELECT slug FROM docs
    WHERE collection = 'Core Tablets'
    AND slug IS NOT NULL
    AND slug != ''
  `);

  console.log(`Found ${coreDocs.length} Core Tablets documents`);

  let added = 0;
  for (const doc of coreDocs) {
    const oldPath = '/library/bahai/inba/' + doc.slug;
    const newPath = '/library/bahai/core-tablets/' + doc.slug;
    try {
      await query(
        `INSERT OR IGNORE INTO redirects (old_path, new_path, created_at) VALUES (?, ?, datetime('now'))`,
        [oldPath, newPath]
      );
      added++;
    } catch (e) {
      // Ignore duplicates
    }
  }
  console.log(`Added ${added} redirects\n`);

  // Verify
  const count = await queryAll(`SELECT COUNT(*) as c FROM redirects`);
  console.log(`Total redirects in database: ${count[0].c}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

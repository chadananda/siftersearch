#!/usr/bin/env node
/**
 * One-time fix script to populate NULL normalized_hash values
 * Run on server: node scripts/fix-normalized-hash.js
 */

import { createHash } from 'crypto';
import { query, queryAll } from '../api/lib/db.js';

function normalizeForEmbedding(text) {
  return text
    .replace(/<[^>]+>/g, '')           // Remove HTML tags
    .replace(/\s+/g, ' ')              // Collapse whitespace
    .replace(/[^\p{L}\p{N}\s]/gu, '')  // Remove punctuation
    .toLowerCase()
    .trim();
}

function computeNormalizedHash(text) {
  const normalized = normalizeForEmbedding(text);
  return createHash('md5').update(normalized).digest('hex');
}

async function fixNormalizedHashes() {
  console.log('Finding content with NULL normalized_hash...');

  const rows = await queryAll(`
    SELECT id, text FROM content
    WHERE normalized_hash IS NULL AND text IS NOT NULL
    LIMIT 1000
  `);

  if (rows.length === 0) {
    console.log('No rows with NULL normalized_hash found. Done!');
    return;
  }

  console.log(`Found ${rows.length} rows to fix...`);

  let fixed = 0;
  for (const row of rows) {
    const hash = computeNormalizedHash(row.text);
    await query(
      'UPDATE content SET normalized_hash = ? WHERE id = ?',
      [hash, row.id]
    );
    fixed++;
    if (fixed % 100 === 0) {
      console.log(`Fixed ${fixed}/${rows.length}...`);
    }
  }

  console.log(`Fixed ${fixed} rows.`);

  // Check if more remain
  const remaining = await queryAll(`
    SELECT COUNT(*) as count FROM content
    WHERE normalized_hash IS NULL AND text IS NOT NULL
  `);

  if (remaining[0]?.count > 0) {
    console.log(`${remaining[0].count} more rows remain. Run again to continue.`);
  } else {
    console.log('All done!');
  }
}

fixNormalizedHashes().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

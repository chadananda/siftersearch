#!/usr/bin/env node
/**
 * Check which documents have file paths and which don't
 */
import '../api/lib/config.js';
import { queryAll, queryOne } from '../api/lib/db.js';

async function main() {
  // Overall stats
  const stats = await queryOne(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN file_path IS NOT NULL THEN 1 ELSE 0 END) as with_path,
      SUM(CASE WHEN file_path IS NULL THEN 1 ELSE 0 END) as without_path
    FROM docs
  `);

  console.log('\n=== Document File Path Stats ===');
  console.log('Total documents:', stats.total);
  console.log('With file path:', stats.with_path);
  console.log('Without file path:', stats.without_path);

  // Show some examples with paths
  const withPath = await queryAll(`
    SELECT id, title, file_path
    FROM docs
    WHERE file_path IS NOT NULL
    LIMIT 5
  `);

  if (withPath.length > 0) {
    console.log('\n=== Examples WITH file path ===');
    withPath.forEach(d => {
      console.log(`  ${d.id}: ${d.file_path}`);
    });
  }

  // Show documents without paths
  const withoutPath = await queryAll(`
    SELECT id, title, author, religion
    FROM docs
    WHERE file_path IS NULL
    ORDER BY author
    LIMIT 20
  `);

  if (withoutPath.length > 0) {
    console.log('\n=== Documents WITHOUT file path (first 20) ===');
    withoutPath.forEach(d => {
      console.log(`  ${d.id}`);
      console.log(`    ${d.title}`);
      console.log(`    Author: ${d.author}, Religion: ${d.religion}`);
    });
  }
}

main().catch(console.error);

/**
 * Deduplication script for documents with duplicate slugs
 *
 * Strategy:
 * 1. For each set of duplicate slugs, keep the doc with most content
 * 2. If content count is equal, keep the older (lower ID) document
 * 3. Delete duplicate doc entries
 * 4. Orphaned content will be cleaned up separately
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/Users/chad/sifter/siftersearch/data/sifter.db';
const db = new Database(DB_PATH);

// Find all duplicate slugs with their doc IDs and content counts
const duplicates = db.prepare(`
  SELECT
    d.id,
    d.slug,
    d.title,
    d.created_at,
    (SELECT COUNT(*) FROM content WHERE doc_id = d.id) as content_count
  FROM docs d
  WHERE d.slug IN (
    SELECT slug
    FROM docs
    WHERE slug IS NOT NULL AND slug != ''
    GROUP BY slug
    HAVING COUNT(*) > 1
  )
  ORDER BY d.slug, content_count DESC, d.id ASC
`).all();

// Group by slug
const bySlug = {};
for (const doc of duplicates) {
  if (!bySlug[doc.slug]) bySlug[doc.slug] = [];
  bySlug[doc.slug].push(doc);
}

console.log(`Found ${Object.keys(bySlug).length} slugs with duplicates\n`);

const toDelete = [];
const toKeep = [];

for (const [slug, docs] of Object.entries(bySlug)) {
  // Already sorted by content_count DESC, id ASC
  // So first doc is the one to keep (most content, or oldest if tied)
  const keep = docs[0];
  const deleteList = docs.slice(1);

  toKeep.push(keep);
  toDelete.push(...deleteList);

  console.log(`Slug: ${slug.slice(0, 60)}...`);
  console.log(`  Keep: ID ${keep.id} (${keep.content_count} paragraphs)`);
  for (const d of deleteList) {
    console.log(`  Delete: ID ${d.id} (${d.content_count} paragraphs)`);
  }
}

console.log(`\nSummary: Keep ${toKeep.length} docs, delete ${toDelete.length} docs`);

// Dry run by default
if (process.argv.includes('--execute')) {
  const deleteStmt = db.prepare('DELETE FROM docs WHERE id = ?');
  const deleteContentStmt = db.prepare('DELETE FROM content WHERE doc_id = ?');

  let deletedDocs = 0;
  let deletedContent = 0;

  db.exec('BEGIN TRANSACTION');
  try {
    for (const doc of toDelete) {
      // Delete content first
      const contentResult = deleteContentStmt.run(doc.id);
      deletedContent += contentResult.changes;

      // Delete doc
      const docResult = deleteStmt.run(doc.id);
      deletedDocs += docResult.changes;
    }
    db.exec('COMMIT');
    console.log(`\n✓ Deleted ${deletedDocs} duplicate docs and ${deletedContent} orphaned content rows`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Error:', err.message);
    process.exit(1);
  }
} else {
  console.log('\nDry run - use --execute to apply changes');
}

db.close();

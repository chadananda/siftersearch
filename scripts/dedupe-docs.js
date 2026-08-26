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
  // GUARDED + REVERSIBLE (2026-08-26). This block previously ran two raw better-sqlite3 statements —
  //   DELETE FROM content WHERE doc_id = ?;  DELETE FROM docs WHERE id = ?
  // — a PERMANENT purge, on a directly-opened handle, bypassing the single writer, with no check that the
  // survivor held anything or that the victim was the last copy of its work. Soft deletion is the only
  // reason the June restore was possible: 14,588 paragraphs of 20 canonicals came back because the rows
  // were still there. A hard delete forecloses that.
  const { markDuplicate, softDeleteDocs } = await import('../api/lib/docs-repo.js');
  let deletedDocs = 0;
  for (const doc of toDelete) {
    const keeper = toKeep.find((k) => k.slug === doc.slug);
    if (keeper) {
      try {
        await markDuplicate(doc.id, keeper.id, { reason: 'dedupe-docs:slug' });
      } catch (err) {
        console.log(`  REFUSED to point ${doc.id} at ${keeper.id}: ${err.message}`);
        continue;
      }
    }
    const res = await softDeleteDocs([doc.id], { reason: 'dedupe-docs:slug' });
    if (res.refused?.length) { console.log(`  REFUSED ${doc.id}: ${res.refused[0].why}`); continue; }
    deletedDocs += res.deleted;
  }
  console.log(`\n✓ Soft-deleted ${deletedDocs} duplicate docs (reversible; content retained)`);
} else {
  console.log('\nDry run - use --execute to apply changes');
}

db.close();

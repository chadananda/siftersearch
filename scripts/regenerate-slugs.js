#!/usr/bin/env node
// Regenerate docs.slug using current slug logic (NFD diacritics). Updates
// only changed rows, creates redirects (old_path → new_path), and pushes
// new slugs to Meilisearch documents index.
//
// Usage:
//   node scripts/regenerate-slugs.js            # Dry run
//   node scripts/regenerate-slugs.js --apply    # Apply
//   node scripts/regenerate-slugs.js --limit N  # Cap scan size

import { query, queryAll } from '../api/lib/db.js';
import { generateDocSlug, slugifyPath } from '../api/lib/slug.js';
import { getMeili, INDEXES } from '../api/lib/search.js';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;

async function main() {
  console.log(dryRun ? '=== DRY RUN (use --apply to commit) ===' : '=== APPLYING CHANGES ===');

  const docs = await queryAll(`
    SELECT id, title, author, language, filename, file_path, religion, collection, slug
    FROM docs
    WHERE deleted_at IS NULL AND slug IS NOT NULL AND slug != ''
    ORDER BY id
    ${limit ? `LIMIT ${limit}` : ''}
  `);
  console.log(`Scanning ${docs.length} documents`);

  // Slug uniqueness is scoped per (religion, collection) — matches ingester logic.
  const scopeSlugs = new Map();
  const scopeKey = (religion, collection) => `${religion || ''}|${collection || ''}`;

  const allRows = await queryAll(
    `SELECT religion, collection, slug FROM docs
     WHERE deleted_at IS NULL AND slug IS NOT NULL AND slug != ''`
  );
  for (const r of allRows) {
    const k = scopeKey(r.religion, r.collection);
    if (!scopeSlugs.has(k)) scopeSlugs.set(k, new Set());
    scopeSlugs.get(k).add(r.slug);
  }

  const changes = [];
  for (const d of docs) {
    const filename = d.file_path ? d.file_path.split('/').pop() : d.filename;
    const base = generateDocSlug({
      title: d.title, author: d.author, language: d.language, filename
    });
    if (!base) continue;

    const k = scopeKey(d.religion, d.collection);
    const scope = scopeSlugs.get(k);

    // If the current slug is already base or base-N (where N is any number),
    // it's just a uniqueness-suffix variant of what we'd generate — keep it
    // to avoid churning redirects over cosmetic renumbering.
    const currentMatchesBase =
      d.slug === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}-\\d+$`).test(d.slug);
    if (currentMatchesBase) continue;

    scope.delete(d.slug);

    let newSlug = base;
    if (scope.has(newSlug)) {
      let i = 2;
      while (scope.has(`${base}-${i}`)) i++;
      newSlug = `${base}-${i}`;
    }
    scope.add(newSlug);

    if (newSlug !== d.slug) {
      changes.push({
        id: d.id, oldSlug: d.slug, newSlug,
        religion: d.religion, collection: d.collection,
        title: d.title, author: d.author
      });
    }
  }

  console.log(`\n${changes.length} slugs will change:\n`);
  for (const c of changes.slice(0, 30)) {
    console.log(`  [${c.id}] ${c.oldSlug}`);
    console.log(`         → ${c.newSlug}    (${c.author || '—'} / ${c.title || '—'})`);
  }
  if (changes.length > 30) console.log(`  ... and ${changes.length - 30} more`);

  if (dryRun) {
    console.log('\nRun with --apply to commit');
    process.exit(0);
  }

  let meili = null;
  try { meili = getMeili(); } catch { /* optional */ }

  let updated = 0;
  let redirected = 0;
  let meiliOk = 0;
  let meiliFailed = 0;

  for (const c of changes) {
    const religionSlug = slugifyPath(c.religion || '');
    const collectionSlug = slugifyPath(c.collection || '');
    const validPath = religionSlug && collectionSlug && religionSlug !== 'general';

    await query(
      'UPDATE docs SET slug = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [c.newSlug, c.id]
    );

    if (validPath) {
      const oldPath = `/library/${religionSlug}/${collectionSlug}/${c.oldSlug}`;
      const newPath = `/library/${religionSlug}/${collectionSlug}/${c.newSlug}`;
      await query(
        `INSERT INTO redirects (old_path, new_path, doc_id)
         VALUES (?, ?, ?)
         ON CONFLICT(old_path) DO UPDATE SET
           new_path = excluded.new_path,
           doc_id = excluded.doc_id,
           cf_synced = 0`,
        [oldPath, newPath, String(c.id)]
      );
      redirected++;
    }

    if (meili) {
      try {
        await meili.index(INDEXES.DOCUMENTS).updateDocuments(
          [{ id: c.id, slug: c.newSlug }],
          { primaryKey: 'id' }
        );
        meiliOk++;
      } catch (err) {
        meiliFailed++;
        if (meiliFailed <= 5) {
          console.error(`  Meili update failed for ${c.id}: ${err.message}`);
        }
      }
    }

    updated++;
    if (updated % 200 === 0) console.log(`  progress: ${updated}/${changes.length}`);
  }

  console.log('\n=== Summary ===');
  console.log(`Docs updated:      ${updated}`);
  console.log(`Redirects written: ${redirected}`);
  console.log(`Meili updated:     ${meiliOk}${meiliFailed ? ` (${meiliFailed} failed)` : ''}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

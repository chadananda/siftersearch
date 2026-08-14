#!/usr/bin/env node
// Repair documents whose author/title are FILE LOCATORS rather than metadata.
//
// bahai-library stubs derive both from the source path, so /pdf/z/zwemer_islam_challenge_faith.pdf became
// author "pdf-z-zwemer", title "zwemer_islam_challenge_faith". The converter now refuses to propagate that
// (api/lib/text/source-metadata.js), but ~2,058 documents converted before the fix still carry it, where it
// is indistinguishable from a real person in citations, search facets and the entity layer.
//
// Recovers from the document's OWN opening text — the same rule as the converter: recover what the document
// states, write nothing where it states nothing. A wrong author is worse than an absent one.
//
//   node scripts/backfill-source-metadata.mjs            # DRY RUN — report only
//   node scripts/backfill-source-metadata.mjs --apply    # write via the single writer
//   node scripts/backfill-source-metadata.mjs --limit=50 # bound the pass
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../api/lib/db.js');
const { resolveSourceMetadata, isLocatorAuthor, isFilenameTitle } = await import('../api/lib/text/source-metadata.js');

const APPLY = process.argv.includes('--apply');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 5000;

// The locator shape, as SQL: '<ext>-' prefix. Kept broad here and confirmed per-row by isLocatorAuthor(),
// so the SQL never has to encode the full rule twice.
const docs = await queryAll(
  `SELECT id, title, author, file_path FROM docs
    WHERE deleted_at IS NULL
      AND (author LIKE 'pdf-%' OR author LIKE 'doc-%' OR author LIKE 'docx-%'
           OR author LIKE 'html-%' OR author LIKE 'txt-%' OR author LIKE 'epub-%')
    ORDER BY id LIMIT ?`, [LIMIT], 'backfill:locator-docs');

console.log(`Documents carrying a locator author: ${docs.length}${APPLY ? '' : '  (DRY RUN)'}\n`);

const tally = { recovered: 0, authorOnly: 0, titleOnly: 0, unknown: 0, skipped: 0 };
const samples = [];

for (const d of docs) {
  if (!isLocatorAuthor(d.author) && !isFilenameTitle(d.title)) { tally.skipped++; continue; }
  // The document's own opening — the only honest source for what it is.
  const head = await queryAll(
    `SELECT text FROM content WHERE doc_id=? AND deleted_at IS NULL AND blocktype IN ('paragraph','quote')
      ORDER BY paragraph_index LIMIT 12`, [d.id], 'backfill:doc-head');
  const text = head.map((r) => r.text).join('\n');
  const meta = resolveSourceMetadata({ stubTitle: d.title, stubAuthor: d.author, text });

  if (meta.author && meta.title) tally.recovered++;
  else if (meta.author) tally.authorOnly++;
  else if (meta.title) tally.titleOnly++;
  else tally.unknown++;

  if (samples.length < 12) samples.push({ id: d.id, was: `${d.author} / ${d.title}`.slice(0, 60), now: `${meta.author || '—'} / ${meta.title || '—'}`.slice(0, 60) });

  if (APPLY) {
    // NULL, never a placeholder: an empty author is honest and fixable; a fabricated one is neither.
    await query(`UPDATE docs SET author=?, title=COALESCE(?, title), updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [meta.author, meta.title, d.id], 'backfill:write-metadata');
  }
}

console.log('  recovered both  :', tally.recovered);
console.log('  author only     :', tally.authorOnly);
console.log('  title only      :', tally.titleOnly);
console.log('  neither (NULLed):', tally.unknown, '← need a human or a better source');
console.log('  skipped (clean) :', tally.skipped);
console.log('\n  samples:');
for (const s of samples) console.log(`    ${s.id}  ${s.was}\n        → ${s.now}`);
if (!APPLY) console.log('\n  DRY RUN — nothing written. Re-run with --apply to write via the single writer.');
process.exit(0);

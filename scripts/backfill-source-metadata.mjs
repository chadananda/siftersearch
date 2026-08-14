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
const { auditLocatorMetadata } = await import('../api/lib/ingest/metadata-repair.js');

const APPLY = process.argv.includes('--apply');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 5000;

// The rule lives in api/lib/ingest/metadata-repair.js, shared with GET/POST /api/admin/ingest/metadata-*.
// A CLI copy would be a second implementation of a rule that decides what live documents claim about their
// own authorship — exactly the drift this codebase has been paying for all week.
const r = await auditLocatorMetadata({ limit: LIMIT, apply: APPLY });

console.log(`Candidates: ${r.candidates}${APPLY ? '' : '  (DRY RUN)'}\n`);
console.log('  recovered both  :', r.recoveredBoth);
console.log('  author only     :', r.authorOnly);
console.log('  title only      :', r.titleOnly);
console.log('  neither (NULLed):', r.neither, '\u2190 need a human or a better source');
console.log('  skipped (clean) :', r.skipped);
console.log('  recovery rate   :', r.recoveryRate + '%');
if (APPLY) console.log('  WRITTEN         :', r.written);
console.log('\n  samples:');
for (const s of r.samples) {
  console.log(`    ${s.id}  ${s.fromAuthor} / ${s.fromTitle}`);
  console.log(`        \u2192 ${s.toAuthor || '\u2014 (null)'} / ${s.toTitle}`);
}
if (!APPLY) console.log('\n  DRY RUN — nothing written. Re-run with --apply, or POST /api/admin/ingest/metadata-backfill.');
process.exit(0);

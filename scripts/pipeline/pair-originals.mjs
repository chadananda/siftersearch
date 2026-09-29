// Pair translation paragraphs with ORIGINAL paragraphs by content.id (content_alignment, migration 128).
//
//   node scripts/pipeline/pair-originals.mjs --stage anchor --dry     # report only
//   node scripts/pipeline/pair-originals.mjs --stage anchor           # write
//
// anchor: every paragraph that already carries a verified original (CTAI / bahai.org, content.original_text) is
// located verbatim in the ingested originals (Baha'i/Core Tablets) — accepted only at ≥80% letter coverage.
// Run on tower-nas (via /api/admin/server/pair-originals): it reads the live database and writes through the writer.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });

const { queryAll, transaction } = await import('../../api/lib/db.js');
const { buildIndex, locate } = await import('../../api/lib/rag/concepts/anchor.js');

const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const stage = val('--stage') || 'anchor';
const dry = args.includes('--dry');
const METHOD = 'anchor-v1';

const t0 = Date.now();
const originals = await queryAll(
  `SELECT c.id, c.doc_id AS docId, c.text FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE d.file_path LIKE 'Baha''i/Core Tablets/%' AND d.language IN ('ar', 'fa')
      AND c.deleted_at IS NULL AND d.deleted_at IS NULL`, [], 'pair:originals');
const index = buildIndex(originals);
console.log(`originals ${originals.length} paragraphs indexed in ${Math.round((Date.now() - t0) / 1000)}s`);

if (stage === 'anchor') {
  const targets = await queryAll(
    `SELECT c.id, c.doc_id AS docId, c.original_text AS original FROM content c
      WHERE c.original_text IS NOT NULL AND c.deleted_at IS NULL`, [], 'pair:anchor-targets');
  const perDoc = new Map();
  const rows = [];
  for (const t of targets) {
    const d = perDoc.get(t.docId) || { total: 0, located: 0, rejected: 0, none: 0, coverage: [] };
    perDoc.set(t.docId, d);
    d.total++;
    const r = locate(t.original, index);
    if (!r) { d.none++; continue; }
    if (r.rejected) { d.rejected++; continue; }
    d.located++; d.coverage.push(r.coverage);
    for (const origId of r.paraIds) rows.push({ trans: t.id, orig: origId, transDoc: t.docId, origDoc: r.docId, score: r.coverage });
  }
  console.log(`targets ${targets.length} | located ${targets.length - [...perDoc.values()].reduce((a, d) => a + d.rejected + d.none, 0)} | pairs ${rows.length}`);
  for (const [docId, d] of [...perDoc].sort((a, b) => b[1].total - a[1].total)) {
    const med = d.coverage.sort((a, b) => a - b)[Math.floor(d.coverage.length / 2)] ?? null;
    console.log(`  doc ${docId}: ${d.located}/${d.total} located (${(100 * d.located / d.total).toFixed(0)}%) · rejected ${d.rejected} · none ${d.none} · median coverage ${med}`);
  }
  if (!dry) {
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      await transaction(rows.slice(i, i + 500).map((r) => ({
        sql: `INSERT OR IGNORE INTO content_alignment (trans_id, orig_id, trans_doc, orig_doc, basis, score, method)
              VALUES (?, ?, ?, ?, 'anchor-exact', ?, ?)`,
        args: [r.trans, r.orig, r.transDoc, r.origDoc, r.score, METHOD] })), 'pair:anchor');
      written += Math.min(500, rows.length - i);
    }
    console.log(`written ${written}`);
  }
}
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(0);

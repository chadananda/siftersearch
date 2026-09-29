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
const METHOD = 'anchor-v4';   // v4: alif/hamza-free letter key (editions spell hamza differently)

const t0 = Date.now();
const originals = await queryAll(
  `SELECT c.id, c.doc_id AS docId, c.text FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE d.file_path LIKE 'Baha''i/Core Tablets/%' AND d.language IN ('ar', 'fa')
      AND c.deleted_at IS NULL AND d.deleted_at IS NULL`, [], 'pair:originals');
const index = buildIndex(originals);
console.log(`originals ${originals.length} paragraphs indexed in ${Math.round((Date.now() - t0) / 1000)}s`);

if (stage === 'anchor') {
  const targets = await queryAll(
    `SELECT c.id, c.doc_id AS docId, c.paragraph_index AS pidx, c.text, c.original_text AS original FROM content c
      WHERE c.original_text IS NOT NULL AND c.deleted_at IS NULL`, [], 'pair:anchor-targets');
  const perDoc = new Map();
  const rows = [];
  // A citation note ("See Rúmí, The Mathnaví, II, 185") is not text of the work; two carried an original upstream.
  const NOTE = /^\s*(>?\s*\[\^|See [^.]{0,80}(,\s*[IVXL]+,\s*\d|_))/;
  // Two passes. A short original (under 60 letters — "Thou art, verily, the Ever-Forgiving") occurs in many volumes
  // and was anchored into an unrelated one; it is located only among the documents its neighbours (±5) landed in.
  const { letterKey } = await import('../../api/lib/rag/concepts/anchor.js');
  const usable = targets.filter((x) => !NOTE.test(x.text || ''));
  const isShort = (t) => letterKey(t.original).length < 60;
  const landed = new Map();                     // transDoc → [[pidx, origDoc]]
  const results = new Map();
  for (const t of usable.filter((x) => !isShort(x))) {
    const r = locate(t.original, index); results.set(t.id, r);
    if (r && !r.rejected) { if (!landed.has(t.docId)) landed.set(t.docId, []); landed.get(t.docId).push([Number(t.pidx), r.docId]); }
  }
  for (const t of usable.filter(isShort)) {
    const near = new Set((landed.get(t.docId) || []).filter(([i]) => Math.abs(i - Number(t.pidx)) <= 5).map(([, d]) => d));
    results.set(t.id, near.size ? locate(t.original, index, { allowDocs: near }) : null);
  }
  for (const t of usable) {
    const d = perDoc.get(t.docId) || { total: 0, located: 0, rejected: 0, none: 0, coverage: [] };
    perDoc.set(t.docId, d);
    d.total++;
    const r = results.get(t.id);
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
    // Replace, never delete: retire every earlier anchor pair, then upsert this run's — a pair this run confirms is
    // revived with its new score/method; one it no longer makes stays retired (and visible as such).
    await transaction([{ sql: `UPDATE content_alignment SET retired_at = unixepoch()
                                WHERE basis = 'anchor-exact' AND method <> ? AND retired_at IS NULL`, args: [METHOD] }], 'pair:anchor-retire');
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      await transaction(rows.slice(i, i + 500).map((r) => ({
        sql: `INSERT INTO content_alignment (trans_id, orig_id, trans_doc, orig_doc, basis, score, method)
              VALUES (?, ?, ?, ?, 'anchor-exact', ?, ?)
              ON CONFLICT (trans_id, orig_id) DO UPDATE SET basis = excluded.basis, score = excluded.score,
                method = excluded.method, retired_at = NULL`,
        args: [r.trans, r.orig, r.transDoc, r.origDoc, r.score, METHOD] })), 'pair:anchor');
      written += Math.min(500, rows.length - i);
    }
    console.log(`written ${written}`);
  }
}
if (stage === 'inherit') {
  // Same English as an anchored paragraph → the same originals. Compilations, duplicate copies and translation
  // collections repeat published renderings (measured: Sacred Writings 83%, Prayers 65%, duplicate copies 96-100%).
  const norm = (t) => String(t).replace(/⁅\/?s\d+⁆|\[[\d.]+\]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[’‘'`]/g, '').replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(Boolean);
  const shingles = (t) => { const w = norm(t); const out = new Set(); for (let i = 0; i + 6 <= w.length; i++) out.add(w.slice(i, i + 6).join(' ')); return out; };
  const anchored = await queryAll(
    `SELECT a.trans_id AS id, a.orig_id AS origId, a.orig_doc AS origDoc, c.text FROM content_alignment a
       JOIN content c ON c.id = a.trans_id WHERE a.basis = 'anchor-exact' AND a.retired_at IS NULL`, [], 'pair:anchored');
  const origOf = new Map(); const textOf = new Map();
  for (const a of anchored) { if (!origOf.has(a.id)) origOf.set(a.id, []); origOf.get(a.id).push([a.origId, a.origDoc]); textOf.set(a.id, a.text); }
  const idx = new Map();
  for (const [id, text] of textOf) for (const g of shingles(text)) { if (!idx.has(g)) idx.set(g, []); idx.get(g).push(id); }
  const anchoredDocs = new Set((await queryAll(`SELECT DISTINCT trans_doc AS d FROM content_alignment WHERE basis='anchor-exact'`, [], 'pair:adocs')).map((r) => r.d));
  // Translations of the Central Figures' words: their English docs, compilations and translation collections.
  const docs = (await queryAll(
    `SELECT id, title FROM docs WHERE deleted_at IS NULL AND COALESCE(language,'en') = 'en' AND religion LIKE 'Bah%' AND (
       author LIKE '%ll_h%' OR author LIKE '%Abdu%' OR author LIKE '%B_b%' OR file_path LIKE '%Compilation%'
       OR file_path LIKE '%Research Depar%' OR file_path LIKE '%Tablet Translations%' OR title LIKE '%Prayers%')`, [], 'pair:inherit-docs'))
    .filter((d) => !anchoredDocs.has(d.id));
  let pairs = 0, parasHit = 0, parasSeen = 0; const perDoc = [];
  const rows = [];
  for (const d of docs) {
    const P = await queryAll(`SELECT id, text FROM content WHERE doc_id = ? AND deleted_at IS NULL`, [d.id], 'pair:inherit-paras');
    let hit = 0, seen = 0;
    for (const p of P) {
      const S = shingles(p.text);
      if (S.size < 3) continue;
      seen++;
      const votes = new Map();
      for (const g of S) for (const id of idx.get(g) || []) votes.set(id, (votes.get(id) || 0) + 1);
      // Greedy cover, best first: the same English exists in several paired books (and their originals in several
      // volumes) — inheriting from every copy multiplied pairs ~9x. An anchored paragraph counts only if half of it
      // lies inside the target or it covers half of the target (the anchor stage's own membership rule).
      const cands = [...votes].filter(([, v]) => v >= 3).sort((a, b) => b[1] - a[1]).map(([id]) => id);
      const cov = new Set(); const covering = [];
      for (const id of cands) {
        const A = shingles(textOf.get(id)); let inT = 0; const add = [];
        for (const g of A) if (S.has(g)) { inT++; if (!cov.has(g)) add.push(g); }
        if (!(inT >= 0.5 * A.size || inT >= 0.5 * S.size) || add.length < 3) continue;
        covering.push(id); add.forEach((g) => cov.add(g));
        if (cov.size >= 0.95 * S.size) break;
      }
      const share = cov.size / S.size;
      if (!covering.length || share < 0.6) continue;
      hit++;
      const via = covering[0];
      const origs = new Map(); for (const id of covering) for (const [o, od] of origOf.get(id)) origs.set(o, od);
      for (const [o, od] of origs) rows.push({ trans: p.id, orig: o, transDoc: d.id, origDoc: od, score: Number(share.toFixed(3)), via });
    }
    parasHit += hit; parasSeen += seen;
    if (hit) perDoc.push([d.id, d.title, hit, seen]);
  }
  pairs = rows.length;
  console.log(`inherit: ${docs.length} candidate docs | ${perDoc.length} with matches | paragraphs ${parasHit}/${parasSeen} | pairs ${pairs}`);
  for (const [id, title, hit, seen] of perDoc.sort((a, b) => b[2] - a[2]).slice(0, 45)) console.log(`  doc ${id}: ${hit}/${seen} (${Math.round(100 * hit / seen)}%) ${String(title).slice(0, 60)}`);
  if (!dry) {
    // Replace, never delete (as the anchor stage): inherited pairs follow their anchors, so a re-anchored paragraph's
    // old inheritance is retired and this run's is upserted.
    await transaction([{ sql: `UPDATE content_alignment SET retired_at = unixepoch()
                                WHERE basis = 'inherit-english' AND retired_at IS NULL`, args: [] }], 'pair:inherit-retire');
    for (let i = 0; i < rows.length; i += 500) {
      await transaction(rows.slice(i, i + 500).map((r) => ({
        sql: `INSERT INTO content_alignment (trans_id, orig_id, trans_doc, orig_doc, basis, score, via_id, method)
              VALUES (?, ?, ?, ?, 'inherit-english', ?, ?, 'inherit-v3')
              ON CONFLICT (trans_id, orig_id) DO UPDATE SET basis = excluded.basis, score = excluded.score,
                via_id = excluded.via_id, method = excluded.method, retired_at = NULL`,
        args: [r.trans, r.orig, r.transDoc, r.origDoc, r.score, r.via] })), 'pair:inherit');
    }
    console.log(`written ${rows.length}`);
  }
}
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(0);

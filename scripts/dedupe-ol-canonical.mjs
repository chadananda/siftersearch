// OL-canonical dedupe: when a work exists in OceanLibrary (live, with content), it is the ONLY
// sanctioned copy in that language. Same-language EXACT-normalized-title matches from other sources
// are deactivated (duplicate_of → OL id + guarded soft-delete); folder-library files are physically
// moved to a library-duplicates/ sibling (outside the watched religion-roots) so the watcher can
// never resurrect them. Report-only by default; --apply executes.
//
// GUARDS (learned from the 2026-06 dedupe disaster + today's anchors):
//   - OL copy must be LIVE with content>0 (safeSoftDeleteDocs additionally refuses OL deletions)
//   - never deactivate a doc carrying enrichment (entity claims or HyPE) — flagged instead
//   - exact-title matches only; loose matches reported for human review
//   - OL-internal duplicates reported, never touched
// Run on tower-nas: node scripts/dedupe-ol-canonical.mjs [--apply]
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const APPLY = process.argv.includes('--apply');
const db = new Database('data/sifter.db', { readonly: true });
const { content } = await import('../api/lib/content.js');
const { query } = await import('../api/lib/db.js');
const { config } = await import('../api/lib/config.js');
const { execFileSync } = await import('node:child_process');

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['‘’`ʻ"“”_]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();

const docs = db.prepare(`SELECT id, title, language, COALESCE(source_site,'') ss,
    COALESCE(file_path,'') fp, paragraph_count pc
  FROM docs WHERE deleted_at IS NULL AND duplicate_of IS NULL`).all();
const ol = docs.filter((d) => d.ss === 'oceanlibrary.com' && d.pc > 0);
const others = new Map();
for (const d of docs) {
  if (d.ss === 'oceanlibrary.com') continue;
  const k = `${fold(d.title)}|${d.language}`;
  (others.get(k) || others.set(k, []).get(k)).push(d);
}

// Enrichment probe (the anchor guard — GPB/DB class docs must never be swept as dupes)
const enrich = db.prepare(`SELECT
  (SELECT COUNT(*) FROM entity_claims WHERE doc_id = ?) claims,
  (SELECT COUNT(*) FROM content WHERE doc_id = ? AND hyp_questions IS NOT NULL) hyped`);

// OL-internal duplicate report (same normalized title, multiple OL copies)
const olByKey = new Map();
for (const o of ol) { const k = `${fold(o.title)}|${o.language}`; (olByKey.get(k) || olByKey.set(k, []).get(k)).push(o); }
const olInternal = [...olByKey.values()].filter((v) => v.length > 1);

const toRemove = [];   // { dupe, olId, physical }
const flaggedEnriched = [];
for (const [k, copies] of olByKey) {
  const o = copies[0];   // canonical target: first OL copy (internal dupes flagged separately)
  for (const d of others.get(k) || []) {
    const e = enrich.get(d.id, d.id);
    if (e.claims > 0 || e.hyped > 10) { flaggedEnriched.push({ ...d, ol: o.id, ...e }); continue; }
    toRemove.push({ dupe: d, olId: o.id, physical: !d.ss && d.fp && !d.fp.includes('site2rag') });
  }
}

const physical = toRemove.filter((r) => r.physical);
console.log(`OL canonical works: ${ol.length} (${olInternal.length} OL-INTERNAL duplicate groups — flagged, untouched)`);
console.log(`exact-title duplicates to deactivate: ${toRemove.length} (${physical.length} folder files to move)`);
console.log(`EXCLUDED — carry enrichment (decide separately): ${flaggedEnriched.length}`);
for (const f of flaggedEnriched.slice(0, 15)) console.log(`  ! ${f.id} "${f.title}" [${f.ss || 'folder'}] claims=${f.claims} hyped=${f.hyped} → OL ${f.ol}`);
if (olInternal.length) {
  console.log('\nOL-INTERNAL duplicate groups (curation needed on the OL side):');
  for (const g of olInternal) console.log(`  = ${g.map((x) => `${x.id}(${x.pc}¶)`).join(' · ')} "${g[0].title}"`);
}

// Stragglers from a previously interrupted apply: duplicate_of already set but never soft-deleted.
const stragglers = db.prepare(`SELECT id FROM docs WHERE duplicate_of IS NOT NULL AND deleted_at IS NULL`).all();
if (stragglers.length) console.log(`stragglers (duplicate_of set, not yet deactivated): ${stragglers.length}`);

if (!APPLY) { console.log('\nDRY RUN — re-run with --apply to execute.'); process.exit(0); }

// ── APPLY ────────────────────────────────────────────────────────────────────
const libBase = config.library?.basePath;
const dupDir = libBase ? path.resolve(libBase, '..', 'library-duplicates') : null;
let moved = 0, moveFail = 0;
// DB file_path values drift against the disk (files renamed after ingest; Unicode variants), so
// fall back to a find by a distinctive basename fragment — move only on an UNAMBIGUOUS single hit.
const locate = (fp) => {
  const exact = path.resolve(libBase, fp);
  if (fs.existsSync(exact)) return exact;
  const base = path.basename(fp, '.md');
  const frag = base.split(/ - /).slice(-2, -1)[0] || base.slice(-40);   // distinctive middle segment
  try {
    const out = execFileSync('find', [libBase, '-name', `*${frag.replace(/[*?[\]]/g, '?')}*`, '-not', '-path', '*/-sites/*'],
      { encoding: 'utf8', timeout: 60000 }).trim().split('\n').filter(Boolean);
    return out.length === 1 ? out[0] : null;
  } catch { return null; }
};
for (const r of physical) {
  try {
    const src = locate(r.dupe.fp);
    if (!src) { console.log(`  move: NOT FOUND / ambiguous — ${r.dupe.id} ${r.dupe.fp.slice(0, 70)}`); moveFail++; continue; }
    const rel = path.relative(libBase, src);
    const dest = path.join(dupDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
    moved++;
  } catch (e) { console.error(`move failed ${r.dupe.id}: ${e.message}`); moveFail++; }
}
console.log(`\nmoved ${moved}/${physical.length} folder files → ${dupDir} (${moveFail} unresolved — listed above)`);

let deactivated = 0;
const work = [...toRemove.map((r) => ({ id: r.dupe.id, olId: r.olId })), ...stragglers.map((s) => ({ id: s.id, olId: null }))];
// The writer can be slow to ACK while chewing large content updates (a 2k¶ doc soft-delete) and
// concurrent Meili sweeps — ride through with retry+backoff instead of dying mid-run.
const retry = async (fn) => {
  for (let a = 0; ; a++) {
    try { return await fn(); }
    catch (e) {
      if (a >= 4) throw e;
      console.log(`  writer busy (${e.message}) — retrying in ${20 * (a + 1)}s`);
      await new Promise((r) => setTimeout(r, 20000 * (a + 1)));
    }
  }
};
for (let i = 0; i < work.length; i += 10) {
  const batch = work.slice(i, i + 10);
  for (const r of batch) if (r.olId) await retry(() => query('UPDATE docs SET duplicate_of = ? WHERE id = ?', [r.olId, r.id]));
  const res = await retry(() => content.safeSoftDeleteDocs(batch.map((r) => r.id), { reason: 'ol-canonical-dedupe', maxDelete: 10 }));
  deactivated += res.deleted;
  if (i % 200 === 0) console.log(`${deactivated}/${work.length}`);
}
console.log(`\nAPPLY DONE: deactivated ${deactivated} duplicates (duplicate_of → OL id), moved ${moved} files.`);
console.log('Meili removal follows automatically via the worker sync sweep (content rows marked deleted+dirty).');

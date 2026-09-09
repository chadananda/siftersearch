// entities/link — BIND extracted claims to entities. Sets entity_claims.entity_id (the subject) and
// entity_claims.target_entity_id (the object). This is the stage that makes the graph traversable.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────────────
// It did not, until 2026-09-09, and that cost more than any other gap in the pipeline.
//
// `claims.js` deliberately DEFERS identity: it writes entity_id and target_entity_id as null and leaves
// binding to a later pass that can weigh evidence. Correct design. But the later pass was never a module —
// it lived in scripts/entity-read/link-claims.mjs, and run-grounding invoked it by execSync:
//
//     if (want('link')) { execSync(`DOC=${docId} WRITE=1 ... node scripts/entity-read/link-claims.mjs`) }
//
// Every sibling stage did `const r = await rag.entities.project(...); emit('project', r)`. This one captured
// NOTHING: no result, no telemetry, no row stamp, no error detail. So when it ran for two books and stopped,
// nothing knew. Measured months later: 615,211 claims, 50% subject-bound, 9% TARGET-bound. Reverse queries
// ("who met the Báb?") were structurally impossible and no gate reported it.
//
// The lesson is general and worth keeping: A STAGE INVOKED BY SHELLING OUT IS A STAGE NOBODY CAN OBSERVE,
// and an unobservable stage stops working quietly. See backlog 0043.
//
// ── WHAT THIS MUST NOT DO ───────────────────────────────────────────────────────────────────────────────
// * NEVER bind on a global name match. A claim inherits an entity id only via a same-paragraph bound
//   mention, or (doc-scoped only) a name unambiguous within ONE book. Binding "Muhammad" globally would
//   attach thousands of claims to the Prophet.
// * NEVER match core ⊂ subject. Directional only: subject ⊂ core. Otherwise a short common core
//   ("muhammad", "ali") is swallowed by any compound name ("Mírzá Muḥammad-'Alí…") and mis-binds it.
// * NEVER invent a binding to raise a number. An unbound claim is evidence of a person the archive has not
//   catalogued — a finding, not noise.
//
// ── KNOWN LIMITATION, deliberately preserved ────────────────────────────────────────────────────────────
// A claim whose SUBJECT does not bind is skipped entirely, so its target is never attempted (`continue`
// below). Targets therefore cannot exceed subjects by construction — part of why the split is 50/9.
// Changing it would raise coverage but alters matching behaviour, so it is a separate measured change,
// not a silent tweak. See 0043.
//
// Deps: db (single-writer via query()). Pure logic otherwise — no model calls, no network.

import { queryAll, query } from '../../db.js';

/** Normalise a name for comparison: strip diacritics, quotes and punctuation, collapse space, lowercase. */
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();

/** Same-paragraph match: equal, or one contains the other and the shorter is long enough to be meaningful. */
const hit = (a, b) => a && b && (a === b || (a.length > 4 && b.includes(a)) || (b.length > 4 && a.includes(b)));

/** An entity's CORE name — canonical minus "(descriptor)" and ", descriptor". Without this, a relative's
 *  descriptor ("son of Bahá'u'lláh") makes the father's own name look ambiguous and blocks his claims. */
const coreOf = (s) => nrm(String(s || '').split('(')[0].split(',')[0]);

/**
 * Bind claims to entities for one document (or for the legacy seed batches when docId is omitted).
 *
 * @param {object}  opts
 * @param {number} [opts.docId]  scope to one document. STRONGLY preferred: enables the doc-unambiguous
 *                               fallback and the self-healing clear-then-recompute.
 * @param {boolean} [opts.write] actually write. Default false — this is a DRY RUN unless asked.
 * @returns {Promise<{claims,subjectBound,targetBound,viaFallback,updated,dry,docId,samples}>}
 *          Counts, always. The caller emits this as telemetry; returning void is what caused 0043.
 */
export async function link({ docId = null, write = false, deps = {} } = {}) {
  const qa = deps.queryAll || queryAll;
  const q = deps.query || query;

  const mentions = await qa(
    docId ? `SELECT para_id, resolved_as, entity_id FROM entity_mentions_v2 WHERE entity_id IS NOT NULL AND doc_id=?`
          : `SELECT para_id, resolved_as, entity_id FROM entity_mentions_v2 WHERE entity_id IS NOT NULL`,
    docId ? [docId] : []);

  const byPara = new Map();
  for (const m of mentions) {
    if (!byPara.has(m.para_id)) byPara.set(m.para_id, []);
    byPara.get(m.para_id).push({ rn: nrm(m.resolved_as), eid: m.entity_id });
  }

  const claims = await qa(
    docId ? `SELECT id, para_id, semantic_key FROM entity_claims WHERE doc_id=?`
          : `SELECT id, para_id, semantic_key FROM entity_claims WHERE import_batch IN ('db-v2','gpb-v2')`,
    docId ? [docId] : []);

  // Doc-level UNAMBIGUOUS fallback (doc-scoped only). Within ONE book's disambiguation context, a name that
  // maps to exactly ONE bound entity is safe to bind; a name used by >1 entity in the doc is EXCLUDED.
  // Namesake-safe by construction: under-bind, never mis-bind.
  const docPairs = [];
  if (docId) {
    const ents = await qa(
      `SELECT DISTINCT g.id, g.canonical_name FROM graph_entities g
         JOIN entity_mentions_v2 m ON m.entity_id=g.id
        WHERE m.doc_id=? AND m.entity_id IS NOT NULL`, [docId]);
    for (const e of ents) { const rn = coreOf(e.canonical_name); if (rn) docPairs.push({ rn, eid: e.id }); }
  }
  const docHit = (subj, core) => subj === core || (subj.length > 4 && core.includes(subj));
  const docBind = (name) => {
    if (!docId || !name) return null;
    let found = null;
    for (const p of docPairs) {
      if (docHit(name, p.rn)) { if (found !== null && found !== p.eid) return null; found = p.eid; }
    }
    return found;
  };

  // Doc-scoped write is AUTHORITATIVE and self-healing: clear this doc's prior binds, then recompute — so a
  // re-run after a matcher fix removes stale mis-binds. The loop only sets, never clears, so without this a
  // bad bind would survive every future run.
  if (docId && write) {
    await q(`UPDATE entity_claims SET entity_id=NULL, target_entity_id=NULL WHERE doc_id=?`, [docId]);
  }

  let subjectBound = 0, targetBound = 0, updated = 0, viaFallback = 0;
  const samples = [];
  for (const c of claims) {
    const parts = String(c.semantic_key || '').split('|');
    const subject = parts[0] || '', object = parts[2] || '';
    const ms = byPara.get(c.para_id) || [];

    let sEid = (ms.find((m) => hit(subject, m.rn)) || {}).eid ?? null;           // pass 1: precise same-para
    let oEid = object ? ((ms.find((m) => hit(object, m.rn)) || {}).eid ?? null) : null;
    let fellBack = false;
    if (sEid == null) { const g = docBind(subject); if (g != null) { sEid = g; fellBack = true; } }  // pass 2
    if (oEid == null && object) { const g = docBind(object); if (g != null) oEid = g; }

    if (sEid == null) continue;   // subject unresolved → keep prior value. See KNOWN LIMITATION above.
    subjectBound++;
    if (oEid != null) targetBound++;
    if (fellBack) { viaFallback++; if (samples.length < 12) samples.push(`${subject} → #${sEid}`); }
    if (write) await q(`UPDATE entity_claims SET entity_id=?, target_entity_id=? WHERE id=?`, [sEid, oEid, c.id]);
    updated++;
  }

  return { docId, dry: !write, claims: claims.length, subjectBound, targetBound, viaFallback, updated, samples };
}

/**
 * Sibling convention entry point — every entities/*.js exports `run(ctx, docId, opts)` and the
 * rag facade calls it that way. Kept as a thin adapter so `link()` stays independently testable.
 *
 * NOTE ON DEFAULTS: the pipeline WRITES. A stage that dry-ran by default would silently do nothing
 * in production, which is exactly the class of failure this module was created to end — so `write`
 * defaults to true here, and to false in the standalone `link()` used by the CLI and by tests.
 */
export async function run(ctx, docId, opts = {}) {
  return link({ docId, write: opts.write !== false, deps: opts.deps || {} });
}

export default { link, run };

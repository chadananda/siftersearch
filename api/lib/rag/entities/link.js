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
// security-audit-ignore: dangerous-pattern — prose, not code: this quotes the execSync call this file REPLACED
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

/** An entity's CORE name — canonical minus "(descriptor)" and ", descriptor". Without this, a relative's
 *  descriptor ("son of Bahá'u'lláh") makes the father's own name look ambiguous and blocks his claims. */
const coreOf = (s) => nrm(String(s || '').split('(')[0].split(',')[0]);

/** Whole-word form: punctuation/hyphens → spaces, leading article dropped. */
const wordsOf = (s) => nrm(s).replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(the|a) /, '');

/**
 * Does a claim's subject/object NAME refer to this mention? Only as the SAME name (the core, or a parenthetical
 * alternate name — "(the Báb)"), or a SHORTER FORM of the core: its leading words ("Mullá Ḥusayn" for
 * "Mullá Ḥusayn-i-Bushrú'í" — names shorten by dropping the nisba).
 *
 * This replaced a two-way raw-substring test that the 2026-09-26 audit caught mis-binding ~700+ typed targets:
 * "Shíráz" ⊂ "Mírzáy-i-Shírází" (a place bound to a man), "mother of the Báb" ⊃ "the Báb" (a relative bound to
 * her son), "the Báb" ⊂ "Mullá Ḥusayn (the Báb's first disciple)" (a name found inside another's descriptor),
 * "Mecca" ⊂ "the Sharíf of Mecca". Under-bind, never mis-bind.
 */
export function namesMention(name, resolvedAs) {
  const n = wordsOf(name);
  if (!n) return false;
  const core = wordsOf(coreOf(resolvedAs));
  const alternates = [...String(resolvedAs || '').matchAll(/\(([^)]*)\)/g)].map((m) => wordsOf(m[1]));
  if (n === core || alternates.includes(n)) return true;
  return n.length > 4 && `${core} `.startsWith(`${n} `);
}

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
export async function link({ docId = null, write = false, diff = false, deps = {} } = {}) {
  const qa = deps.queryAll || queryAll;
  const q = deps.query || query;

  const mentions = await qa(
    docId ? `SELECT para_id, resolved_as, entity_id FROM entity_mentions_v2 WHERE entity_id IS NOT NULL AND doc_id=?`
          : `SELECT para_id, resolved_as, entity_id FROM entity_mentions_v2 WHERE entity_id IS NOT NULL`,
    docId ? [docId] : []);

  const byPara = new Map();
  for (const m of mentions) {
    if (!byPara.has(m.para_id)) byPara.set(m.para_id, []);
    byPara.get(m.para_id).push({ ra: m.resolved_as, eid: m.entity_id });
  }

  const claims = await qa(
    docId ? `SELECT id, para_id, semantic_key, entity_id, target_entity_id, relation, statement FROM entity_claims WHERE doc_id=?`
          : `SELECT id, para_id, semantic_key, entity_id, target_entity_id, relation, statement FROM entity_claims WHERE import_batch IN ('db-v2','gpb-v2')`,
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
    for (const e of ents) if (e.canonical_name) docPairs.push({ ra: e.canonical_name, eid: e.id });
  }
  const docBind = (name) => {
    if (!docId || !name) return null;
    let found = null;
    for (const p of docPairs) {
      if (namesMention(name, p.ra)) { if (found !== null && found !== p.eid) return null; found = p.eid; }
    }
    return found;
  };

  // Doc-scoped write is AUTHORITATIVE and self-healing: every claim of the doc is recomputed and any row whose
  // binding differs is rewritten — including to NULL — so a re-run after a matcher fix removes stale mis-binds.
  // Only CHANGED rows are written (it used to clear the whole doc and rewrite every row: same end state, a
  // window of blank binds, and ~100× the writes).
  let subjectBound = 0, targetBound = 0, updated = 0, viaFallback = 0;
  const samples = [];
  const changes = [];
  for (const c of claims) {
    const parts = String(c.semantic_key || '').split('|');
    const subject = parts[0] || '', object = parts[2] || '';
    const ms = byPara.get(c.para_id) || [];

    // pass 1: same-paragraph mention. More than one DIFFERENT entity answering to the name → ambiguous → unbound.
    const sameParaBind = (name) => {
      const ids = [...new Set(ms.filter((m) => namesMention(name, m.ra)).map((m) => m.eid))];
      return ids.length === 1 ? ids[0] : null;
    };
    let sEid = sameParaBind(subject);
    let oEid = object ? sameParaBind(object) : null;
    let fellBack = false;
    if (sEid == null) { const g = docBind(subject); if (g != null) { sEid = g; fellBack = true; } }  // pass 2
    if (oEid == null && object) { const g = docBind(object); if (g != null) oEid = g; }

    // Subject unresolved → the claim is unbound (target too). See KNOWN LIMITATION above. Outside doc scope the
    // prior value is kept, as before (the legacy batch mode never cleared).
    if (sEid == null) { if (!docId) continue; oEid = null; }
    else {
      subjectBound++;
      if (oEid != null) targetBound++;
      if (fellBack) { viaFallback++; if (samples.length < 12) samples.push(`${subject} → #${sEid}`); }
    }
    const oldS = c.entity_id ?? null, oldT = c.target_entity_id ?? null;
    if (oldS === sEid && oldT === oEid) continue;
    if (diff) changes.push({ id: c.id, relation: c.relation, statement: c.statement, oldS, oldT, newS: sEid, newT: oEid });
    if (write) await q(`UPDATE entity_claims SET entity_id=?, target_entity_id=? WHERE id=?`, [sEid, oEid, c.id]);
    updated++;
  }

  return { docId, dry: !write, claims: claims.length, subjectBound, targetBound, viaFallback, updated, samples, ...(diff ? { changes } : {}) };
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

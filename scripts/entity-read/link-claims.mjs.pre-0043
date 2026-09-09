// Link claims → entities (deterministic, no AI). A v2 claim's subject/object (from the disambiguation note) matches
// a bound mention in the SAME paragraph (also from the note) → the claim inherits that mention's entity_id /
// target_entity_id. Reversible: UPDATE entity_claims SET entity_id=NULL,target_entity_id=NULL WHERE import_batch LIKE '%-v2'.
//   DRY:   node scripts/entity-read/link-claims.mjs               (default: gpb-v2/db-v2 batches)
//   DOC-SCOPED (wave-1): DOC=426 node scripts/entity-read/link-claims.mjs   (scopes to one doc's claims)
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 [DOC=426] node scripts/entity-read/link-claims.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const DOC = process.env.DOC ? Number(process.env.DOC) : null;   // wave-1: scope to one book; else legacy seed batches
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const hit = (a, b) => a && b && (a === b || (a.length > 4 && b.includes(a)) || (b.length > 4 && a.includes(b)));

// Bound mentions carry the EVIDENCE-based entity_id; a claim inherits it only via a same-paragraph name match
// (never a literal global bind). Claims with no bound-mention match keep their prior value.
const mentions = await queryAll(
  DOC ? `SELECT para_id, resolved_as, entity_id FROM entity_mentions_v2 WHERE entity_id IS NOT NULL AND doc_id=?`
      : `SELECT para_id, resolved_as, entity_id FROM entity_mentions_v2 WHERE entity_id IS NOT NULL`, DOC ? [DOC] : []);
const byPara = new Map();
for (const m of mentions) { if (!byPara.has(m.para_id)) byPara.set(m.para_id, []); byPara.get(m.para_id).push({ rn: nrm(m.resolved_as), eid: m.entity_id }); }

const claims = await queryAll(
  DOC ? `SELECT id, para_id, semantic_key FROM entity_claims WHERE doc_id=?`
      : `SELECT id, para_id, semantic_key FROM entity_claims WHERE import_batch IN ('db-v2','gpb-v2')`, DOC ? [DOC] : []);

// Doc-level UNAMBIGUOUS fallback (wave-1/DOC only): wave-1 notes carry ~9x fewer explicit "surface=handle"
// resolves than GPB, so most claim-paras have no bound mention → same-para binding under-covers. Within ONE
// book's disambiguation context a name that maps to exactly ONE bound entity is safe to bind globally; a name
// used by >1 entity in the doc is EXCLUDED (namesake-safe: under-bind, never mis-bind). Off for legacy batches.
// Key on each entity's CORE name (canonical minus "(descriptor)" / ", descriptor") — else a relative's descriptor
// ("son of Bahá'u'lláh") makes the father's name look ambiguous and blocks his (top) claims.
const coreOf = (s) => nrm(String(s || '').split('(')[0].split(',')[0]);
const docPairs = [];
if (DOC) {
  const ents = await queryAll(`SELECT DISTINCT g.id, g.canonical_name FROM graph_entities g JOIN entity_mentions_v2 m ON m.entity_id=g.id WHERE m.doc_id=? AND m.entity_id IS NOT NULL`, [DOC]);
  for (const e of ents) { const rn = coreOf(e.canonical_name); if (rn) docPairs.push({ rn, eid: e.id }); }
}
// Fallback match must be DIRECTIONAL: exact, or the claim subject is a substring of the fuller entity core
// name ("mulla husayn" ⊂ "mulla husayn-i-bushrui"). NEVER core⊂subject — else a short common core ("muhammad",
// "ali") is swallowed by any compound name ("Mírzá Muḥammad-‘Alí…") and mis-binds it to the Prophet/Imám.
const docHit = (subj, core) => subj === core || (subj.length > 4 && core.includes(subj));
const docBind = (name) => {                                 // eid iff name matches exactly ONE doc entity, else null
  if (!DOC || !name) return null;
  let found = null;
  for (const p of docPairs) { if (docHit(name, p.rn)) { if (found !== null && found !== p.eid) return null; found = p.eid; } }
  return found;
};

// Doc-scoped WRITE is authoritative + self-healing: clear this doc's prior binds first, then recompute — so a
// re-run after a matcher fix removes stale mis-binds instead of leaving them (loop only sets, never clears).
if (DOC && WRITE) await query(`UPDATE entity_claims SET entity_id=NULL, target_entity_id=NULL WHERE doc_id=?`, [DOC]);
let subj = 0, obj = 0, done = 0, fbk = 0; const samples = [];
for (const c of claims) {
  const parts = String(c.semantic_key || '').split('|');
  const subject = parts[0] || '', object = parts[2] || '';
  const ms = byPara.get(c.para_id) || [];
  let sEid = (ms.find((m) => hit(subject, m.rn)) || {}).eid ?? null;   // pass 1: precise same-para
  let oEid = object ? ((ms.find((m) => hit(object, m.rn)) || {}).eid ?? null) : null;
  let viaFallback = false;
  if (sEid == null) { const g = docBind(subject); if (g != null) { sEid = g; viaFallback = true; } }  // pass 2: doc-unambiguous
  if (oEid == null && object) { const g = docBind(object); if (g != null) oEid = g; }
  if (sEid == null) continue;                                          // still unresolved → keep prior
  subj++; if (oEid != null) obj++; if (viaFallback) { fbk++; if (samples.length < 12) samples.push(`${subject} → #${sEid}`); }
  if (WRITE) await query(`UPDATE entity_claims SET entity_id=?, target_entity_id=? WHERE id=?`, [sEid, oEid, c.id]);
  done++;
}
console.log(`${WRITE ? 'WROTE' : 'DRY'} — ${claims.length} claims: ${subj} subject-bound (${fbk} via doc-unambiguous fallback), ${obj} object-bound (${done} updated)`);
if (!WRITE && samples.length) console.log('  fallback samples: ' + samples.join(' ; '));
process.exit(0);

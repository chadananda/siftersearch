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
let subj = 0, obj = 0, done = 0;
for (const c of claims) {
  const parts = String(c.semantic_key || '').split('|');
  const subject = parts[0] || '', object = parts[2] || '';
  const ms = byPara.get(c.para_id) || [];
  const sm = ms.find((m) => hit(subject, m.rn));            // evidence-based subject mention in this para
  if (!sm) continue;                                        // no bound mention → keep prior (entity_id is NOT NULL)
  const om = object ? ms.find((m) => hit(object, m.rn)) : null;
  subj++; if (om) obj++;
  if (WRITE) await query(`UPDATE entity_claims SET entity_id=?, target_entity_id=? WHERE id=?`, [sm.eid, om?.eid || null, c.id]);
  done++;
}
console.log(`${WRITE ? 'WROTE' : 'DRY'} — ${claims.length} v2 claims: ${subj} re-bound to evidence-based subject entity, ${obj} object-bound (${done} updated)`);
process.exit(0);

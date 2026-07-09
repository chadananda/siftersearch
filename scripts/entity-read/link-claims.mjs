// Link claims → entities (deterministic, no AI). A v2 claim's subject/object (from the disambiguation note) matches
// a bound mention in the SAME paragraph (also from the note) → the claim inherits that mention's entity_id /
// target_entity_id. Reversible: UPDATE entity_claims SET entity_id=NULL,target_entity_id=NULL WHERE import_batch LIKE '%-v2'.
//   DRY:   node scripts/entity-read/link-claims.mjs
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 node scripts/entity-read/link-claims.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const hit = (a, b) => a && b && (a === b || (a.length > 4 && b.includes(a)) || (b.length > 4 && a.includes(b)));

// The v2 claims carry STALE literal entity_ids from the old extract-claims bind() (before it deferred). Clear them
// so we re-derive from the EVIDENCE-based mention entity_ids (set by reconcile), never the literal name-match.
if (WRITE && process.env.NULLFIRST === '1') { await query(`UPDATE entity_claims SET entity_id=NULL, target_entity_id=NULL WHERE import_batch IN ('db-v2','gpb-v2')`); console.error('cleared stale literal claim bindings (NULLFIRST)'); }

const mentions = await queryAll(`SELECT para_id, resolved_as, entity_id FROM entity_mentions_v2 WHERE entity_id IS NOT NULL`);
const byPara = new Map();
for (const m of mentions) { if (!byPara.has(m.para_id)) byPara.set(m.para_id, []); byPara.get(m.para_id).push({ rn: nrm(m.resolved_as), eid: m.entity_id }); }

const claims = await queryAll(`SELECT id, para_id, semantic_key FROM entity_claims WHERE import_batch IN ('db-v2','gpb-v2') AND entity_id IS NULL`);
let subj = 0, obj = 0, done = 0;
for (const c of claims) {
  const parts = String(c.semantic_key || '').split('|');
  const subject = parts[0] || '', object = parts[2] || '';
  const ms = byPara.get(c.para_id) || [];
  const sm = ms.find((m) => hit(subject, m.rn));
  const om = object ? ms.find((m) => hit(object, m.rn)) : null;
  if (sm || om) {
    if (sm) subj++; if (om) obj++;
    if (WRITE) await query(`UPDATE entity_claims SET entity_id=?, target_entity_id=? WHERE id=?`, [sm?.eid || null, om?.eid || null, c.id]);
    done++;
  }
}
console.log(`${WRITE ? 'WROTE' : 'DRY'} — ${claims.length} unbound v2 claims: ${subj} subject-bound, ${obj} object-bound (${done} updated)`);
process.exit(0);

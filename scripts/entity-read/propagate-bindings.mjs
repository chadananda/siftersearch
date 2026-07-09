// Propagate reconcile bindings to the remaining unbound mentions — deterministic, no AI. After reconcile+apply,
// singleton/variant mentions stay unbound (MINFREQ skip; descriptor variants like "…the amanuensis (not Azghandí)"
// vs "…the amanuensis" cluster separately). Match each unbound mention to a DECIDED cluster by its resolved_as with
// parentheticals stripped (meta-notes like "(not X)" / "(established in para_N)" don't change identity) and inherit
// that cluster's entity_id. Reversible: UPDATE entity_mentions_v2 SET entity_id=NULL WHERE resolution_basis='propagate'.
//   DRY: DOC=21308 node scripts/entity-read/propagate-bindings.mjs   ·   WRITE: SIFTER_WRITER_URL=… WRITE=1 DOC=… node …
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const DOC = process.env.DOC ? Number(process.env.DOC) : null;
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const key = (rs) => nrm(String(rs).replace(/\([^)]*\)/g, ''));   // identity key: drop parentheticals, keep the descriptor
const where = DOC ? 'AND doc_id=?' : ''; const args = DOC ? [DOC] : [];

const bound = await queryAll(`SELECT resolved_as, entity_id FROM entity_mentions_v2 WHERE entity_id IS NOT NULL ${where}`, args);
const map = new Map();                                            // identity key → {entity_id → count}
for (const b of bound) { const k = key(b.resolved_as); if (!k) continue; if (!map.has(k)) map.set(k, new Map()); const m = map.get(k); m.set(b.entity_id, (m.get(b.entity_id) || 0) + 1); }
const best = (k) => { const m = map.get(k); if (!m) return null; return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; };

const unbound = await queryAll(`SELECT id, resolved_as FROM entity_mentions_v2 WHERE entity_id IS NULL ${where}`, args);
let n = 0;
for (const u of unbound) { const eid = best(key(u.resolved_as)); if (!eid) continue; n++;
  if (WRITE) await query(`UPDATE entity_mentions_v2 SET entity_id=?, resolution_basis='propagate', resolution_conf=0.8 WHERE id=?`, [eid, u.id]); }
console.log(`${WRITE ? 'WROTE' : 'DRY'} — ${n}/${unbound.length} unbound mentions propagated to a decided cluster (${map.size} identity keys)`);
process.exit(0);

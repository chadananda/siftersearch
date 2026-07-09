// Populate the SOURCE-ANCHORED mention substrate (entity_mentions_v2) from the faithful disambiguation notes
// (content.context). Each note resolves «"surface" = Canonical» for the references in a paragraph; each becomes a
// mention with a STABLE anchor = sha1(doc|para|surface_norm|occurrence) — so a re-derivation with a better model
// yields the SAME anchor and every downstream decision (merge/split/verify) survives. Best-effort entity binding by
// exact canonical/alias match (name nominates); NULL entity_id = unbound (resolve/create later — evidence binds).
// Reversible: DELETE FROM entity_mentions_v2 WHERE method_version='deepseek-disambig-v1' AND doc_id=?.
//   DRY:   DOC=21308 node scripts/entity-read/build-mentions.mjs
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 DOC=21308 node scripts/entity-read/build-mentions.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { createHash } from 'crypto';
const { queryAll, query } = await import('../../api/lib/db.js');
const DOC = Number(process.env.DOC || 21308);
const WRITE = process.env.WRITE === '1';
const MV = process.env.MV || 'deepseek-disambig-v1';
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const anchorOf = (doc, para, sn, occ) => createHash('sha1').update(`${doc}|${para}|${sn}|${occ}`).digest('hex').slice(0, 16);

// canonical/alias → entity_id index for best-effort binding (person + place + work + group)
const ents = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.entity_type et, er.aliases
  FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type=ge.entity_type`);
const nameIx = new Map();
for (const e of ents) { const keys = [e.cn]; try { const a = JSON.parse(e.aliases || '[]'); if (Array.isArray(a)) keys.push(...a); } catch { /* */ }
  for (const k of keys) { const n = nrm(k); if (!n) continue; if (!nameIx.has(n)) nameIx.set(n, new Set()); nameIx.get(n).add(e.id); } }
const bind = (canon) => { const core = canon.replace(/\([^)]*\)/g, '').split(/[,;]/)[0]; const s = nameIx.get(nrm(core)); return s && s.size === 1 ? [...s][0] : null; };

const rows = await queryAll(`SELECT external_para_id pid, context FROM content WHERE doc_id=? AND deleted_at IS NULL AND context IS NOT NULL AND context_model=? ORDER BY paragraph_index`, [DOC, MV]);
const RES = /[""“”]([^""“”]{1,70})[""“”]\s*=\s*([^;]+?)(?=\s*;|\s*$)/g;   // "surface" = canonical (straight or curly quotes)
let n = 0, bound = 0, unbound = 0; const seen = new Set();
for (const r of rows) {
  const body = String(r.context).split('—').slice(1).join('—');        // drop the "@place, ~era" prefix
  let m;
  while ((m = RES.exec(body))) {
    const surface = m[1].trim(); const canon = m[2].trim();
    if (!surface || !canon || /^\?+$/.test(canon)) continue;            // skip abstentions
    const sn = nrm(surface); if (!sn) continue;
    const anchor = anchorOf(DOC, r.pid, sn, 0);
    if (seen.has(anchor)) continue; seen.add(anchor);
    const eid = bind(canon); if (eid) bound++; else unbound++; n++;
    if (WRITE) await query(`INSERT OR IGNORE INTO entity_mentions_v2
      (anchor,doc_id,para_id,occurrence,surface,surface_norm,entity_id,resolved_as,resolution_basis,resolution_conf,method_version,model)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [anchor, DOC, r.pid, 0, surface, sn, eid, canon.slice(0, 120), eid ? 'name-match' : 'unbound', eid ? 0.9 : 0.5, MV, MV]);
  }
}
console.log(`${WRITE ? 'WROTE' : 'DRY'} doc ${DOC}: ${n} mentions (${bound} name-bound, ${unbound} unbound) from ${rows.length} disambiguated paragraphs`);
process.exit(0);

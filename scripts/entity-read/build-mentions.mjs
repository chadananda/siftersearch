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

// NO literal name binding here. entity_id is a PROJECTION set by evidence-based reconcile (Pass 4), never by a
// romanization string-match — that fails on per-book transliteration (Ṣádiq/Sadeq), misspellings, and namesakes.
// This layer records the surface + the disambiguation's resolved_as descriptor; reconcile does fuzzy candidate-gen
// (consonantal-skeleton/phonetic recall) + evidence adjudication, then assigns entity_id.
const rows = await queryAll(`SELECT external_para_id pid, context FROM content WHERE doc_id=? AND deleted_at IS NULL AND context IS NOT NULL AND context_model=? ORDER BY paragraph_index`, [DOC, MV]);
const RES = /[""“”]([^""“”]{1,70})[""“”]\s*=\s*([^;]+?)(?=\s*;|\s*$)/g;   // "surface" = resolved_as (straight or curly quotes)
let n = 0; const seen = new Set();
for (const r of rows) {
  const body = String(r.context).split('—').slice(1).join('—');        // drop the "@place, ~era" prefix
  let m;
  while ((m = RES.exec(body))) {
    const surface = m[1].trim(); const canon = m[2].trim();
    if (!surface || !canon || /^\?+$/.test(canon)) continue;            // skip abstentions
    const sn = nrm(surface); if (!sn) continue;                          // nrm only to de-dup identical mentions in a para
    const anchor = anchorOf(DOC, r.pid, sn, 0);
    if (seen.has(anchor)) continue; seen.add(anchor); n++;
    if (WRITE) await query(`INSERT OR IGNORE INTO entity_mentions_v2
      (anchor,doc_id,para_id,occurrence,surface,surface_norm,entity_id,resolved_as,resolution_basis,resolution_conf,method_version,model)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [anchor, DOC, r.pid, 0, surface, sn, null, canon.slice(0, 120), 'note-deferred', null, MV, MV]);
  }
}
console.log(`${WRITE ? 'WROTE' : 'DRY'} doc ${DOC}: ${n} mentions (entity_id DEFERRED to evidence-based reconcile) from ${rows.length} disambiguated paragraphs`);
process.exit(0);

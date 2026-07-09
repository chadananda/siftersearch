// throwaway: is "Ḥájí Mírzá Siyyid ‘Alí martyred in Tabríz" a hallucination or a source typo? Show the claims + whether
// their proof-span is verbatim in the cited paragraph, and the actual paragraph text (Tabríz vs Ṭihrán).
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const c = await queryAll(`SELECT ec.id, ge.canonical_name cn, ec.relation, ec.proof_ok, ec.doc_id, ec.para_id, ec.statement, ec.proof_verbatim
  FROM entity_claims ec JOIN graph_entities ge ON ge.id=ec.entity_id
  WHERE ec.statement LIKE '%Tabr%' AND (ge.canonical_name LIKE '%Siyyid ‘Al%' OR ge.canonical_name LIKE '%Khál%' OR ec.statement LIKE '%Siyyid ‘Al%')`);
console.log(`claims mentioning Tabr* for Siyyid ‘Alí / Khál: ${c.length}`);
for (const r of c) {
  console.log(`\n[claim ${r.id}] entity="${r.cn}"  (${r.relation})  proof_ok=${r.proof_ok}  doc=${r.doc_id} ${r.para_id}`);
  console.log(`  statement: ${r.statement}`);
  console.log(`  proof    : ${r.proof_verbatim || '(none)'}`);
  const p = (await queryAll(`SELECT text FROM content WHERE doc_id=? AND external_para_id=? AND deleted_at IS NULL`, [r.doc_id, r.para_id]))[0];
  const t = p ? String(p.text).replace(/\s+/g, ' ') : '(paragraph not found)';
  const idx = t.search(/Tabr|Ṭihr|Tihr/); console.log(`  SOURCE ¶: …${t.slice(Math.max(0, idx - 90), idx + 90)}…`);
}
process.exit(0);

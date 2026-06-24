// Passage-grounded kinship verification helper. For significant persons (importance>=MIN, with gathered
// kinship), dump each figure's kinship_gathered next to the DB passages that actually mention a kin term, so
// the direction can be verified from the TEXT (DeepSeek inverts parent/child). Read-only. Env: MIN, LIMIT, OFFSET.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308, MIN = +(process.env.MIN || 40), LIMIT = +(process.env.LIMIT || 30), OFFSET = +(process.env.OFFSET || 0);
const KIN = /\b(father|mother|son|daughter|brother|sister|uncle|aunt|cousin|wife|husband|nephew|niece|grandfather|grandson|grandmother|granddaughter|son-in-law|father-in-law|brother-in-law|widow|descendant|sibling)\b/i;
const rows = (await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.research_notes n FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person' AND ge.importance>=${MIN} ORDER BY ge.importance DESC`))
  .map(r => { let kn = []; let v = false; try { const o = JSON.parse(r.n || '{}'); kn = o.kinship_gathered || []; v = o.kinship_verified; } catch {} return { ...r, kn, v }; })
  .filter(r => r.kn.length && !r.v).slice(OFFSET, OFFSET + LIMIT);
console.error(`figures with UNVERIFIED gathered kinship (imp>=${MIN}): showing ${rows.length}`);
for (const r of rows) {
  const cs = (await graphQueryAll(`SELECT content_id FROM entity_mentions WHERE entity_id=${r.id} LIMIT 40`)).map(x => String(x.content_id));
  const passages = cs.length ? await queryAll(`SELECT paragraph_index pi, replace(text,char(10),' ') t FROM content WHERE id IN (${cs.join(',')}) AND doc_id=${DOC}`) : [];
  const kinPass = passages.filter(p => KIN.test(p.t)).slice(0, 4);
  console.log(`\n[${r.id}] ${r.cn} (imp ${r.imp})`);
  console.log(`  GATHERED: ${r.kn.map(k => k.relation + '=' + k.who).join(', ')}`);
  for (const p of kinPass) console.log(`  ¶${p.pi}: ${p.t.slice(0, 240)}`);
  if (!kinPass.length) console.log('  (no DB passage with a kin term — kinship is from cross-corpus/general knowledge; verify by knowledge)');
}
process.exit(0);

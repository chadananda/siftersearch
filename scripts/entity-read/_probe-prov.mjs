// throwaway: why is source-context empty? Check (1) do docs.source_url match fact-url bases, (2) do review entities
// carry facts with urls at all, (3) can we find a name in the main source docs by direct search.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();

const docs = await queryAll(`SELECT id, source_url u FROM docs WHERE source_url IS NOT NULL AND source_url<>'' LIMIT 8`);
console.log('sample docs.source_url:'); for (const d of docs) console.log('  ', d.id, JSON.stringify(d.u));

// pick 5 entities that have aliases + facts, show their fact urls + whether they resolve to a doc
const rows = await queryAll(`SELECT ge.id, ge.canonical_name cn, er.research_notes rn FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE er.aliases NOT IN ('','[]') AND er.research_notes LIKE '%paraId%' LIMIT 5`);
const docByUrl = new Map((await queryAll(`SELECT id, source_url u FROM docs WHERE source_url IS NOT NULL AND source_url<>''`)).map((d) => [d.u, d.id]));
console.log('\nsample entities + fact-url resolution:');
for (const r of rows) {
  let j = {}; try { j = JSON.parse(r.rn); } catch { /* */ }
  const facts = []; for (const k of ['facts2', 'episodes', 'characterizations', 'facts']) if (Array.isArray(j[k])) facts.push(...j[k]);
  const urls = facts.map((f) => f.url).filter(Boolean).slice(0, 3);
  const bases = [...new Set(urls.map((u) => String(u).split('?')[0]))];
  console.log(`  [${r.id}] ${r.cn}: facts=${facts.length}, urls=${facts.filter((f) => f.url).length}`);
  for (const b of bases) console.log(`     base ${JSON.stringify(b)} → doc ${docByUrl.get(b) || 'NOT FOUND'}`);
}

// direct: is "Kúchik" / "Jání" findable anywhere in the corpus content?
for (const term of ['úchik', 'Jání', 'Kúchik']) {
  const hit = await queryAll(`SELECT doc_id, external_para_id pid, substr(text,1,120) t FROM content WHERE text LIKE ? AND deleted_at IS NULL LIMIT 3`, [`%${term}%`]);
  console.log(`\nLIKE '%${term}%' → ${hit.length} hits`); for (const h of hit) console.log(`   doc ${h.doc_id} ${h.pid}: ${String(h.t).replace(/\s+/g, ' ')}`);
}
process.exit(0);

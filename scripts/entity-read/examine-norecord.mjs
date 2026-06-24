// Examine the DB-cast entities that have NO entity_research row (the "383"): by type, mention count, and —
// for persons — whether they share a name-core with an entity that DOES have a record (a possible late dup),
// so we know whether they need stub identity records or dedup first. Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const HON = /^(the |that |mulla |mirza |siyyid |haji |aqa |shaykh |karbila'i |mawlana |mir |akhund |ustad |hujjat )+/;
const core = s => { let n = norm(s).replace(/\s*\([^)]*\)\s*$/, '').replace(/,.*$/, ''); let p; do { p = n; n = n.replace(HON, ''); } while (n !== p); return n.replace(/-i-[a-z‘’'-]+$/, '').replace(/ of [a-z‘’'-]+$/, '').trim(); };

const cids = new Set((await queryAll(`SELECT id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => String(r.id)));
const dbCount = new Map();
for (const m of await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions')) if (cids.has(String(m.content_id))) dbCount.set(m.entity_id, (dbCount.get(m.entity_id) || 0) + 1);
const ids = [...dbCount.keys()];
const all = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.entity_type t, ge.description d, er.canonical_name has FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.id IN (${ids.join(',')})`);
const noRec = all.filter(r => !r.has);
const recCoresByType = {};
for (const r of all) if (r.has) { (recCoresByType[r.t] ||= new Map()).set(core(r.cn), r.cn); }

const byType = {}; const dupCand = [];
for (const r of noRec) {
  byType[r.t] = (byType[r.t] || 0) + 1;
  const twin = recCoresByType[r.t]?.get(core(r.cn));
  if (twin && r.t === 'person') dupCand.push({ id: r.id, cn: r.cn, db: dbCount.get(r.id), twin });
}
console.log(`no-record DB entities: ${noRec.length}`);
console.log('by type:', JSON.stringify(byType));
const mc = { '1': 0, '2-3': 0, '4+': 0 };
for (const r of noRec) { const c = dbCount.get(r.id); mc[c === 1 ? '1' : c <= 3 ? '2-3' : '4+']++; }
console.log('mention buckets:', JSON.stringify(mc));
console.log(`\nperson no-record sharing a core with a RECORDED person (possible late dups): ${dupCand.length}`);
for (const d of dupCand.slice(0, 25)) console.log(`  ${d.id} "${d.cn}" (${d.db}m)  ~ recorded "${d.twin}"`);
console.log('\n=== sample no-record persons WITHOUT a recorded twin (need stub identity) ===');
for (const r of noRec.filter(r => r.t === 'person' && !recCoresByType.person?.get(core(r.cn))).slice(0, 20)) console.log(`  ${r.id} "${r.cn}" (${dbCount.get(r.id)}m) :: ${(r.d || '').slice(0, 70)}`);
process.exit(0);

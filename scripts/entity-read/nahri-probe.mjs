// Proof-of-method for the pre-extraction "disambiguation prior": take the Nahrí brothers of Iṣfahán and
// show what the WIDER library (esp. Taherzadeh / Balyuzi / Momen) adds beyond The Dawn-Breakers — e.g. that
// they knew the Báb at Karbilá before His declaration (with Mullá Ṣádiq). Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const { getMeili, INDEXES } = await import('../../api/lib/search.js');
const meili = getMeili();
const DOC = 21308;
const docTitle = new Map((await queryAll('SELECT id, substr(title,1,34) t FROM docs')).map(r => [r.id, r.t]));

console.log('=== Nahrí PERSON entities in the cast ===');
const ents = await queryAll("SELECT ge.id, ge.canonical_name cn, er.summary s, er.aliases a FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person' AND (ge.canonical_name LIKE '%Nahr%' OR er.aliases LIKE '%Nahr%')");
for (const e of ents) console.log(`  [${e.id}] ${e.cn}\n     ${(e.s || '').slice(0, 160)}\n     aliases: ${(() => { try { return JSON.parse(e.a || '[]').join(' | '); } catch { return ''; } })()}`);

async function show(q, n = 6) {
  if (!meili) return;
  const res = await meili.index(INDEXES.PARAGRAPHS).search(q, { limit: n, attributesToRetrieve: ['id', 'doc_id'] });
  const ids = (res.hits || []).map(h => h.id);
  const rows = ids.length ? await queryAll(`SELECT id, doc_id, substr(replace(text,char(10),' '),1,260) t FROM content WHERE id IN (${ids.join(',')})`) : [];
  const byId = new Map(rows.map(r => [String(r.id), r]));
  console.log(`\n>>> "${q}"`);
  for (const h of (res.hits || [])) { const r = byId.get(String(h.id)); if (r && r.doc_id !== DOC) console.log(`   [${docTitle.get(r.doc_id) || r.doc_id}] ${r.t}`); }
}
await show('‘Alíy-i-Nahrí Iṣfahán Karbilá Báb', 8);
await show('Nahrí brothers knew the Báb Karbilá Mullá Ṣádiq', 8);
await show('Mírzá Hádíy-i-Nahrí daughter Munírih', 6);
process.exit(0);

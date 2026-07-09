// Research the Ḥájí Mullá Ismá‘íl tangle + ‘Abdu'l-Kháliq-i-Iṣfahání link, on user leads:
//  (a) one is a Seven-Martyrs-of-Ṭihrán figure; (b) another is an ENEMY in Nayríz; (c) one "Ismá‘íl" may be
//  a Badasht NAME for ‘Abdu'l-Kháliq-i-Iṣfahání. Pull each entity's full cross-corpus mentions (all books) +
//  Meili-discover the name across the library (Nayríz cluster, Seven Martyrs, Sirru'l-Vujúd, Badasht). Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const { getMeili, INDEXES } = await import('../../api/lib/search.js');
const meili = getMeili();
const ENT = [
  [1249796, 'Ḥájí Mullá Ismá‘íl'], [1250063, 'Ḥájí Mullá Ismá‘íl-i-Qumí'], [1249857, 'Ḥájí Mullá Ismá‘íl-i-Faráhání'],
  [1247603, '‘Abdu’l-Kháliq-i-Iṣfahání'], [1249249, 'Mullá ‘Abdu’l-Kháliq'],
];
const docTitle = new Map((await queryAll('SELECT id, substr(title,1,34) t FROM docs')).map(r => [r.id, r.t]));
for (const [id, nm] of ENT) {
  const er = (await queryAll(`SELECT er.summary s, er.aliases a, er.side FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.id=${id}`))[0];
  const ms = await graphQueryAll(`SELECT content_id FROM entity_mentions WHERE entity_id=${id}`);
  const cids = [...new Set(ms.map(m => String(m.content_id)))];
  const rows = cids.length ? await queryAll(`SELECT doc_id, paragraph_index pi, substr(replace(text,char(10),' '),1,170) t FROM content WHERE id IN (${cids.join(',')}) ORDER BY doc_id, paragraph_index`) : [];
  console.log(`\n===== ${id} "${nm}" [${er?.side || '?'}] =====`);
  console.log(`  summary: ${(er?.s || '(none)').slice(0, 200)}`);
  for (const r of rows) console.log(`  · [${docTitle.get(r.doc_id) || r.doc_id} ¶${r.pi}] ${r.t}`);
}
async function meiliShow(label, q, n = 8) {
  if (!meili) return;
  const res = await meili.index(INDEXES.PARAGRAPHS).search(q, { limit: n, attributesToRetrieve: ['id', 'doc_id'] });
  const ids = (res.hits || []).map(h => h.id);
  const rows = ids.length ? await queryAll(`SELECT id, doc_id, substr(replace(text,char(10),' '),1,160) t FROM content WHERE id IN (${ids.join(',')})`) : [];
  const byId = new Map(rows.map(r => [String(r.id), r]));
  console.log(`\n>>> Meili "${q}" (${label}):`);
  for (const h of (res.hits || [])) { const r = byId.get(String(h.id)); if (r) console.log(`    [${docTitle.get(r.doc_id) || r.doc_id} ¶?] ${r.t}`); }
}
await meiliShow('any Ismá‘íl across corpus', 'Ḥájí Mullá Ismá‘íl', 10);
await meiliShow('Seven Martyrs of Ṭihrán', 'Seven Martyrs Ṭihrán Ḥájí Mullá Ismá‘íl', 6);
await meiliShow('Nayríz enemy?', 'Mullá Ismá‘íl Nayríz mujtahid enemy', 6);
await meiliShow('Sirru’l-Vujúd / Badasht', 'Sirru’l-Vujúd Badasht ‘Abdu’l-Kháliq Iṣfahán', 8);
process.exit(0);

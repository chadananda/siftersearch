// Dump full cross-corpus dossiers (summary + every mention across all books with doc + ¶ + text) for the
// remaining open disambiguation pairs, so the identity can be settled from the library. Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const PAIRS = [
  ['Abu’l-Qásim mujtahid of Zanján (Siyyid vs Mírzá)', [1249213, 1249880]],
  ['Muḥammad-Mihdí (Safíhu’l-‘Ulamá vs son of Ḥájí Muḥammad-Ibráhím)', [1249360, 1249681]],
  ['‘Abdu’l-Kháliq-i-Iṣfahání vs Mullá ‘Abdu’l-Kháliq', [1247603, 1249249]],
  ['‘Abdu’l-Vahháb of Núr (two records)', [1249231, 1249895]],
  ['Mullá Zaynu’l-‘Ábidín of Yazd (two records)', [1249910, 1250011]],
  ['Ḏhu’l-Faqár Khán (Karávulí vs bare)', [1249766, 1249906]],
  ['Karbilá’í ‘Alí-i-Míyámay’í dup vs Mullá ‘Alí (keep distinct)', [1249517, 1249518, 1249503]],
];
const docTitle = new Map((await queryAll('SELECT id, substr(title,1,30) t FROM docs')).map(r => [r.id, r.t]));
for (const [label, ids] of PAIRS) {
  console.log(`\n##### ${label} #####`);
  for (const id of ids) {
    const er = (await queryAll(`SELECT er.summary s, er.side FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.id=${id}`))[0];
    const cn = (await queryAll(`SELECT canonical_name c FROM graph_entities WHERE id=${id}`))[0]?.c;
    const ms = await graphQueryAll(`SELECT content_id FROM entity_mentions WHERE entity_id=${id}`);
    const cids = [...new Set(ms.map(m => String(m.content_id)))];
    const rows = cids.length ? await queryAll(`SELECT doc_id, paragraph_index pi, substr(replace(text,char(10),' '),1,165) t FROM content WHERE id IN (${cids.join(',')}) ORDER BY doc_id, paragraph_index`) : [];
    console.log(`  --- ${id} "${cn}" [${er?.side || '?'}] :: ${(er?.s || '').slice(0, 150)}`);
    for (const r of rows) console.log(`      [${docTitle.get(r.doc_id) || r.doc_id} ¶${r.pi}] ${r.t}`);
  }
}
process.exit(0);

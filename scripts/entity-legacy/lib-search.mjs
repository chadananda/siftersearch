// Library-search resolver for ambiguous references: given name+place+period descriptors, query the WHOLE
// corpus (hybrid) to identify who an epithet/role-title refers to, using other books to corroborate.
// Usage: node lib-search.mjs   (queries hardcoded below; edit per investigation)
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const titles = new Map((await queryAll('SELECT id,title FROM docs')).map(d => [String(d.id), d.title]));
const QUERIES = [
  ['Ḥusayn Khán Ṣáḥib-Iḵhtíyár vs Ájúdán-Báshí', 'Ḥusayn Khán the Ṣáḥib-Iḵhtíyár, governor; and Ḥusayn Khán Ájúdán-Báshí Niẓámu’d-Dawlih governor of Fárs who persecuted the Báb in Shíráz'],
  ['Siyyid Ḥusayn-i-Yazdí amanuensis', 'Siyyid Ḥusayn-i-Yazdí the amanuensis of the Báb, slain in the Ṭihrán massacre by the adjutant-general'],
  ['Mullá Muḥammad son of Mullá Taqí', 'Mullá Muḥammad son of the slain Mullá Taqí of Qazvín who sought vengeance on the Bábís'],
  ['farrásh-báshí who held Quddús', 'the farrásh-báshí chief attendant who held Quddús at Bárfurúsh'],
  ['Siyyid Yaḥyá son of Nahrí', 'Siyyid Yaḥyá son of Mírzá Muḥammad-‘Alíy-i-Nahrí of Iṣfahán'],
  ['‘Alíy-i-Sardár', 'Mírzá ‘Alíy-i-Sardár'],
];
for (const [label, q] of QUERIES) {
  console.log(`\n=== ${label}\n    q: ${q}`);
  let hits = [];
  try {
    const res = await fetch('http://127.0.0.1:7839/api/search/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, limit: 5, mode: 'hybrid', filters: { religion: "Baha'i" } }) });
    const j = await res.json(); hits = j.hits || j.results || [];
  } catch (e) { console.log('  fetch-err', e.message); continue; }
  for (const h of hits) {
    const did = String(h.document_id ?? h.doc_id ?? '?');
    const t = (titles.get(did) || '?').slice(0, 38);
    console.log(`  [${did} ${t} p${h.paragraph_index}] ${(h.text || '').replace(/\s+/g, ' ').slice(0, 200)}`);
  }
}
process.exit(0);

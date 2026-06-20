// Library-search resolver for ambiguous references: given name+place+period descriptors, query the WHOLE
// corpus (hybrid) to identify who an epithet/role-title refers to, using other books to corroborate.
// Usage: node lib-search.mjs   (queries hardcoded below; edit per investigation)
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const titles = new Map((await queryAll('SELECT id,title FROM docs')).map(d => [String(d.id), d.title]));
const QUERIES = [
  // role-queue
  ['martyr@1947 — letter-from-prison', 'martyr who wrote a letter from prison to his brother Mullá ‘Abdu’lláh of Tabríz two days before his martyrdom'],
  ['martyr@1947 — youth with the Báb', 'the youth Anís Mírzá Muḥammad-‘Alíy-i-Zunúzí who begged to be martyred at the side of the Báb'],
  ['kad-khudá r4', 'the kadkhudá of Ṭihrán in whose house the companions of Ṭáhirih were imprisoned'],
  ['governor of Qazvín r3', 'the governor of Qazvín after the murder of Mullá Taqí'],
  // new-person queue — who are these?
  ['warden of Máh-Kú', '‘Alí Khán the warden of the castle of Máh-Kú who guarded the Báb'],
  ['Ṣáḥib-Iḵhtíyár', 'Ḥusayn Khán-i-Íravání the Ṣáḥib-Iḵhtíyár'],
  ['Indian dervish Qahru’lláh', 'the Indian dervish surnamed Qahru’lláh who followed the Báb'],
  ['messenger of Kand', 'the messenger sent from Ṭihrán to the village of Kand'],
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

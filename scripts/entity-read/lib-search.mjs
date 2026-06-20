// Library-search resolver for ambiguous references: given name+place+period descriptors, query the WHOLE
// corpus (hybrid) to identify who an epithet/role-title refers to, using other books to corroborate.
// Usage: node lib-search.mjs   (queries hardcoded below; edit per investigation)
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const titles = new Map((await queryAll('SELECT id,title FROM docs')).map(d => [String(d.id), d.title]));
const QUERIES = [
  ['martyr@1947 — identity', 'youth Mírzá Muḥammad-‘Alí Zunúzí Anís martyred with the Báb in Tabríz'],
  ['martyr@1947 — brother detail', 'letter written from prison to his brother Mullá ‘Abdu’lláh of Tabríz before his martyrdom'],
  ['kad-khudá r4 — Ṭihrán official', 'kadkhudá of Ṭihrán in whose house Ṭáhirih’s companions were imprisoned, Bahá’u’lláh intervened'],
  ['governor of Qazvín r3', 'governor of Qazvín at the time of the murder of Mullá Taqí, failed to release the prisoners'],
];
for (const [label, q] of QUERIES) {
  console.log(`\n=== ${label}\n    q: ${q}`);
  let hits = [];
  try {
    const res = await fetch('http://127.0.0.1:7839/api/search/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, limit: 6, mode: 'hybrid' }) });
    const j = await res.json(); hits = j.hits || j.results || [];
  } catch (e) { console.log('  fetch-err', e.message); continue; }
  for (const h of hits) {
    const did = String(h.document_id ?? h.doc_id ?? '?');
    const t = (titles.get(did) || '?').slice(0, 38);
    console.log(`  [${did} ${t} p${h.paragraph_index}] ${(h.text || '').replace(/\s+/g, ' ').slice(0, 200)}`);
  }
}
process.exit(0);

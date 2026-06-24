// Probe: for a sample of held-ambiguous references, search the Meili library (all books) for the surface
// name and show top excerpts — to confirm whether library evidence would disambiguate them. Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { getMeili, INDEXES } = await import('../../api/lib/search.js');
const meili = getMeili();
if (!meili) { console.log('Meili disabled'); process.exit(1); }
const probes = [
  { para: 906, name: 'Mírzá Mihdí', q: 'Mírzá Mihdí martyr' },
  { para: 906, name: 'Mírzá Mihdí', q: 'Mírzá Muḥammad-Riḍá Mullá Ḥaydar brothers martyrs' },   // p904/905 neighbors — find the section
];
for (const p of probes) {
  console.log(`\n===== p${p.para} "${p.name}"  query: "${p.q}" =====`);
  const res = await meili.index(INDEXES.PARAGRAPHS).search(p.q, { limit: 6, attributesToRetrieve: ['doc_id', 'doc_title', 'text'] });
  for (const h of (res.hits || [])) {
    console.log(`  [doc ${h.doc_id} ${String(h.doc_title || '').slice(0, 30)}] ${String(h.text || '').replace(/\s+/g, ' ').slice(0, 180)}`);
  }
}
process.exit(0);

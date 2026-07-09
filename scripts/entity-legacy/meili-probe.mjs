// Probe: for the SUBSTANTIVE held-ambiguous references (longest passages, real context), search the Meili
// library for the surface name and show top excerpts — to see whether library evidence disambiguates them.
// Also test resolving p906 by searching each candidate's full name. Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
const { getMeili, INDEXES } = await import('../../api/lib/search.js');
const meili = getMeili();
if (!meili) { console.log('Meili disabled'); process.exit(1); }
const dir = 'tmp/entity-research/seqread';
const work = JSON.parse(readFileSync(`${dir}/broad-worklist.json`, 'utf8'));
const dec = JSON.parse(readFileSync(`${dir}/broad-decisions.json`, 'utf8'));
const held = [];
for (let i = 0; i < work.length; i++) { const d = dec[i]; if (!d || d.error || !d.decisions) continue; if (d.decisions.some(x => x.refers === true)) continue; held.push({ para: work[i].para, surface: work[i].surface, text: work[i].text, cands: work[i].candidates.map(c => `${c.id}:${c.canon}`) }); }
held.sort((a, b) => b.text.length - a.text.length);
const search = async q => (await meili.index(INDEXES.PARAGRAPHS).search(q, { limit: 4, attributesToRetrieve: ['doc_id', 'doc_title', 'text'] })).hits || [];

console.log(`=== 5 most SUBSTANTIVE held references (where library should help) ===`);
for (const h of held.slice(0, 5)) {
  console.log(`\n----- p${h.para} "${h.surface}" -----\n  PASSAGE: ${h.text.replace(/\s+/g, ' ').slice(0, 200)}\n  candidates: ${h.cands.join(' | ')}`);
  for (const hit of await search(`${h.surface} ${h.text.replace(/\s+/g, ' ').slice(0, 80)}`)) console.log(`    > [${hit.doc_id} ${String(hit.doc_title || '').slice(0, 24)}] ${String(hit.text || '').replace(/\s+/g, ' ').slice(0, 150)}`);
}
console.log(`\n\n=== p906 candidates by full name (does the library distinguish them?) ===`);
for (const nm of ['Mírzá Mihdí Iṣfahán martyr', 'Mírzá Mihdí Qazvín martyr']) {
  console.log(`\n  query "${nm}":`);
  for (const hit of await search(nm)) console.log(`    > [${hit.doc_id} ${String(hit.doc_title || '').slice(0, 24)}] ${String(hit.text || '').replace(/\s+/g, ' ').slice(0, 150)}`);
}
process.exit(0);

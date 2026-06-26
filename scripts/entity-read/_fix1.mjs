import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryOne } = await import('../../api/lib/db.js');
// Mullá Aḥmad-i-Ibdál-i-Marághi'í (1249583): Letter of the Living, in Nabíl's Ṭabarsí martyr roster (DB ¶935 = para_1303)
const cn = 'Mullá Aḥmad-i-Ibdál-i-Marág̱hi’í';
const row = await queryOne('SELECT research_notes rn FROM entity_research WHERE canonical_name=?', [cn]);
let n = {}; try { n = JSON.parse(row?.rn || '{}'); } catch {}
const url = 'https://oceanlibrary.com/dawn-breakers_nabil?paraId=para_1303';
n.death = { cause: 'martyred at Fort Shaykh Ṭabarsí', place: 'Fort Shaykh Ṭabarsí', year: 1849, martyr: true, source: 'The Dawn-Breakers', url };
const f2 = Array.isArray(n.facts2) ? n.facts2 : [];
if (!f2.some((f) => /tabars/i.test((f.relation || '') + (f.statement || '')))) {
  f2.unshift({ statement: 'Mullá Aḥmad-i-Ibdál-i-Marághi’í, one of the Letters of the Living, was martyred at the fort of Shaykh Ṭabarsí.', quote: 'Mullá Aḥmad, a resident of Marág̱hih, one of the Letters of the Living, and a distinguished disciple of Siyyid Káẓim.', relation: 'martyred-at-tabarsi', when: '1849', source: 'The Dawn-Breakers', paraId: 'para_1303', url });
  n.facts2 = f2;
}
await query('UPDATE entity_research SET research_notes=?, updated_at=CURRENT_TIMESTAMP WHERE canonical_name=?', [JSON.stringify(n), cn]);
console.log('enriched', cn);
process.exit(0);

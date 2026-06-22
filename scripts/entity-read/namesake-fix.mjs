// Apply namesake disambiguation removals: delete entity_mentions where a paragraph was bound to the WRONG
// same-named twin (verified by reading). Reversible (backup taken). DRY=1 previews. Edit REMOVALS per batch.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll, graphQuery } = await import('../../api/lib/db.js');
const DOC = 21308;
const WRITE = process.env.WRITE === '1';
// {id, paras[]} — remove this entity's binding at these paragraphs (it's the wrong twin there)
const REMOVALS = [
  // batch 2
  { id: 1249590, who: 'Ḥájí ‘Abdu’l-Majíd (Shíráz, father of ‘Abdu’l-Vahháb)', paras: [614, 621, 625] },
  { id: 1249716, who: 'Mullá ‘Abdu’lláh (Mírzá Ṣáliḥ)', paras: [1947] },
  { id: 1249452, who: 'Siyyid Aḥmad-i-Sang-Sárí', paras: [920] },
  { id: 1249938, who: 'Siyyid Aḥmad-i-Yazdí', paras: [921] },
  { id: 1247624, who: 'Mírzá Aḥmad (Ṭihrán)', paras: [1140] },
  { id: 1247908, who: 'Mírzá Áqáy-i-Munír', paras: [1159] },
  { id: 1250115, who: 'Mullá Báqir (generic)', paras: [1130, 1131] },
  { id: 1250090, who: 'Ḥájí Siyyid Ismá‘íl', paras: [1022, 1023] },
  { id: 1249378, who: 'Ja‘far-Qulí Khán-i-Námdár', paras: [1319, 1321, 1325, 1326] },
  { id: 1249517, who: 'Karbilá’í ‘Alí-i-Míyámay’í', paras: [761, 825] },
  { id: 1249574, who: 'Mírzá Muḥammad-‘Alíy-i-Qazvíní', paras: [235] },
  { id: 1249585, who: 'Siyyid Muḥammad-Riḍá (other)', paras: [201] },
  { id: 1247625, who: 'Ḥájí Sulaymán Khán (1852 martyr)', paras: [456, 962, 1820, 1826, 1937] },
  { id: 1249479, who: 'Ḥasan (brother of Ḏhu’l-Faqár)', paras: [1055, 1068, 1069] },
  { id: 1249216, who: 'Siyyid Ḥasan-i-Yazdí', paras: [470] },
  { id: 1249504, who: 'Mullá Zaynu’l-‘Ábidín (martyr of Míyámay)', paras: [1745] },
  { id: 1250013, who: 'Mullá Fatḥu’lláh of Qum', paras: [1336] },
];
const cmap = new Map((await queryAll(`SELECT paragraph_index, id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [r.paragraph_index, String(r.id)]));
let removed = 0, missing = 0;
for (const r of REMOVALS) {
  for (const p of r.paras) {
    const cid = cmap.get(p); if (!cid) { console.log(`  no content ${p}`); continue; }
    const n = (await graphQueryAll('SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=? AND content_id=?', [r.id, cid]))[0].n;
    if (!n) { missing++; continue; }
    console.log(`  ${WRITE ? 'REMOVE' : 'would remove'} ${r.id} ${r.who} @ p${p} (${n} row)`);
    if (WRITE) await graphQuery('DELETE FROM entity_mentions WHERE entity_id=? AND content_id=?', [r.id, cid]);
    removed += n;
  }
}
console.log(`\n${WRITE ? 'removed' : '[DRY] would remove'} ${removed} bindings; ${missing} target paras had no such binding`);
process.exit(0);

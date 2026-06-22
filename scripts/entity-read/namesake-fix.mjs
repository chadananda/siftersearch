// Apply namesake disambiguation removals: delete entity_mentions where a paragraph was bound to the WRONG
// same-named twin (verified by reading). Reversible (backup taken). DRY=1 previews. Edit REMOVALS per batch.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll, graphQuery } = await import('../../api/lib/db.js');
const DOC = 21308;
const WRITE = process.env.WRITE === '1';
// {id, paras[]} — remove this entity's binding at these paragraphs (it's the wrong twin there)
const REMOVALS = [
  { id: 1247601, who: 'Siyyid Káẓim-i-Zanjání', paras: [338, 339, 340, 341, 342, 343, 362, 389] },
  { id: 1249734, who: 'Siyyid Káẓim (merchant of Zanján)', paras: [931, 935] },
  { id: 1247600, who: 'Siyyid Káẓim-i-Rashtí', paras: [938] },
  { id: 1247564, who: 'Mullá Ḥusayn (first disciple, d.1849)', paras: [1112, 1694, 2046] },
  { id: 1249188, who: 'Siyyid Ḥusayn (notable of Nayríz)', paras: [1134, 1135, 1136, 1142, 1145, 1147, 1151] },
  { id: 1247648, who: 'Imám Ḥusayn', paras: [540, 542, 720] },
  { id: 1249390, who: 'Mullá Muḥammad-i-Qazvíní', paras: [254, 255, 256, 261, 262, 263] },
  { id: 1247634, who: 'Mullá Muḥammad of Núr', paras: [508, 511] },
  { id: 1247801, who: 'Mullá Muḥammad-i-Furúghí', paras: [529] },
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

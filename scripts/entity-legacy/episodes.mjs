// For each test character: find the seed entity(ies), pull bound paragraphs from the entity index, group them
// into EPISODES (contiguous runs; gap > 12 paras starts a new episode) and print each with the opening
// sentence — so completeness is visually checkable. Pure read.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const cmap = new Map((await queryAll('SELECT id,paragraph_index FROM content WHERE doc_id=21308')).map(r => [String(r.id), r.paragraph_index]));
const textOf = new Map((await queryAll('SELECT paragraph_index,text FROM content WHERE doc_id=21308 AND deleted_at IS NULL')).map(r => [r.paragraph_index, r.text]));

const TARGETS = [
  ['Betrayer — Mutavallí / "the Siyyid-i-Qumí"', "er.canonical_name LIKE '%Mutavallí%' OR er.canonical_name LIKE '%Qumí%' OR er.aliases LIKE '%Mutavallí%' OR er.aliases LIKE '%Siyyid-i-Qumí%'"],
  ["Mullá Ḥusayn's nephew — Muḥammad-Báqir", "er.canonical_name LIKE '%Muḥammad-Báqir%' OR er.aliases LIKE '%nephew of Mullá Ḥusayn%'"],
  ['Shaykh Abú-Turáb', "er.canonical_name LIKE '%Abú-Turáb%' OR er.aliases LIKE '%Abú-Turáb%'"],
];
for (const [label, where] of TARGETS) {
  console.log(`\n========== ${label} ==========`);
  const ents = await queryAll(`SELECT ge.id, er.canonical_name, er.summary FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.religion='' WHERE er.entity_type='person' AND (${where})`);
  if (!ents.length) { console.log('  (no matching seed entity)'); continue; }
  for (const e of ents) {
    const paras = [...new Set((await graphQueryAll("SELECT content_id FROM entity_mentions WHERE entity_id=?", [e.id])).map(r => cmap.get(String(r.content_id))).filter(p => p != null))].sort((a, b) => a - b);
    console.log(`\n  • ${e.id}  ${e.canonical_name}  — ${paras.length} bound paras`);
    console.log(`    summary: ${(e.summary || '').slice(0, 140)}`);
    if (!paras.length) { console.log('    (no bound mentions)'); continue; }
    const eps = []; let cur = [paras[0]];
    for (let i = 1; i < paras.length; i++) { if (paras[i] - cur[cur.length - 1] > 12) { eps.push(cur); cur = []; } cur.push(paras[i]); }
    eps.push(cur);
    for (const ep of eps) {
      const t = (textOf.get(ep[0]) || '').replace(/\s+/g, ' ').slice(0, 130);
      console.log(`      — paras ${ep[0]}${ep.length > 1 ? '–' + ep[ep.length - 1] : ''} (${ep.length}): ${t}`);
    }
  }
}
process.exit(0);

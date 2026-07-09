// Clean up the three test-character tangles (evidence-based, reversible via backup). DRY=1 previews.
//  MERGES (fold M->K): betrayer dup 1249465->1249227; Abú-Turáb timid Shaykhí 1249627(Qazvín)->1249845
//   (Ishtihárdí) — same man: Ishtihárd is in Qazvín district; para 1478 "native of Ishtihárd, married the
//   sister of Mullá Ḥusayn, died in prison in Ṭihrán"; both Shaykhí disciples of Siyyid Káẓim.
//  REASSIGN: the timid-companion / Shaykhí passages (148-149,659-661,1041,1478) are bound to the *Imám-Jum‘ih
//   of Shíráz* (1247571) by mistake -> move to the timid Abú-Turáb (1249845). The Báb's-Shíráz scenes stay.
//  NEPHEW: para 778 ("the nephew of Mullá Ḥusayn") is double-bound to the Qá'iní (1249418) -> keep only on the
//   nephew (1250146). (1249418 = Mírzá Muḥammad-Báqir-i-Qá'iní "built the Bábíyyih", para 781 — a different man.)
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryOne, queryAll, graphQuery, graphQueryAll } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const cmap = new Map((await queryAll("SELECT paragraph_index, id FROM content WHERE doc_id=21308 AND deleted_at IS NULL")).map(r => [r.paragraph_index, String(r.id)]));
const nameOf = async id => (await queryOne("SELECT canonical_name FROM graph_entities WHERE id=?", [id]))?.canonical_name;

async function fold(K, M) {
  const kc = await nameOf(K), mc = await nameOf(M);
  if (!kc || !mc) { console.log(`  fold skip — missing (K=${K}:${kc} M=${M}:${mc})`); return; }
  const kER = await queryOne("SELECT description, aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [kc]);
  const mER = await queryOne("SELECT description, aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [mc]);
  const aliases = new Set([mc]); for (const r of [kER, mER]) { if (!r) continue; try { for (const a of JSON.parse(r.aliases || '[]')) aliases.add(a); } catch {} }
  let desc = (kER?.description || '').trim(); if (mER?.description?.trim() && !desc.includes(mER.description.trim())) desc = desc ? desc + ' … ' + mER.description.trim() : mER.description.trim();
  const mc_ = (await graphQueryAll("SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=?", [M]))[0]?.n || 0;
  console.log(`  FOLD ${M} "${mc}" -> ${K} "${kc}"  (${mc_} mentions, aliases->${aliases.size})`);
  if (DRY) return;
  await graphQuery("UPDATE OR IGNORE entity_mentions SET entity_id=? WHERE entity_id=?", [K, M]);
  await graphQuery("DELETE FROM entity_mentions WHERE entity_id=?", [M]);
  await graphQuery("UPDATE OR IGNORE entity_aliases SET entity_id=? WHERE entity_id=?", [K, M]);
  await graphQuery("DELETE FROM entity_aliases WHERE entity_id=?", [M]);
  await query("UPDATE OR IGNORE graph_relations SET source_entity_id=? WHERE source_entity_id=?", [K, M]);
  await query("UPDATE OR IGNORE graph_relations SET target_entity_id=? WHERE target_entity_id=?", [K, M]);
  await query("DELETE FROM graph_relations WHERE source_entity_id=? OR target_entity_id=?", [M, M]);
  await query("UPDATE entity_research SET description=?, aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [desc, JSON.stringify([...aliases]), kc]);
  await query("UPDATE graph_entities SET description=? WHERE id=?", [desc, K]);
  await query("DELETE FROM entity_research WHERE canonical_name=? AND entity_type='person'", [mc]);
  await query("DELETE FROM graph_entities WHERE id=?", [M]);
}
async function reassign(from, to, paras) {
  for (const p of paras) {
    const cid = cmap.get(p); if (!cid) continue;
    const had = (await graphQueryAll("SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=? AND content_id=?", [from, cid]))[0]?.n || 0;
    if (!had) { console.log(`  reassign p${p}: (not on ${from})`); continue; }
    console.log(`  REASSIGN p${p}: ${from} -> ${to}`);
    if (DRY) continue;
    await graphQuery("UPDATE OR IGNORE entity_mentions SET entity_id=? WHERE entity_id=? AND content_id=?", [to, from, cid]);
    await graphQuery("DELETE FROM entity_mentions WHERE entity_id=? AND content_id=?", [from, cid]);
  }
}
async function unbind(id, paras) {
  for (const p of paras) {
    const cid = cmap.get(p); if (!cid) continue;
    const n = (await graphQueryAll("SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=? AND content_id=?", [id, cid]))[0]?.n || 0;
    console.log(`  UNBIND p${p} from ${id}: ${n} row(s)`);
    if (!DRY && n) await graphQuery("DELETE FROM entity_mentions WHERE entity_id=? AND content_id=?", [id, cid]);
  }
}

console.log('== betrayer =='); await fold(1249227, 1249465);
console.log('== Abú-Turáb (Qazvín -> Ishtihárdí timid) =='); await fold(1249845, 1249627);
console.log('== reassign Imám-Jum‘ih(1247571) companion-scenes -> timid Abú-Turáb(1249845) ==');
await reassign(1247571, 1249845, [148, 149, 659, 660, 661, 1041, 1478]);
console.log('== nephew: drop the misbound "nephew" para from the Qá’iní (1249418) ==');
await unbind(1249418, [778]);

console.log('\n== verify ‘Abdu’l-Vahháb-i-Shírází cluster ==');
for (const id of [1249228, 1250012, 1249589]) console.log(`  ${id}: ${await nameOf(id) || '(gone)'}`);
console.log(DRY ? '\n[DRY] nothing written' : '\nDONE (reverse: restore from backup)');
process.exit(0);

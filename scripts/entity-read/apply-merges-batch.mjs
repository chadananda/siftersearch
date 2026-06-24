// Apply the cross-corpus-confirmed merges (Opus-manual + user-confirmed). Multi-absorb fold M*->K, same
// reversible logic as apply-cluster-merges.mjs. These are identity-confirmed SAME-PERSON merges (not bare
// roster dups), so multiple distinct paragraphs are expected and fine. DRY=1 previews. Writes via :7849.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryOne, graphQuery, graphQueryAll } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const MERGES = [
  { K: 1249201, Ms: [1249481], why: 'Mullá Iskandar = Iskandar-i-Zanjání (Ḥujjat’s deputy to the Báb)' },
  { K: 1249376, Ms: [1249863], why: 'Sálár = the Sálár (Ḥasan Khán, son of the Áṣifu’d-Dawlih)' },
  { K: 1247601, Ms: [1249734], why: 'Siyyid Káẓim-i-Zanjání = merchant of Zanján (accompanied the Báb Shíráz→Iṣfahán 1846)' },
  { K: 1247628, Ms: [1250013], why: 'Fatḥu’lláh-i-Qumí = Mullá Fatḥu’lláh of Qum (fired at the Sháh, 1852)' },
  { K: 1249935, Ms: [1249377], why: 'Áṣifu’d-Dawlih, governor of Khurásán = "the Áṣifu’d-Dawlih" (uncle of the Sháh, father of Sálár)' },
  { K: 1249526, Ms: [1249529], why: 'Mír Ibráhím of Sang-Sar = Karbilá’í Ibráhím-i-Sangsarí (user-confirmed)' },
  { K: 1250063, Ms: [1249796, 1249857], why: 'Ḥájí Mullá Ismá‘íl-i-Qumí (Faráhání) = bare Ṭihrán-martyr + Faráhání; one of the Seven Martyrs of Ṭihrán (user-confirmed)' },
];
const nameOf = async id => (await queryOne('SELECT canonical_name FROM graph_entities WHERE id=?', [id]))?.canonical_name;
for (const { K, Ms, why } of MERGES) {
  const kc = await nameOf(K); if (!kc) { console.log(`  skip (K ${K} missing) — ${why}`); continue; }
  const kER = await queryOne("SELECT description, aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [kc]);
  const aliases = new Set(); let desc = (kER?.description || '').trim();
  try { for (const a of JSON.parse(kER?.aliases || '[]')) aliases.add(a); } catch {}
  console.log(`  ${DRY ? 'would FOLD' : 'FOLD'} -> ${K} "${kc}"   [${why}]`);
  for (const M of Ms) {
    const mc = await nameOf(M); if (!mc) { console.log(`     (M ${M} missing)`); continue; }
    aliases.add(mc);
    const mER = await queryOne("SELECT description, aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [mc]);
    try { for (const a of JSON.parse(mER?.aliases || '[]')) aliases.add(a); } catch {}
    if (mER?.description?.trim() && !desc.includes(mER.description.trim())) desc = desc ? desc + ' … ' + mER.description.trim() : mER.description.trim();
    const n = (await graphQueryAll('SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=?', [M]))[0].n;
    console.log(`       <= ${M} "${mc}" (${n} mentions)`);
    if (DRY) continue;
    await graphQuery('UPDATE OR IGNORE entity_mentions SET entity_id=? WHERE entity_id=?', [K, M]);
    await graphQuery('DELETE FROM entity_mentions WHERE entity_id=?', [M]);
    await graphQuery('UPDATE OR IGNORE entity_aliases SET entity_id=? WHERE entity_id=?', [K, M]);
    await graphQuery('DELETE FROM entity_aliases WHERE entity_id=?', [M]);
    await query('UPDATE OR IGNORE graph_relations SET source_entity_id=? WHERE source_entity_id=?', [K, M]);
    await query('UPDATE OR IGNORE graph_relations SET target_entity_id=? WHERE target_entity_id=?', [K, M]);
    await query('DELETE FROM graph_relations WHERE source_entity_id=? OR target_entity_id=?', [M, M]);
    await query("DELETE FROM entity_research WHERE canonical_name=? AND entity_type='person'", [mc]);
    await query('DELETE FROM graph_entities WHERE id=?', [M]);
  }
  aliases.delete(kc);
  if (!DRY) {
    await query("UPDATE entity_research SET description=?, aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [desc, JSON.stringify([...aliases]), kc]);
    await query('UPDATE graph_entities SET description=? WHERE id=?', [desc, K]);
  }
}
console.log(DRY ? '\n[DRY] nothing written' : '\nDONE — reverse from backup if needed');
process.exit(0);

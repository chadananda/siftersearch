// Merge confirmed duplicate entity pairs surfaced by the namesake sweep (same person, two entities).
// Fold M->K: repoint entity_mentions/entity_aliases (graph.db) + graph_relations (sifter.db), union
// aliases/description, delete M. Reversible via backup. DRY=1 previews.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryOne, queryAll, graphQuery, graphQueryAll } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const MERGES = [
  { K: 1249124, M: 1249464, why: 'Imám Ḥasan (dup)' },
  { K: 1249383, M: 1249940, why: 'Shaykh Muḥammad-i-Shibl (dup)' },
  { K: 1249769, M: 1249654, why: 'Khalíl Khán of Savád-Kúh (dup)' },
  { K: 1250070, M: 1249735, why: 'Siyyid Murtaḍá-i-Zanjání, Seven Martyr (dup)' },
  { K: 1249372, M: 1250066, why: 'Ḥáfiẓ the poet (dup)' },
  { K: 1249836, M: 1249382, why: 'Shaykh Ṣáliḥ-i-Karímí (dup)' },
];
const nameOf = async id => (await queryOne('SELECT canonical_name FROM graph_entities WHERE id=?', [id]))?.canonical_name;
for (const { K, M, why } of MERGES) {
  const kc = await nameOf(K), mc = await nameOf(M);
  if (!kc || !mc) { console.log(`  skip ${why} — missing (K=${kc} M=${mc})`); continue; }
  const kER = await queryOne("SELECT description, aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [kc]);
  const mER = await queryOne("SELECT description, aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [mc]);
  const aliases = new Set([mc]); for (const r of [kER, mER]) { if (!r) continue; try { for (const a of JSON.parse(r.aliases || '[]')) aliases.add(a); } catch {} }
  let desc = (kER?.description || '').trim(); if (mER?.description?.trim() && !desc.includes(mER.description.trim())) desc = desc ? desc + ' … ' + mER.description.trim() : mER.description.trim();
  const mc_ = (await graphQueryAll('SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=?', [M]))[0].n;
  console.log(`  ${DRY ? 'would fold' : 'FOLD'} ${M} "${mc}" -> ${K} "${kc}"  (${mc_} mentions)`);
  if (DRY) continue;
  await graphQuery('UPDATE OR IGNORE entity_mentions SET entity_id=? WHERE entity_id=?', [K, M]);
  await graphQuery('DELETE FROM entity_mentions WHERE entity_id=?', [M]);
  await graphQuery('UPDATE OR IGNORE entity_aliases SET entity_id=? WHERE entity_id=?', [K, M]);
  await graphQuery('DELETE FROM entity_aliases WHERE entity_id=?', [M]);
  await query('UPDATE OR IGNORE graph_relations SET source_entity_id=? WHERE source_entity_id=?', [K, M]);
  await query('UPDATE OR IGNORE graph_relations SET target_entity_id=? WHERE target_entity_id=?', [K, M]);
  await query('DELETE FROM graph_relations WHERE source_entity_id=? OR target_entity_id=?', [M, M]);
  await query("UPDATE entity_research SET description=?, aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [desc, JSON.stringify([...aliases]), kc]);
  await query('UPDATE graph_entities SET description=? WHERE id=?', [desc, K]);
  await query("DELETE FROM entity_research WHERE canonical_name=? AND entity_type='person'", [mc]);
  await query('DELETE FROM graph_entities WHERE id=?', [M]);
}
console.log(DRY ? '\n[DRY] nothing written' : '\nDONE — reverse from backup');
process.exit(0);

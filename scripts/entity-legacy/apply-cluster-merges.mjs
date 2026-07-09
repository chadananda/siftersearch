// Apply the 7 verification-confident cluster merges (shared-paragraph dup-splits + explicit linking clauses).
// Fold M->K exactly as merge-dups.mjs: repoint entity_mentions/entity_aliases (graph.db) + graph_relations
// (sifter.db), union aliases/description, delete M. Reversible from the small-table backup. DRY=1 previews.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryOne, graphQuery, graphQueryAll } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const MERGES = [
  { K: 1247624, M: 1249576, why: 'Mírzá Aḥmad-i-Kátib = ‘Abdu’l-Karím-i-Qazvíní (better-known-as)' },
  { K: 1249499, M: 1249513, why: 'Muḥammad-Ḥusayn-i-Míyámay’í — same roster paragraph (fabricated-nisba dup)' },
  { K: 1249688, M: 1249710, why: 'Muḥammad-Ḥusayn, surnamed Dastmál-Girih-Zan (linking clause)' },
  { K: 1249149, M: 1249585, why: 'Siyyid Muḥammad-Riḍá, father of the Báb (bare folds in, shared para)' },
  { K: 1249155, M: 1249605, why: 'Ḥájí Siyyid Muḥammad-Báqir-i-Rashtí (bare folds into the mujtahid)' },
  { K: 1249797, M: 1249187, why: 'Ḥájí Shaykh ‘Abdu’l-‘Alí, divine of Nayríz (Ḥájí added only)' },
  { K: 1249902, M: 1250007, why: 'Siyyid Baṣír-i-Hindí (bare folds in, shared para)' },
];
const nameOf = async id => (await queryOne('SELECT canonical_name FROM graph_entities WHERE id=?', [id]))?.canonical_name;
for (const { K, M, why } of MERGES) {
  const kc = await nameOf(K), mc = await nameOf(M);
  if (!kc || !mc) { console.log(`  skip ${why} — missing (K=${kc} M=${mc})`); continue; }
  const kER = await queryOne("SELECT description, aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [kc]);
  const mER = await queryOne("SELECT description, aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [mc]);
  const aliases = new Set([mc]); for (const r of [kER, mER]) { if (!r) continue; try { for (const a of JSON.parse(r.aliases || '[]')) aliases.add(a); } catch {} }
  let desc = (kER?.description || '').trim(); if (mER?.description?.trim() && !desc.includes(mER.description.trim())) desc = desc ? desc + ' … ' + mER.description.trim() : mER.description.trim();
  const mCount = (await graphQueryAll('SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=?', [M]))[0].n;
  console.log(`  ${DRY ? 'would FOLD' : 'FOLD'} ${M} "${mc}" -> ${K} "${kc}"  (${mCount} mentions)  [${why}]`);
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
console.log(DRY ? '\n[DRY] nothing written' : '\nDONE — reverse from backup if needed');
process.exit(0);

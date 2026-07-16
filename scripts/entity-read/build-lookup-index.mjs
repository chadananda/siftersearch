// Build the fast AI-free entity LOOKUP index (entity_lookup_keys) from the projected entities (graph_entities +
// aliases). For each entity, index nameKeys(canonical) ∪ nameKeys(each alias) — transliteration skeletons ∪
// Arabic-script keys (ar:) — so entities with Perso-Arabic canonical names or aliases are reachable from both
// scripts. Rebuildable — it is a PROJECTION of the current entities; truncate + repopulate. RECALL/lookup only.
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 node scripts/entity-read/build-lookup-index.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../../api/lib/db.js');
const { nameKeys } = await import('../../api/lib/translit-key.js');
const WRITE = process.env.WRITE === '1';
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const esc = (s) => `'${String(s == null ? '' : s).replace(/'/g, "''")}'`;

const ents = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.entity_type et, ge.importance imp, er.aliases
  FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type=ge.entity_type`);
const rows = [];
for (const e of ents) {
  const surfaces = [[e.cn, 1]];
  try { const a = JSON.parse(e.aliases || '[]'); if (Array.isArray(a)) for (const x of a) if (x) surfaces.push([x, 0]); } catch { /* */ }
  const seen = new Set();
  for (const [surf, isCanon] of surfaces) {
    if (!surf) continue;
    for (const k of nameKeys(surf)) { const d = `${k}|${nrm(surf)}`; if (seen.has(d)) continue; seen.add(d);
      rows.push(`(${esc(k)},${e.id},${esc(surf)},${esc(nrm(surf))},${isCanon},${esc(e.et)},${e.imp == null ? 'NULL' : e.imp})`); }
  }
}
console.error(`built ${rows.length} lookup keys for ${ents.length} entities · WRITE=${WRITE}`);
if (WRITE) {
  await query('DELETE FROM entity_lookup_keys');
  for (let i = 0; i < rows.length; i += 500) {
    await query(`INSERT INTO entity_lookup_keys (skeleton_key,entity_id,surface,surface_norm,is_canonical,entity_type,importance) VALUES ${rows.slice(i, i + 500).join(',')}`);
    if (i % 5000 === 0) console.error(`  ${i}/${rows.length}`);
  }
  console.log(`WROTE ${rows.length} lookup keys`);
} else console.log(`DRY ${rows.length} lookup keys (sample: ${rows.slice(0, 2).join(' ')})`);
process.exit(0);

// Entity NAME reads for search (search-target.js, entity-api.js entityLookup): the transliteration-invariant lookup over
// entity_lookup_keys and the names/weight the texts give an entity (entity_mentions_v2 surfaces, recorded aliases, claims
// pointing at it). Called through the read pool (search/read-pool.js) so they never run on a serving thread — the surface
// count is a ~1 s statement for well-mentioned entities (idx_emv2_entity + a row fetch per mention). Deps: db.js, entity-live.
import { queryAll } from '../db.js';
import { LIVE_SQL } from '../entity-live.js';

/** Lookup candidates: entities with any of `keys` (skeleton keys), exact = surface_norm values that count as an exact match.
 *  → [{ id, name, type, importance, shared, canon, exact, surfaces (JSON array text) }] */
export async function entityLookupKeyRows({ exact = [], keys = [], type = null, limit = 20 } = {}) {
  if (!keys.length || !exact.length) return [];
  return queryAll(
    `SELECT lk.entity_id id, ge.canonical_name name, ge.entity_type type, ge.importance importance,
            COUNT(DISTINCT lk.skeleton_key) shared, MAX(lk.is_canonical) canon,
            MAX(lk.surface_norm IN (${exact.map(() => '?').join(',')})) exact, json_group_array(DISTINCT lk.surface) surfaces
       FROM entity_lookup_keys lk JOIN graph_entities ge ON ge.id=lk.entity_id
      WHERE lk.skeleton_key IN (${keys.map(() => '?').join(',')})${type ? ' AND ge.entity_type=?' : ''}
        AND ${LIVE_SQL('ge.')}
      GROUP BY lk.entity_id ORDER BY exact DESC, canon DESC, shared DESC, (ge.importance IS NULL), ge.importance DESC LIMIT ?`,
    [...exact, ...keys, ...(type ? [type] : []), Math.min(50, +limit || 20)], 'entity:lookup');
}

/** What the texts call entities `ids`, raw: mention surfaces with counts, recorded aliases, claims pointing at them.
 *  → { surfaces: [{ id, surface, n }], aliases: [{ id, aliases }], targets: [{ id, n }] } */
export async function entityNameRows(ids) {
  const want = [...new Set((ids || []).map(Number).filter(Number.isInteger))].slice(0, 100);
  if (!want.length) return { surfaces: [], aliases: [], targets: [] };
  const ph = want.map(() => '?').join(',');
  const surfaces = await queryAll(`SELECT entity_id id, surface, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id IN (${ph}) GROUP BY 1, 2 ORDER BY n DESC`,
    want, 'entity:surfaces');
  const aliases = await queryAll(`SELECT ge.id, er.aliases FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name AND er.entity_type = ge.entity_type WHERE ge.id IN (${ph})`,
    want, 'entity:aliases');
  // Places, works and events are rarely bound as mentions, so their weight in the texts also counts the claims pointing AT them
  const targets = await queryAll(`SELECT target_entity_id id, COUNT(*) n FROM entity_claims WHERE target_entity_id IN (${ph}) GROUP BY 1`,
    want, 'entity:claim-targets');
  return { surfaces, aliases, targets };
}

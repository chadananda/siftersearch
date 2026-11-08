// EXCLUDED POINTS PURGE (11-08, after doc-twins marks second copies). Docs search excludes (retired duplicates, metadata indexes,
// bahai-library tag pages) that still have points in a searched collection cost every search a must_not filter; the indexers
// never write them again (INDEXABLE_DOC_SQL), so delete those points once. Through qdrantRequest (the runtime write path, mirrored
// to the hot phrases copy). Dry by default. params { apply, chunk }
import { computeExclusion } from '../search/excluded-docs.js';
import { SEARCHED_COLLECTIONS, qdrantRequest } from '../search/qdrant-layers.js';

export async function excludedPointsPurgeJob({ apply = false, chunk = 200 } = {}, deps = {}) {
  const { exclusion = computeExclusion, request = qdrantRequest } = deps;
  const ex = await exclusion();
  if (!ex.with_points) throw new Error(`excluded-points-purge: point check ${ex.check}`);
  const ids = ex.with_points.ids, out = { apply, excluded: ex.excluded, with_points: { docs: ids.length, by_collection: ex.with_points.by_collection }, deleted_calls: 0 };
  if (!apply || !ids.length) return out;
  for (const coll of SEARCHED_COLLECTIONS) {
    for (let i = 0; i < ids.length; i += chunk) {
      await request(`/collections/${coll}/points/delete?wait=true`, { filter: { must: [{ key: 'doc_id', match: { any: ids.slice(i, i + chunk) } }] } }, 120000);
      out.deleted_calls++;
    }
  }
  return out;
}

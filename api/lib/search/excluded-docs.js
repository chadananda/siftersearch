// Documents that are NOT passages and never come back from passage search: doc_role 'metadata' — an index of metadata such
// as Phelps' Partial Inventory (Chad 2026-10-04: "one is an index of metadata, the other is a compilation"). They stay in
// the library and feed tablet metadata. Ids cached; refreshed in the background (never on the request path).
// Deps: docs-repo.js
let ids = [], at = 0, loading = null;

async function refresh() {
  const { listDocs } = await import('../docs-repo.js');
  const { docs } = await listDocs({ role: 'metadata', fields: ['id'], limit: 1000 });
  ids = docs.map((d) => Number(d.id));
}

/** Doc ids to exclude (empty until the first refresh lands; then refreshed every 10 min). */
export function excludedDocIds() {
  if (Date.now() - at > 600000 && !loading) { at = Date.now(); loading = refresh().catch(() => {}).finally(() => { loading = null; }); }
  return ids;
}

/** Meili filter clause, or null. */
export const meiliExclusion = () => { const x = excludedDocIds(); return x.length ? `doc_id NOT IN [${x.join(', ')}]` : null; };

/** For tests: set the list directly. */
export const _setExcluded = (list) => { ids = list.map(Number); at = Date.now(); };

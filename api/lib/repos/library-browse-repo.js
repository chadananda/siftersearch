// Library browsing — GET /api/library/documents with no search term — without a whole-table sort (10-23). The default
// order (collection authority, then collection, then title) was a docs ⋈ library_nodes ORDER BY over every live doc: a
// 5.6 s temp B-tree that froze siftersearch-api. Now it is WALKED: per-collection counts come from the reports snapshot
// (data/library-stats.json facets; author/year filters → one narrowed indexed count), collections are ordered in memory,
// and each collection's slice is an index range on idx_docs_live_coll_title. sort=year|author walks its own index.
// Preview paragraphs: the doc's first PREVIEW_SCAN rows by id (covering idx_content_doc_deleted), the 3 lowest shown.
// Deps: db (queryAll), library-stats (readLibraryStats).
import { queryAll } from '../db.js';
import { readLibraryStats } from '../library/library-stats.js';

/** The indexes this module's plans rely on (migration 176; tests EXPLAIN against the same SQL). */
export const BROWSE_INDEXES = Object.freeze({
  idx_docs_live_coll_title: 'CREATE INDEX IF NOT EXISTS idx_docs_live_coll_title ON docs(collection, title) WHERE deleted_at IS NULL',
  idx_docs_live_author_title: 'CREATE INDEX IF NOT EXISTS idx_docs_live_author_title ON docs(author, title) WHERE deleted_at IS NULL',
  idx_docs_live_year_title: 'CREATE INDEX IF NOT EXISTS idx_docs_live_year_title ON docs(year, title) WHERE deleted_at IS NULL',
});

const FIELDS = `d.id, d.title, d.author, d.religion, d.collection, d.language, d.year, d.description, d.paragraph_count,
  d.created_at, d.updated_at, d.cover_url, d.encumbered, d.filename, d.file_path, d.slug`;
export const PREVIEW_SCAN = 12;
// rowid order ≈ ingest order, so the opening paragraphs are among a doc's first rows; LIMIT keeps it O(1) per doc
// (ORDER BY paragraph_index over all of a doc's rows read every paragraph of a 10k-¶ book to show three).
export const PREVIEW_SQL = `(SELECT json_group_array(json_object('i', paragraph_index, 't', text)) FROM (
    SELECT paragraph_index, text FROM content WHERE id IN (
      SELECT id FROM content WHERE deleted_at IS NULL AND doc_id = d.id ORDER BY id LIMIT ${PREVIEW_SCAN})
    ORDER BY paragraph_index LIMIT 3)) AS preview_json`;

/** One collection's slice of the walk, in title order, straight off idx_docs_live_coll_title. */
export const collectionSliceSql = (where, titleDir = 'ASC') => `SELECT ${FIELDS}, ${PREVIEW_SQL}
  FROM docs d INDEXED BY idx_docs_live_coll_title
  WHERE d.collection IS ? AND ${where}
  ORDER BY d.title ${titleDir} LIMIT ? OFFSET ?`;

/** sort=year|author: the sort's own index, or the narrowing filter's index when one is given (a small sort). */
export const sortedSql = (where, index, col, dir) => `SELECT ${FIELDS}, ${PREVIEW_SQL}
  FROM docs d INDEXED BY ${index}
  WHERE ${where}
  ORDER BY ${col} ${dir}, d.title ${dir} LIMIT ? OFFSET ?`;

/** Per-collection counts for a filter the snapshot cannot answer (author / year): a range of the filter's own index
 *  (the planner otherwise walks idx_docs_collection end to end to skip the GROUP BY sort). */
export const narrowedCountsSql = (where, index) => `SELECT d.collection AS collection, COUNT(*) AS n
  FROM docs d INDEXED BY ${index} WHERE ${where} GROUP BY d.collection`;

/** filters → WHERE (always live docs). `collection` is left out when the caller pins it per slice. */
export function filterSql({ religion, collection, language, author, yearFrom, yearTo } = {}, { withCollection = true } = {}) {
  const c = ['d.deleted_at IS NULL'], p = [];
  if (religion) { c.push('d.religion = ?'); p.push(religion); }
  if (collection && withCollection) { c.push('d.collection = ?'); p.push(collection); }
  if (language) { c.push('d.language = ?'); p.push(language); }
  if (author) { c.push('d.author = ?'); p.push(author); }
  if (yearFrom) { c.push('d.year >= ?'); p.push(yearFrom); }
  if (yearTo) { c.push('d.year <= ?'); p.push(yearTo); }
  return { where: c.join(' AND '), params: p };
}

/** SQLite BINARY order (UTF-8 bytes), NULL first — how `ORDER BY d.collection` ranked collections. */
export function compareCollections(a, b) {
  if (a == null || b == null) return a == null ? (b == null ? 0 : -1) : 1;
  return Buffer.compare(Buffer.from(String(a)), Buffer.from(String(b)));
}

/** Map(collection → n) of live docs matching religion/collection/language, from the snapshot facets. null = no snapshot. */
export function countsFromFacets(snap, { religion, collection, language } = {}) {
  if (!snap || snap.missing || snap.fallback || !Array.isArray(snap.facets)) return null;
  const m = new Map();
  for (const f of snap.facets) {
    if (religion && f.religion !== religion) continue;
    if (collection && f.collection !== collection) continue;
    if (language && f.language !== language) continue;
    const k = f.collection ?? null;
    m.set(k, (m.get(k) || 0) + (Number(f.n) || 0));
  }
  return m;
}

/** Collections in browse order: authority (dir), then collection name; empty ones dropped. Pure. */
export function orderCollections(counts, authority, dir = 'desc') {
  const s = dir === 'asc' ? 1 : -1;
  return [...counts].filter(([, n]) => n > 0)
    .map(([collection, n]) => ({ collection, n, authority: authority.get(collection) ?? 5 }))
    .sort((a, b) => s * (a.authority - b.authority) || compareCollections(a.collection, b.collection));
}

/** Which slices of which collections make up [offset, offset+limit). Pure. */
export function planSlices(groups, offset, limit) {
  const out = [];
  let skip = Math.max(0, offset), need = limit;
  for (const g of groups) {
    if (need <= 0) break;
    if (skip >= g.n) { skip -= g.n; continue; }
    const take = Math.min(need, g.n - skip);
    out.push({ collection: g.collection, offset: skip, limit: take });
    need -= take; skip = 0;
  }
  return out;
}

// Collection name → authority (library_nodes is a few hundred rows; cached a minute). parentId = one religion's nodes.
const authCache = new Map();
async function collectionAuthority(parentId = null) {
  const hit = authCache.get(parentId);
  if (hit && Date.now() - hit.at < 60_000) return hit.map;
  const rows = parentId == null
    ? await queryAll(`SELECT name, MAX(COALESCE(authority_default, 5)) AS authority FROM library_nodes
        WHERE node_type = 'collection' GROUP BY name`, [], 'library:collection-authority')
    : await queryAll(`SELECT name, MAX(COALESCE(authority_default, 5)) AS authority FROM library_nodes
        WHERE node_type = 'collection' AND parent_id = ? GROUP BY name`, [parentId], 'library:collection-authority');
  const map = new Map(rows.map((r) => [r.name, Number(r.authority)]));
  authCache.set(parentId, { at: Date.now(), map });
  return map;
}

/** A hinted query that still answers (unhinted) before migration 176 has built the index. */
async function hinted(sql, params, name) {
  try { return await queryAll(sql, params, name); } catch (e) {
    if (!/no such index/i.test(e.message)) throw e;
    return queryAll(sql.replace(/INDEXED BY \w+/, ''), params, name);
  }
}

async function collectionCounts(filters) {
  if (filters.author || filters.yearFrom || filters.yearTo) {
    const { where, params } = filterSql(filters);
    const index = filters.author ? 'idx_docs_live_author_title' : 'idx_docs_live_year_title';
    const rows = await hinted(narrowedCountsSql(where, index), params, 'library:browse-counts');
    return new Map(rows.map((r) => [r.collection ?? null, Number(r.n)]));
  }
  return countsFromFacets(readLibraryStats(), filters);
}

/**
 * The browse listing. sort 'authority' | 'title' (the default authority walk) | 'year' | 'author'. authorityParent = rank
 * collections by that religion node's children (the religion page). → { docs: [row + preview_json], total }.
 * No path sorts the docs table: every page is index ranges.
 */
export async function browseDocuments(filters = {}, { sort = 'title', sortDir, limit = 50, offset = 0, authorityParent = null } = {}) {
  const counts = await collectionCounts(filters);
  const total = counts ? [...counts.values()].reduce((a, b) => a + b, 0) : null;

  if (sort === 'year' || sort === 'author') {
    const dir = (sortDir ?? 'asc') === 'desc' ? 'DESC' : 'ASC';
    const index = filters.author ? 'idx_docs_live_author_title' : filters.collection ? 'idx_docs_live_coll_title'
      : sort === 'year' ? 'idx_docs_live_year_title' : 'idx_docs_live_author_title';
    const { where, params } = filterSql(filters);
    const docs = await hinted(sortedSql(where, index, sort === 'year' ? 'd.year' : 'd.author', dir), [...params, limit, offset], 'library:browse-sorted');
    return { docs, total: total ?? offset + docs.length };
  }

  const authorityDir = sort === 'authority' ? (sortDir ?? 'desc') : 'desc';
  const titleDir = sort === 'authority' || (sortDir ?? 'asc') !== 'desc' ? 'ASC' : 'DESC';
  const { where, params } = filterSql(filters, { withCollection: false });
  if (!counts) {
    // no snapshot yet (fresh deploy): collection, title order straight off the index — never a sort
    const f = filterSql(filters);
    const docs = await hinted(sortedSql(f.where, 'idx_docs_live_coll_title', 'd.collection', 'ASC'), [...f.params, limit, offset], 'library:browse-nosnap');
    return { docs, total: offset + docs.length };
  }
  const docs = [];
  for (const s of planSlices(orderCollections(counts, await collectionAuthority(authorityParent), authorityDir), offset, limit)) {
    // counts are up to one snapshot (≤5 min) old: a slice may come back short — the page is then short, never wrong-ordered
    docs.push(...await hinted(collectionSliceSql(where, titleDir), [s.collection, ...params, s.limit, s.offset], 'library:browse-collection'));
  }
  return { docs, total };
}

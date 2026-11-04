// Documents that never come back from passage search: doc_role 'metadata' — an index of metadata such as Phelps' Partial
// Inventory (Chad 2026-10-04: "one is an index of metadata, the other is a compilation"), which stays in the library and
// feeds tablet metadata — RETIRED DUPLICATES (duplicate_of set; their files live in the library's _retired-duplicates/) — and
// bahai-library.com TAG INDEX pages ("Tag: Ahmad of Yazd", "All tags: …": lists of other documents' titles, never a source;
// 11-01 Anís cited them).
// Only the ids that still HAVE points in a searched Qdrant collection are sent (a must_not over thousands of ids cost
// ~10 ms per call, 11-03); no such id → no filter. Refreshed in the background every 10 min (never on the request path);
// if the point check fails, the whole list is sent (correct, only slower). Deps: docs-repo.js, qdrant-layers.js (facet).
// ONE process computes per 10 min, shared via data/run/excluded-docs.json under an O_EXCL lock: the facet over ~10k ids x
// 5 collections run by all six API processes at once after a deploy timed every search layer out (11-03 23:16).
import fs from 'fs';
import path from 'path';
const REFRESH_MS = 600000, PAGE = 1000, MAX_PAGES = 100, LOCK_STALE_MS = 300000;
let all = [], ids = [], status = null, at = 0, loading = null;
let SHARED = process.env.EXCLUDED_DOCS_CACHE || path.resolve(new URL('.', import.meta.url).pathname, '../../../data/run/excluded-docs.json');

export const isTagIndex = (d) => d?.source_site === 'bahai-library.com' && /^(tag: |all tags\b)/i.test(String(d.title || ''));

/** isTagIndex as SQL over `docs d` (same rule; NULL-safe). tests/api/excluded-docs.test.js holds the two to the same answers. */
export const TAG_INDEX_SQL = "(COALESCE(d.source_site, '') = 'bahai-library.com' AND (lower(COALESCE(d.title, '')) LIKE 'tag: %'"
  + " OR lower(COALESCE(d.title, '')) = 'all tags' OR (lower(COALESCE(d.title, '')) LIKE 'all tags%' AND substr(lower(d.title), 9, 1) NOT GLOB '[a-z0-9_]')))";

/** Docs an INDEXER may send to Qdrant (phrases · phrases_hot · paragraphs_kw · hype · concepts): not a retired duplicate, not
 *  a tag index page — what search excludes must not be (re)written, or its points come back after a purge (11-04: 9,701
 *  excluded docs still had points, ~460K, every search carried a ~9,700-id must_not). Metadata docs (8746) ARE indexed:
 *  search filters them on purpose. Deleted docs are left out by every indexer's own deleted_at test. */
export const INDEXABLE_DOC_SQL = `d.duplicate_of IS NULL AND NOT ${TAG_INDEX_SQL}`;

/** Every id listDocs gives for `opts`, paged by id (a single page was capped at 1000, which would cut the list silently). */
async function listAllIds(listDocs, opts, keep = () => true) {
  const out = [];
  let afterId;
  for (let p = 0; p < MAX_PAGES; p++) {
    const r = await listDocs({ fields: ['id'], ...opts, limit: PAGE, count: false, orderBy: 'id', ...(afterId != null ? { afterId } : {}) });
    out.push(...r.docs.filter(keep).map((d) => Number(d.id)));
    if (r.next_after_id == null) break;
    afterId = r.next_after_id;
  }
  return out;
}

/** The excluded docs and which of them still have points. deps (tests): { listDocs, docPointCounts }.
 *  → { refreshed_at, excluded: {metadata, duplicates, tag_index, total}, with_points: {docs, ids, by_collection} | null, sent: ids[], check, all: ids[] } */
export async function computeExclusion(deps = {}) {
  const listDocs = deps.listDocs || (await import('../docs-repo.js')).listDocs;
  const docPointCounts = deps.docPointCounts || (await import('./qdrant-layers.js')).docPointCounts;
  const tagPages = (title) => listAllIds(listDocs, { sourceSite: 'bahai-library.com', title, fields: ['id', 'title', 'source_site'] }, isTagIndex);
  const [meta, dups, tags, allTags] = await Promise.all([listAllIds(listDocs, { role: 'metadata' }), listAllIds(listDocs, { scope: 'duplicates' }),
    tagPages('Tag: '), tagPages('All tags')]);
  const every = [...new Set([...meta, ...dups, ...tags, ...allTags])];
  const s = { refreshed_at: new Date().toISOString(), excluded: { metadata: meta.length, duplicates: dups.length, tag_index: new Set([...tags, ...allTags]).size, total: every.length } };
  try {
    const byColl = every.length ? await docPointCounts(every) : {};   // { collection: Map(docId → points) }
    const live = new Set(), by_collection = {};
    for (const [coll, m] of Object.entries(byColl)) {
      let docs = 0, points = 0;
      for (const [id, n] of m) if (n > 0) { live.add(Number(id)); docs++; points += n; }
      by_collection[coll] = { docs, points };
    }
    const kept = every.filter((id) => live.has(id));
    return { ...s, with_points: { docs: kept.length, ids: kept, by_collection }, sent: kept, check: 'ok', all: every };
  } catch (err) {
    return { ...s, with_points: null, sent: every, check: `failed: ${err.message}`, all: every };
  }
}

const adopt = (r) => { all = r.all; ids = r.sent; status = { ...r, all: undefined, sent: r.sent.length }; };
const readShared = () => { try { return JSON.parse(fs.readFileSync(SHARED, 'utf8')); } catch { return null; } };
const fresh = (r) => r && Date.now() - Date.parse(r.refreshed_at) < REFRESH_MS;

/** Fresh shared result -> adopt it (no Qdrant work). Otherwise the lock holder computes and writes it; everyone else keeps
 *  what it has (or adopts a stale shared copy) and looks again in 30 s. deps (tests): computeExclusion's deps. */
export async function refresh(deps) {
  const shared = readShared();
  if (fresh(shared)) return adopt(shared);
  const lock = `${SHARED}.lock`;
  try { if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.rmSync(lock, { force: true }); } catch { /* no lock */ }
  let fd;
  try { fs.mkdirSync(path.dirname(SHARED), { recursive: true }); fd = fs.openSync(lock, 'wx'); } catch {
    if (shared && !all.length) adopt(shared);
    at = Date.now() - REFRESH_MS + 30000;
    return;
  }
  try {
    const r = await computeExclusion(deps);
    adopt(r);
    fs.writeFileSync(`${SHARED}.tmp`, JSON.stringify(r));
    fs.renameSync(`${SHARED}.tmp`, SHARED);
  } finally { fs.closeSync(fd); fs.rmSync(lock, { force: true }); }
}

/** Doc ids to exclude — only those that still have points (empty until the first refresh lands; then every 10 min). */
export function excludedDocIds() {
  if (Date.now() - at > REFRESH_MS && !loading) { at = Date.now(); loading = refresh().catch(() => {}).finally(() => { loading = null; }); }
  return ids;
}

/** The last refresh's numbers, or null before the first. */
export const exclusionStatus = () => status;

/** Meili filter clause, or null — the WHOLE list (Meili's indexes are not checked for points). */
export const meiliExclusion = () => { excludedDocIds(); return all.length ? `doc_id NOT IN [${all.join(', ')}]` : null; };

/** For tests: set the list directly. */
export const _setExcluded = (list) => { ids = list.map(Number); all = [...ids]; at = Date.now(); };
/** For tests: point the shared cache elsewhere and clear state. */
export const _resetShared = (file) => { SHARED = file; all = []; ids = []; status = null; at = 0; };

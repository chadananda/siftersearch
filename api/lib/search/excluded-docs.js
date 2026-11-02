// Documents that never come back from passage search: doc_role 'metadata' — an index of metadata such as Phelps' Partial
// Inventory (Chad 2026-10-04: "one is an index of metadata, the other is a compilation"), which stays in the library and
// feeds tablet metadata — RETIRED DUPLICATES (duplicate_of set; their files live in the library's _retired-duplicates/) — and
// bahai-library.com TAG INDEX pages ("Tag: Ahmad of Yazd", "All tags: …": lists of other documents' titles, never a source;
// 11-01 Anís cited them). Ids cached; refreshed in the background (never on the request path).
// Deps: docs-repo.js
let ids = [], at = 0, loading = null;

export const isTagIndex = (d) => d?.source_site === 'bahai-library.com' && /^(tag: |all tags\b)/i.test(String(d.title || ''));

async function refresh() {
  const { listDocs } = await import('../docs-repo.js');
  // every page of a title match (keyset), only the tag-index titles kept
  const tagPages = async (title) => {
    const out = [];
    for (let afterId = null, n = 0; n < 20; n++) {
      const r = await listDocs({ sourceSite: 'bahai-library.com', title, fields: ['id', 'title', 'source_site'], limit: 1000, afterId, count: false });
      out.push(...r.docs.filter(isTagIndex));
      if (r.next_after_id == null) break;
      afterId = r.next_after_id;
    }
    return out;
  };
  const [meta, dups, tags, allTags] = await Promise.all([listDocs({ role: 'metadata', fields: ['id'], limit: 1000, count: false }),
    listDocs({ scope: 'duplicates', fields: ['id'], limit: 1000, count: false }), tagPages('Tag: '), tagPages('All tags')]);
  ids = [...new Set([...meta.docs, ...dups.docs, ...tags, ...allTags].map((d) => Number(d.id)))];
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

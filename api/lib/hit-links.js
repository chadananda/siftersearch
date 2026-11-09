// Search hits → their citation links by the universal rule (Chad 10-12): the best publisher of the words — OceanLibrary
// (range) → Ocean of Lights (range) → Phelps → bahai-library → siftersearch. Shared by the search API and Anís's reading
// guide. Deps: source-links, docs-repo (link meta), citation-links (better copies).
export async function withLinks(hits = []) {
  if (!hits.length) return hits;
  const { linkFor } = await import('./source-links.js');
  const { getLinkMeta } = await import('./docs-repo.js');
  const meta = await getLinkMeta(hits.map((h) => h.doc_id ?? h.document_id)).catch(() => new Map());
  const own = hits.map((h) => { const m = meta.get(Number(h.doc_id ?? h.document_id)) || {};
    return linkFor({ ...m, ...h, document_id: h.doc_id ?? h.document_id, source_url: h.source_url || m.source_url || null, metadata: m.metadata }, h.paragraph_index); });
  // the best publisher of the same words (identical copy on OceanLibrary / Ocean of Lights), not just the copy found
  const better = await (await import('./citation-links.js')).betterCopyLinks(hits.map((h, i) => ({ id: h.id, title: h.title, text: h.text, link: own[i] }))).catch(() => new Map());
  return hits.map((h, i) => {
    const l = better.get(Number(h.id)) || own[i];
    return { ...h, ...(l.title ? { title: l.title } : {}), url: l.url, link: { site: l.site, tier: l.tier, paragraph_level: l.paragraph_level } };
  });
}

/** Works → their best link by the same policy as a passage (the online publisher beats our own page): a work row from listDocs lacks `metadata`, so the link would fall back to our reader. { id → url|null }. */
export async function workLinks(docs = [], { getLinkMeta = null } = {}) {
  const { workUrl } = await import('./source-links.js');
  getLinkMeta ??= (await import('./docs-repo.js')).getLinkMeta;
  const meta = await getLinkMeta(docs.map((d) => d.id)).catch(() => new Map());
  return new Map(docs.map((d) => { const m = meta.get(Number(d.id)) || {}; return [d.id, workUrl({ ...m, ...d, source_url: d.source_url || m.source_url || null, metadata: m.metadata })]; }));
}

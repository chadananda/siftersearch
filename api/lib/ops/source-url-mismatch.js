// source-url-mismatch report: live docs whose OceanLibrary source_url names ANOTHER book (slug shares no word with title + author).
// Same rule as the edge guard (card-text.js otherBook), so code and data agree. Read-only; fixes go through POST /ops/docs/:id/source-url.
// Deps: docs-repo (oceanLinkedDocs), card-text (otherBook).
import { otherBook } from '../assistant/widgets/card-text.js';

const slugOf = (url) => { try { return new URL(String(url)).pathname.split('/').filter(Boolean)[0] || ''; } catch { return ''; } };

/** Rows → the ones whose link is another book's: { id, title, author, source_url, slug }. Pure. */
export const mismatches = (rows) => (rows || []).filter((d) => d?.source_url && otherBook(d.source_url, d.title, d.author))
  .map((d) => ({ id: d.id, title: d.title, author: d.author, source_url: d.source_url, slug: slugOf(d.source_url) }));

/** params: { limit } — hits returned (all are counted). Pages through the docs by id, 2,000 at a time. */
export async function sourceUrlMismatchReport({ limit = 500 } = {}, { read } = {}) {
  const page = read || (await import('../docs-repo.js')).oceanLinkedDocs;
  const hits = []; let checked = 0, afterId = 0;
  for (;;) {
    const rows = await page({ afterId, limit: 2000 });
    if (!rows?.length) break;
    checked += rows.length; afterId = rows[rows.length - 1].id;
    hits.push(...mismatches(rows));
    if (rows.length < 2000) break;
  }
  const cap = Math.min(Math.max(Number(limit) || 500, 1), 5000);
  return { checked, total: hits.length, hits: hits.slice(0, cap), by_slug: Object.entries(hits.reduce((m, h) => ((m[h.slug] = (m[h.slug] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(([slug, n]) => ({ slug, n })) };
}

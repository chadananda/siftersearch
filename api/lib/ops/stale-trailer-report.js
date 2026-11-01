// STALE TRAILER AUTHORS (read-only, 11-01): paragraphs whose author came from an attribution trailer ("(From The Gleanings, p. 136.)")
// that today's bounded trailer rule no longer gives — an earlier unbounded run credited every paragraph since the last heading
// (Bahá'í World VIII 967543: 6,567). One book at a time, keyset over the tradition (or ids). The repair is paragraph-authors
// { ids, write } on the books listed. params { ids?, religion = "Baha'i", top = 50 }. Deps: paragraphs-repo, docs-repo.
import { authorshipRows } from '../paragraphs-repo.js';
import { listDocs } from '../docs-repo.js';
import { trailerAuthors } from '../authorship/trailers.js';
import { isDraining } from '../drain.js';

export function staleTrailerRows(rows) {
  const given = trailerAuthors(rows);
  return rows.filter((r) => {
    if (given.has(r.id)) return false;
    try { return (JSON.parse(r.authors || '[]') || []).some((e) => e.role === 'author' && e.basis === 'trailer'); } catch { return false; }
  });
}

export async function staleTrailerReport({ ids = null, religion = "Baha'i", top = 50, after = 0 } = {}, deps = {}) {
  const { rowsOf = authorshipRows, docs = listDocs, draining = isDraining } = deps;
  const books = [], totals = { books_scanned: 0, books_affected: 0, paragraphs: 0 };
  const scan = async (d) => {
    const stale = staleTrailerRows(await rowsOf(d.id));
    totals.books_scanned++;
    if (!stale.length) return;
    totals.books_affected++; totals.paragraphs += stale.length;
    const names = {};
    for (const r of stale) for (const e of JSON.parse(r.authors)) if (e.basis === 'trailer') names[e.name] = (names[e.name] || 0) + 1;
    books.push({ id: d.id, title: d.title, stale: stale.length, first_pidx: stale[0].pidx, last_pidx: stale.at(-1).pidx, credited: names });
  };
  if (ids?.length) for (const id of ids) await scan({ id: Number(id) });
  else {
    for (let afterId = after; ;) {
      const page = await docs({ scope: 'canonicalWithProse', religion, fields: ['id', 'title'], limit: 500, afterId, count: false });
      for (const d of page.docs) {
        if (draining()) return { ...totals, resume: { after: d.id - 1 }, books: books.sort((a, b) => b.stale - a.stale).slice(0, top) };
        await scan(d);
      }
      if (page.docs.length < 500) break;
      afterId = page.docs.at(-1).id;
    }
  }
  return { ...totals, books: books.sort((a, b) => b.stale - a.stale).slice(0, top) };
}

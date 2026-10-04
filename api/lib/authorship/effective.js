// A paragraph's effective writer for search/chat: content.authors (migration 140, the reader) → legacy para_meta.author
// (regex-v1, Lights of Guidance only) → the doc's catalogue author. Pure. On behalf of Shoghi Effendi IS Shoghi Effendi.

const parse = (v) => { if (!v) return null; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

/** { author, quoted: [names], onBehalf, isReferenceLine } from a row holding authors / para_meta / author (doc). */
export function effectiveAuthor({ authors, para_meta: paraMeta, author } = {}) {
  const list = parse(authors);
  if (Array.isArray(list) && list.length) {
    const own = list.find((e) => e.role === 'author');
    return {
      // a writer judged to be "someone else" (other:true, no name) has NO known author — never the book's catalogue author
      // the book default keeps the book's own spelling of its author (one string per book in the index)
      author: own?.basis === 'book' ? (author || own.name || null) : own ? (own.name || null) : (author || null),
      fromBook: !own || own.basis === 'book',
      quoted: list.filter((e) => e.role === 'quoted' && e.name).map((e) => e.name),
      onBehalf: !!own?.on_behalf,
      isReferenceLine: !own && list.some((e) => ['reference', 'meta', 'heading'].includes(e.role)),
    };
  }
  const meta = parse(paraMeta);
  return { author: meta?.author || author || null, quoted: meta?.quoted_authors || [], onBehalf: false, isReferenceLine: !!meta?.is_attribution_line, fromBook: !meta?.author };
}

/** The author an index stores for a paragraph: its own writer when the reader named one, else the book's. One definition
 *  for Meili (unified-worker) and the Qdrant indexers, so an author filter means the same thing on both engines. */
export const paragraphAuthor = ({ authors, author }) => (authors && effectiveAuthor({ authors, author }).author) || author;

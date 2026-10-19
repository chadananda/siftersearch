// dewey-title-check ops report — the title index against the REAL library: each title → its matches with scores (read-only).
// A battery of variants (must find) and confusables (must not) — params { titles: [{ title, author?, expect?: id|null }] }.
import { titleIndex, matchTitle } from '../dewey/title-index.js';

export async function deweyTitleCheckJob({ titles = [] } = {}) {
  const t0 = Date.now();
  const idx = await titleIndex();
  const built = Date.now() - t0;
  const out = titles.map(({ title, author = null, expect }) => {
    const m = matchTitle(idx, title, { author });
    return { title, author, expect, top: m.slice(0, 5).map((x) => ({ id: x.doc.id, title: x.doc.title, author: x.doc.author, paras: x.doc.paragraph_count, score: x.score })) };
  });
  return { indexed: idx.size, load_ms: built, results: out };
}

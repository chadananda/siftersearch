// Research STRATEGIES as the agent's tools (Chad 11-12): each takes the parameters the agent chose and does the efficient part
// (book finder, in-work literal+meaning scan, quote search, extraction by Haiku). Plain data out; agent.js turns it into refs.
// Deps (injectable): book-pick bookFastPath, work-request findTitled, tools.run (quote_search), sow-links, work-extract, title-answer.
import { sowIssue, sowIssueIds, sowWholeAsked, SOW_FOLDER } from '../sow-links.js';

const uniq = (xs) => [...new Set(xs)];
const key = (p) => p.para_id ?? p.id ?? p.url ?? p.text;
// a passage the agent can cite: the link under source_url (renderRefs), the place beside the title
export const asPassage = (p) => ({ ...p, source_url: p.source_url || p.url || p.citation_url || null, document_id: p.document_id ?? p.doc_id ?? null,
  ...(p.place ? { note: `at ${p.place}` } : {}) });
/** Star of the West volumes began in March of 1909 + volume: a year → its volume (1910 = vol 1). Pure. */
export const sowVolumeOf = (year) => Number(year) - 1909;

export function strategyImpl({ search, fastSearch, deps = {} } = {}) {
  const ctx = { search, fastSearch };
  const quote = deps.quoteSearch || (async (a) => (await import('./tools.js')).run('quote_search', a, ctx));
  const title = deps.findTitled || (async (t) => (await import('./work-request.js')).findTitled([t]));
  // the work by title → { doc, ids: [every document searched], series? }. Star of the West = one document per issue; years narrow it.
  const resolve = async (work, years = []) => {
    const f = await title(work).catch(() => null);
    if (!f?.doc) return null;
    if (!sowWholeAsked(f.doc, work)) return { doc: f.doc, ids: [Number(f.doc.id)], series: null };
    const rows = await (deps.sowDocs || (async () => (await import('../docs-repo.js')).docsInFolder(SOW_FOLDER)))().catch(() => null);
    const issues = (rows || []).map((d) => ({ id: Number(d.id), at: sowIssue(d) })).filter((d) => d.at);
    const vols = new Set(years.map(sowVolumeOf));
    const picked = vols.size ? issues.filter((d) => vols.has(d.at.vol)) : issues;
    const ids = picked.length ? picked.sort((a, b) => a.at.vol - b.at.vol || a.at.issue - b.at.issue).map((d) => d.id) : (vols.size ? [] : await (deps.sowIssueIds || sowIssueIds)().catch(() => []));
    return { doc: f.doc, ids, series: 'Star of the West', years: years.length ? years : null };
  };
  return {
    /** The book itself: the finder + Jev's one pick, then the card the book answer builds. → { kind, doc|sec, book } | null */
    async bookCard({ title: name, author = null }) {
      const find = deps.bookFastPath || (await import('./book-pick.js')).bookFastPath;
      const found = await find({ messages: [{ role: 'user', content: [name, author && `by ${author}`].filter(Boolean).join(' ') }], names: [name], by: author || null, profile: {} });
      if (!found || !['work', 'section'].includes(found.kind)) return null;
      const t = await import('./title-answer.js');
      let book = null;
      const onEvent = (e) => { if (e.type === 'book') book = e.book; };
      if (found.kind === 'work') await (deps.titleAnswer || t.titleAnswer)(found.work, { onEvent });
      else await (deps.sectionAnswer || t.sectionAnswer)({ sec: found.sec, doc: found.doc }, { onEvent });
      return book ? { kind: found.kind, doc: found.kind === 'work' ? found.work.doc : found.doc, sec: found.sec ?? null, book } : null;
    },
    /** Each query inside one work, exact words AND by meaning, in parallel; merged and deduped. → { work, total, passages, per_query } | null */
    async searchInWork({ work, queries, years = [], section = null }) {
      const w = await resolve(work, years);
      if (!w) return null;
      if (!w.ids.length) return { work: { id: w.doc.id, title: w.series || w.doc.title }, total: 0, passages: [], per_query: [], note: `no ${w.series} issue for ${years.join(', ')}` };
      let range = {};
      if (section && w.ids.length === 1) {
        const secs = await (deps.sectionsOf || (async (id) => (await import('../repos/sections-repo.js')).sectionsOfDoc(id)))(w.ids[0]).catch(() => []);
        const { sectionNamed } = await import('./find-in-work.js');
        const s = sectionNamed(section, secs);
        if (s) range = { from: s.start_index, to: s.end_index ?? s.start_index };
      }
      const qs = uniq([].concat(queries || []).map(   // one wording may come as a plain string
      (q) => String(q || '').trim()).filter(Boolean));
      const per = await Promise.all(qs.flatMap((q) => ['literal', 'meaning'].map((mode) => quote({ query: q, mode, works: w.ids, limit: 10, ...range })
        .then((r) => ({ q, mode, r })).catch(() => ({ q, mode, r: null })))));
      const seen = new Set(), passages = [];
      for (const { r } of [...per.filter((x) => x.mode === 'literal'), ...per.filter((x) => x.mode === 'meaning')]) for (const p of r?.passages || []) if (!seen.has(key(p))) { seen.add(key(p)); passages.push(p); }
      return { work: { id: w.doc.id, title: w.series || w.doc.title, author: w.doc.author ?? null }, total: passages.length, passages,
        per_query: qs.map((q) => ({ query: q, exact: per.find((x) => x.q === q && x.mode === 'literal')?.r?.total ?? 0, meaning: per.find((x) => x.q === q && x.mode === 'meaning')?.r?.passages?.length ?? 0 })) };
    },
    /** quote_search: the passage that holds given words, filtered by religion / author / work. → quote_search's result */
    async findPassage({ query, religions = [], author = null, work = null }) {
      return quote({ query, religions: religions || [], authors: author ? [author] : [], works: work ? [work] : [], limit: 8 });
    },
    /** A selection made from one whole work (Haiku picks per chunk). → work-extract's { result, work } | null */
    async extractFromWork({ work, select }) {
      const f = await title(work).catch(() => null);
      if (!f?.doc) return null;
      const ex = deps.extractFromWork || (await import('./work-extract.js')).extractFromWork;
      return ex({ messages: [{ role: 'user', content: select }], doc: f.doc });
    },
  };
}

// Research STRATEGIES as the agent's tools (Chad 11-12): each takes the parameters the agent chose and does the efficient part
// (book finder, in-work literal+meaning scan, quote search, extraction by Haiku). Plain data out; agent.js turns it into refs.
// Deps (injectable): book-pick bookFastPath, work-request findTitled, tools.run (quote_search), sow-links, work-extract, title-answer.
import { sowIssue, sowIssueIds, sowWholeAsked, SOW_FOLDER } from '../sow-links.js';

import { asPassage } from './tool-defs.js';
export { asPassage };

const uniq = (xs) => [...new Set(xs)];
const key = (p) => p.para_id ?? p.id ?? p.url ?? p.text;
/** Star of the West volumes began in March of 1909 + volume: a year → its volume (1910 = vol 1). Pure. */
export const sowVolumeOf = (year) => Number(year) - 1909;

const TIER = { scripture: 0, interpretation: 1 };
const slug = (t) => { t = String(t || '').trim(); return !!t && !/\s/.test(t) && /[-_]/.test(t); };
const fold = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f’'`]/g, '').toLowerCase().trim();
/** Passages holding the same words → the words' own source first (Chad's standing rule): authority tier (quote_search's
 *  scripture / interpretation / rest), then the writer's own book over a book quoting him, then a published title over a
 *  slug-titled copy, then OceanLibrary's copy; search order breaks ties. Pure. */
export function sourceFirst(ps) {
  const quoting = (p) => !!p.book_author && fold(p.book_author) !== fold(p.author);
  const words = (p) => { const w = fold(p.text).replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean); return new Set(w.slice(0, -5).map((_, i) => w.slice(i, i + 6).join(' '))); };
  const tier = ps.map((p) => TIER[p.authority] ?? 2);
  // the writer's own book inherits the best tier of a book quoting the same words from him (11-14 round 3: Paris Talks, "reported", lost
  // to the compilation "Bahá'í Sacred Writings", tagged scripture, for 'Abdu'l-Bahá's own line — the reply cited the compilation)
  ps.forEach((c, j) => {
    if (!quoting(c) || !c.author) return;
    const cw = words(c);
    ps.forEach((o, i) => { if (!quoting(o) && fold(o.author) === fold(c.author) && [...words(o)].some((x) => cw.has(x))) tier[i] = Math.min(tier[i], tier[j]); });
  });
  const rank = (p, i) => [tier[i], quoting(p) ? 1 : 0, slug(p.title || p.work) ? 1 : 0,
    /oceanlibrary\.com/.test(String(p.source_url || p.url || '')) ? 0 : 1];
  return ps.map((p, i) => ({ p, i, r: rank(p, i) })).sort((a, b) => { for (let k = 0; k < 4; k++) if (a.r[k] !== b.r[k]) return a.r[k] - b.r[k]; return a.i - b.i; }).map((x) => x.p);
}

// A VOLUME is part of a title (11-14 live: "The Revelation of Bahá'u'lláh vol. 2" resolved to vol. 3 — the title matcher scores the
// volumes alike and the longest wins — so every volume searched was vol. 3 and the reply said the library lacked vol. 1 and the
// Tablet of Aḥmad chapter, which is in vol. 2). volumeOf: the volume a title names (arabic or roman) or null; seriesTitle: the
// title without it. Pure.
const VOL = /[\s,;:(–—-]*\b(?:vol(?:ume)?\.?|v\.|tome)\s*(\d{1,3}|[ivxlc]{1,6})\b\.?\)?/i;
const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100 };
const roman = (r) => [...r.toLowerCase()].reduce((n, ch, i, a) => n + (ROMAN[ch] < (ROMAN[a[i + 1]] || 0) ? -ROMAN[ch] : ROMAN[ch]), 0);
export const volumeOf = (t) => { const m = String(t || '').match(VOL); return m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : roman(m[1])) : null; };
export const seriesTitle = (t) => String(t || '').replace(VOL, '').trim();
const foldS = (t) => fold(seriesTitle(t)).replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim();
/** The volumes of the found work's series (same title without its volume, same author), in volume order. Pure. */
export function volumesOf(doc, docs) {
  const base = foldS(doc.title), by = fold(doc.author);
  const vols = (docs || []).filter((d) => volumeOf(d.title) != null && foldS(d.title) === base && fold(d.author) === by);
  const one = new Map();
  for (const d of vols.sort((a, b) => volumeOf(a.title) - volumeOf(b.title) || (b.paragraph_count || 0) - (a.paragraph_count || 0))) if (!one.has(volumeOf(d.title))) one.set(volumeOf(d.title), d);
  return [...one.values()];
}

export function strategyImpl({ search, fastSearch, deps = {} } = {}) {
  const ctx = { search, fastSearch };
  const quote = deps.quoteSearch || (async (a) => (await import('./tools.js')).run('quote_search', a, ctx));
  const title = deps.findTitled || (async (t) => (await import('./work-request.js')).findTitled([t]));
  // the work by title → { doc, ids: [every document searched], series? }. Star of the West = one document per issue; years narrow it.
  // the series' books: every copy titled like the series (the volumes); stubbed in tests
  const seriesDocs = deps.seriesDocs || (async (t) => (await (await import('./work-request.js')).rankTitled([t], { widen: true, limit: 40 })).sorted);
  // a work in volumes: the volume asked for, else every volume (a question about the series is a question about all of it)
  const volumes = async (doc, work) => {
    if (volumeOf(doc.title) == null) return null;
    const vols = volumesOf(doc, await seriesDocs(seriesTitle(doc.title)).catch(() => []));
    if (!vols.some((d) => Number(d.id) === Number(doc.id))) vols.push(doc);
    const want = volumeOf(work);
    if (want != null) { const v = vols.find((d) => volumeOf(d.title) === want); return v ? { doc: v, ids: [Number(v.id)], series: null } : { doc, ids: [], series: null, note: `the library holds ${seriesTitle(doc.title)} vols. ${vols.map((d) => volumeOf(d.title)).join(', ')} — no vol. ${want}` }; }
    return vols.length > 1 ? { doc: vols[0], ids: vols.map((d) => Number(d.id)), series: `${seriesTitle(doc.title)} (vols. ${vols.map((d) => volumeOf(d.title)).join(', ')})` } : null;
  };
  const resolve = async (work, years = []) => {
    const f = await title(work).catch(() => null);
    if (!f?.doc) return null;
    const v = await volumes(f.doc, work);
    if (v) return v;
    if (!sowWholeAsked(f.doc, work)) return { doc: f.doc, ids: [Number(f.doc.id)], series: null };
    const rows = await (deps.sowDocs || (async () => (await import('../docs-repo.js')).docsInFolder(SOW_FOLDER)))().catch(() => null);
    const issues = (rows || []).map((d) => ({ id: Number(d.id), at: sowIssue(d) })).filter((d) => d.at);
    const vols = new Set(years.map(sowVolumeOf));
    const picked = vols.size ? issues.filter((d) => vols.has(d.at.vol)) : issues;
    const ids = picked.length ? picked.sort((a, b) => a.at.vol - b.at.vol || a.at.issue - b.at.issue).map((d) => d.id) : (vols.size ? [] : await (deps.sowIssueIds || sowIssueIds)().catch(() => []));
    return { doc: f.doc, ids, series: 'Star of the West', years: years.length ? years : null };
  };
  return {
    /** A published talk by speaker / topic / title (talk-search.js). → { talks } */
    talkSearch: async (a) => (await import('./talk-search.js')).talkSearch(a, deps.talk || {}),
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
      if (!w.ids.length) return { work: { id: w.doc.id, title: w.series || w.doc.title }, total: 0, passages: [], per_query: [], note: w.note || `no ${w.series} issue for ${years.join(', ')}` };
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
    // exact words → the SOURCE first (sourceFirst). 11-12 replay: search order put scholarship first and Prayers and
    // Meditations 27th, so the agent cited Esslemont for the Short Obligatory Prayer. 30 hits, ranked.
    async findPassage({ query, religions = [], author = null, work = null }) {
      const r = await quote({ query, religions: religions || [], authors: author ? [author] : [], works: work ? [work] : [], limit: 30 });
      return r?.mode_used === 'literal' && r.passages?.length ? { ...r, passages: sourceFirst(r.passages) } : r;
    },
    /** A selection made from one whole work (Haiku picks per chunk). → work-extract's { result, work } | null */
    async extractFromWork({ work, select }) {
      const w = await resolve(work).catch(() => null);
      if (!w?.doc || !w.ids.length) return null;   // the volume asked for (a whole series: its first volume)
      const f = { doc: w.doc };
      const ex = deps.extractFromWork || (await import('./work-extract.js')).extractFromWork;
      return ex({ messages: [{ role: 'user', content: select }], doc: f.doc });
    },
  };
}

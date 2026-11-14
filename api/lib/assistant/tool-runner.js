// The library tools behind refs (P# passages, W# web answers, B# works): toolRunner, show/fit/clip helpers. PURE — bundles for a Worker (agent-core.js).
// Server-only defaults (rights, title finder, link maps) come in as opts.fallback; researcher.js wraps this with them. Deps: source-tier, head-of, forensics, tool-cache
import { headOf } from '../text/head-of.js';
import { byTier, coreFirst, isWrittenCore, misfiled, needsWritings, sourceTier, tierLabel } from './source-tier.js';
import { copyClass, COPY_CLASSES } from '../audit/forensics.js';
import { canonicalTradition } from './tradition-name.js';
import { translationLabel } from './tool-defs.js';
import { part } from './tool-cache.js';

export const PASSAGE_CHARS = 4000;   // = prompt.js PASSAGE_CHARS (a passage's shown length)

// THE ENGLISH BESIDE AN ORIGINAL (11-04 digest #147): of an original's linked English copies, the translation of that work
// (Shoghi Effendi's first, then another translation of the Writing) is its rendering; a compilation, or a letter or talk quoting
// it, is only the fallback, and says what it is. Stable among equals (the links arrive best first). Pure.
const RENDERING_CLASSES = new Set(['se-translation', 'writing']);
export function pickRendering(list = []) {
  const ranked = (list || []).filter(Boolean).map((t, i) => ({ t, i, cls: copyClass(t) }))
    .sort((a, b) => COPY_CLASSES.indexOf(a.cls) - COPY_CLASSES.indexOf(b.cls) || a.i - b.i);
  return ranked.length ? { ...ranked[0], rendering: RENDERING_CLASSES.has(ranked[0].cls) } : null;
}
/** The note on the English shown beside original ref: a translation is named one; any other copy is named by its class. A note, never the
 *  title — the title becomes the citation's link text (11-12: "(The Kitáb-i-Aqdas (English translation of the original P39))" reached a reply). */
export const renderingNote = (ref, pick) => (!pick || pick.rendering ? `English translation of the original ${ref}`
  : `${pick.cls.replace(/-/g, ' ')} copy of the original ${ref} — not its own translation`);
/** How many original-language Writings a Bahá'í search keeps beside its English hits (the per-language quota). */
export const ORIGINALS_QUOTA = 3;
/** A passage in Arabic or Persian (the library's codes are not normalised: ar/Ar/ara, fa/Fa/fas/per). Pure. */
export const isOriginalLanguage = (p) => /^(ar|fa|per|pes)/i.test(String(p?.language || ''));
// a cut ends at a sentence (else a word) and says the text goes on — never mid-word (prompt.js headOf)
export const clipText = (t, n) => headOf(String(t || '').replace(/\s+/g, ' ').trim(), n);
// a tool's output reaches the model clipped at TOOL_CHARS (agent.js, research()); show() shares SHOW_CHARS of it among its
// passages (the rest is room for a tool's own lines), so a long paragraph shortens the others instead of pushing the last out
export const TOOL_CHARS = 12000;
const SHOW_CHARS = TOOL_CHARS - 500;

/** Per-item lengths that fit `room` in all: each keeps `want[i]` when the total fits, else every item above a common
 *  level is cut to it (the short ones stay whole). Pure. */
export function fitLengths(want, room) {
  if (want.reduce((a, w) => a + w, 0) <= room) return want;
  let left = Math.max(0, room), level = 0;
  const order = want.map((w, i) => [w, i]).sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < order.length; k++) {
    const share = Math.floor(left / (order.length - k));
    if (order[k][0] > share) { level = share; break; }
    left -= order[k][0];
  }
  return want.map((w) => Math.min(w, Math.max(200, level)));
}
// A SOURCE ANSWER (Chad 11-14 "Let your vision be world-embracing": "showing where the UHJ cited it or published it in other compilations is a
// waste of time"; "if the source is Gleanings, just the passage from Gleanings would have been sufficient … 'This passage is quoted from the
// Tablet of …' and link to that tablet in Oceanoflights.org"; "Two links."): of quotation_candidates' finds the writer gets the source passage
// alone, with the one line to write under it — the source linked to its paragraph, and, only when the original is certain AND named, that tablet
// linked to its Ocean of Lights page: "From [Gleanings…](…), quoting [the Lawḥ-i-…](…)." The original's own text never reaches the writer.
// Works citing it, further holders and near passages are dropped while a source holds; with no source, at most two near passages, each
// marked as not the quoted words. Passages without roles (an older server) pass through as before. Pure.
export function sourceLine(source, original = null) {
  const link = (label, url) => (url ? `[${label}](${url})` : label);
  const t = String(original?.title || '').trim(), the = /^the\s/i.test(t) ? '' : 'the ';
  const tablet = original && t && !/^untitled\b/i.test(t) && original.source_url ? `, quoting ${the}${link(t, original.source_url)}` : '';
  const label = String(source.title || 'the source').trim() + (source.place ? `, ${source.place}` : '');   // where in the work, when known (refs/place.js)
  return `From ${link(label, source.source_url)}${tablet}.`;
}
// THE SOURCE IS CORE (memory "quote candidates = core only"; 11-14 replay: the tower named "Paradise and Paradigm", a scholar's study
// filed on the Christian shelf with author "Bahá'u'lláh", as the source): a Bahá'í source is a written text of the Central Figures or Shoghi
// Effendi (sourceTier writings | guardian), never a misfiled document; another tradition's source keeps the tool's choice. A non-core
// 'source' is set aside, and a core passage the tool returned that holds the words (score ≥ 0.9: the quotation's own words) takes its place.
const coreSource = (p) => !misfiled(p) && (!sourceTier(p) || ['writings', 'guardian'].includes(sourceTier(p)));
const HOLDS = 0.9;
export function sourceAnswer(list = []) {
  const ps = (list || []).filter(Boolean);
  if (!ps.some((p) => p.role)) return ps;
  const named = ps.find((p) => p.role === 'source');
  const source = named && coreSource(named) ? named
    : named ? (((x) => x && { ...x, role: 'source' })(ps.find((p) => p !== named && ['cited_by', 'holder'].includes(p.role) && Number(p.score) >= HOLDS && sourceTier(p) && coreSource(p)))) : null;
  if (!source) return ps.filter((p) => p.role === 'holder' || p.role === 'near').slice(0, 2)
    .map((p) => ({ ...p, note: 'NOT the quoted words — a near passage; say plainly that no published source holds the exact wording' }));
  const orig = ps.find((p) => p.role === 'original' && p.document_id !== source.document_id);
  return [{ ...source, note: `SOURCE — the answer is this passage as its card ({{quote ref}}), then this ONE line exactly as it stands: ${sourceLine(source, orig)}` }];
}
/** The library tools behind refs: P# passages, W# web answers, B# works. Shared by research() and the agent (agent.js). */
export function toolRunner(impl, { search: searchName = 'combined_search', fallback = {} } = {}) {
  const found = new Map();   // ref → passage
  const works = new Map();   // ref → a library work { title, author, url } (document_search)
  let pn = 0, wn = 0;
  const addWork = (w) => { const dup = [...works.values()].find((x) => x.id === w.id); if (dup) return dup.ref; const ref = `B${works.size + 1}`; works.set(ref, { ...w, ref }); return ref; };
  const add = (p, web = false) => {
    if (!p?.text) return null;
    const dup = [...found.values()].find((x) => (p.id && x.id === p.id) || (x.text === p.text && x.title === p.title));
    if (dup) return dup.ref;
    const ref = web ? `W${++wn}` : `P${++pn}`;
    found.set(ref, { ...p, ref });
    return ref;
  };
  // an existing translation is shown whole (the writer quotes it line by line) and says what kind it is
  // the researcher reads a passage as long as the writer will (11-04: at 900 a 1,083-character Dawn-Breakers paragraph lost
  // its last sentence, "It was left to Bahá'u'lláh to unveil it")
  const show = (refs, n = PASSAGE_CHARS) => {
    const ps = refs.filter(Boolean).map((r) => [r, found.get(r)]);
    if (!ps.length) return '(nothing)';
    // each head says the passage's standing (source-tier.js: Writings, Shoghi Effendi, reported speech, the House, commentary)
    const heads = ps.map(([r, p]) => { const tier = tierLabel(p);
      return `[${r}] ${p.title || '?'} — ${p.author || '?'}${p.language && p.language !== 'en' ? ` (${p.language})` : ''}${tier ? ` · ${tier}` : ''}${p.translation ? ` · EXISTING TRANSLATION: ${p.translation}` : ''}${p.note ? ` · ${p.note}` : ''}${p.implied_by?.question ? ` · Implied: ${p.implied_by.question}${p.implied_by.premise ? ` — answered by implication: ${p.implied_by.premise}` : ''}${p.implied_by.implies ? ` (bears on: ${p.implied_by.implies})` : ''}` : ''}`; });
    const texts = ps.map(([, p]) => String(p.text || '').replace(/\s+/g, ' ').trim());
    // + "\n", the " …" a cut adds, and the "\n\n" between passages
    const caps = fitLengths(texts.map((t, i) => Math.min(t.length, ps[i][1].translation ? Math.max(n, 4000) : n)), SHOW_CHARS - heads.reduce((a, h) => a + h.length + 5, 0));
    return ps.map((_, i) => `${heads[i]}\n${headOf(texts[i], caps[i])}`).join('\n\n');
  };
  const searched = [];   // each search's query and its passages' documents in rank order (research's book step)
  // AUTHORITATIVE TIER FIRST (11-04 taxation: the Writings never reached the brief; talks and Esslemont did). A Bahá'í search
  // whose hits hold no written Writings and nothing of Shoghi Effendi is searched again in those writers' works alone
  // (impl.writings), and every search's passages are shown in tier order, search rank kept within a tier. Metadata, never words.
  const bahaiSearch = (tradition, hits) => /bah/i.test(String(tradition || '')) || hits.filter((p) => /bah/i.test(String(p.religion || ''))).length * 2 > hits.length;
  // ORIGINAL-LANGUAGE QUOTA (11-04, measured on prod): an English query's fused ranking put NO Persian/Arabic Writing in the
  // top 8 on six social/legal matters — English-English phrase matches fill the phrase layer, originals reach the fusion only
  // through HyPE at rank 10-44 — while the same query held to the ar-fa group returns 22-29 originals of 30. So a Bahá'í search
  // also runs the query over the original-language Writings (impl.originals, in parallel) and keeps up to ORIGINALS_QUOTA of them,
  // each with its linked translation (impl.translationsOf) or marked as having none. Metadata (language, writer), never words.
  const originalsFor = async (query, hits, early) => {
    if (!impl.originals || !(early || (hits.length && bahaiSearch(undefined, hits)))) return [];
    const seen = new Set(hits.map((p) => p.id).filter((x) => x != null));
    const got = await Promise.resolve(early || impl.originals(query)).catch(() => []);
    return (got || []).filter((p) => isOriginalLanguage(p) && (p.id == null || !seen.has(p.id))).slice(0, ORIGINALS_QUOTA);
  };
  // an original's head says what to quote: its linked translation (shown next, verbatim) or a provisional rendering of its own
  const showOriginals = async (orig) => {
    const ids = orig.map((p) => p.id).filter((x) => x != null);
    const linked = (ids.length && impl.translationsOf ? await impl.translationsOf(ids).catch(() => null) : null) || new Map();
    return orig.map((p) => {
      const ref = add(p);
      const pick = pickRendering(linked.get?.(p.id));
      const t = pick?.t || (p.english ? { ...p, id: `${p.id}-en`, text: p.english, language: 'en', english: undefined, translation: translationLabel(null, null) } : null);
      const tref = t ? add({ ...t, translation: t.translation || 'translation', title: t.title || p.title, note: renderingNote(ref, pick?.t === t ? pick : null) }) : null;
      const o = found.get(ref);
      if (o && !o.note) o.note = tref ? (pick && pick.t === t && !pick.rendering
        ? `ORIGINAL — no translation of this work is linked; its English appears in ${tref}, a ${pick.cls.replace(/-/g, ' ')} copy: quote that verbatim beside this original line and name it as that copy, not as the translation`
        : `ORIGINAL — its linked translation is ${tref}: quote that verbatim beside this original line`)
        : `ORIGINAL — no linked translation: quote the key original line, linked to this tablet, and beside it give its sense in English, marked "provisional translation by Anís — not an authorized translation"; still a Writing, above any scholar's book`;
      return [ref, tref];
    }).flat();
  };
  const searchLibrary = async ({ query, tradition: tr, filters, about }) => {
    const tradition = tr ?? filters?.tradition;
    const early = impl.originals && /bah/i.test(String(tradition || '')) ? impl.originals(query).catch(() => []) : null;
    // a Bahá'í-scoped search starts the Writings pass beside it (11-12: run after it, the two searches took 2.5–4.8 s); used only when needed
    const wEarly = impl.writings && /bah/i.test(String(tradition || '')) ? impl.writings(query).catch(() => []) : null;
    let hits = (await impl.search(query, tradition)).slice(0, 8);
    // CORE FIRST (Chad 11-14, "Who is the Evil One": a scholar's study led, 'Abdu'l-Bahá quoted through it, then pilgrim notes,
    // the Writings fourth): the Writings are searched on the same point whenever the hits hold too few written core passages
    // or a talk, recollection or study ranks ahead of them (source-tier.js needsWritings) — not only when none is there
    if (impl.writings && hits.length !== 0 && bahaiSearch(tradition, hits) && needsWritings(hits)) {
      const extra = await (wEarly || impl.writings(query)).catch(() => []);
      const seen = new Set(hits.map((p) => p.id).filter((x) => x != null));
      hits = [...(extra || []).filter((p) => p.id == null || !seen.has(p.id)).slice(0, 4), ...hits];
    } else if (impl.writings && !hits.length && /bah/i.test(String(tradition || ''))) {
      hits = (await (wEarly || impl.writings(query)).catch(() => [])).slice(0, 4);
    }
    const orig = await originalsFor(query, hits, early);
    hits = byTier(hits).slice(0, 10 - orig.length);
    // the agent's own-source pass (own-source.js preferOwnWork): a Writing quoted in a compilation or another's book → the writer's own work
    const o0 = Date.now();
    if (impl.ownSource) hits = (await impl.ownSource(hits).catch(() => null)) || hits;
    if (impl.ownSource) part('own_source', Date.now() - o0);
    // written core (English Writings, Shoghi Effendi) → the Persian/Arabic originals with their translations → compilations,
    // talks, recollections, the House → commentary last, and left out when the written core is enough (source-tier.js coreFirst)
    // — for a TEACHING question. A history or biography question (the agent's own judgment, `about`; Chad 11-14, Dawn-Breakers:
    // "we will need to pull in other sources to unravel many of these") keeps the same order and drops nothing
    const history = about === 'history';
    const { kept, left } = history ? { kept: byTier(hits), left: 0 } : coreFirst(byTier(hits), orig.length);
    hits = kept;
    searched.push({ query, docs: hits.map((p) => p.document_id).filter((x) => x != null) });
    const core = hits.filter(isWrittenCore).map((p) => add(p));
    const origRefs = await showOriginals(orig);
    const rest = hits.filter((p) => !isWrittenCore(p)).map((p) => add(p));
    const out = show([...core, ...origRefs, ...rest]);
    if (history && hits.some((p) => sourceTier(p) === 'secondary')) return `${out}\n\n(history question: scholarship is kept — name each scholar's claim as theirs ("Balyuzi writes…"); the Writings and Shoghi Effendi still lead where they speak)`;
    return left ? `${out}\n\n(${left} passage${left > 1 ? 's' : ''} of commentary left out: the Writings above answer this — search a scholar by name only for a point they do not address; if this is a history or biography question, search again with about: "history" to keep them)` : out;
  };
  // originals_search: the original-language pass alone, as many as it finds (the researcher's own Persian/Arabic or English words)
  const searchOriginals = async ({ query, tradition }) => {
    if (tradition && canonicalTradition(tradition) !== "Baha'i") return `no original-language search for ${tradition}: the originals index holds the Bahá’í Persian/Arabic Writings only`;   // honest absence, never another tradition's originals
    if (!impl.originals) return 'no original-language search here';
    const orig = ((await impl.originals(query).catch(() => [])) || []).filter(isOriginalLanguage).slice(0, 6);
    return orig.length ? show(await showOriginals(orig)) : `no Persian/Arabic Writing found for "${query}" — try the matter's own words in Persian or Arabic`;
  };
  // keyed by canonical tool name (tools.js); a call by an old name resolves through canonical()
  // a copyrighted (encumbered) book is never read around — consecutive paragraphs are not a short excerpt (Chad 10-23)
  // rowsAround → the neighbouring passages, or the copyright notice (a string); readAround also adds them for the model
  const COPYRIGHT = 'this book is under copyright: quote only the excerpt you already have (with its link); its neighbouring paragraphs are not available';
  const rowsAround = async (p, before, after) => {
    const enc = await (impl.encumberedAmong || fallback.encumberedAmong || (async (ids) => new Set(ids.map(Number))))([p.document_id]).catch(() => new Set([Number(p.document_id)]));   // fails CLOSED: unknown rights = copyrighted
    if (enc.has(Number(p.document_id))) return COPYRIGHT;
    return impl.around(p, Math.min(5, before), Math.min(5, after));
  };
  const readAround = async (p, before, after) => { const r = await rowsAround(p, before, after); return typeof r === 'string' ? r : show(r.map((x) => add(x))); };
  const run = {
    combined_search: searchLibrary,
    fused_search: searchLibrary,
    originals_search: searchOriginals,
    context_lookup: async ({ ref, before = 2, after = 2 }) => {
      const p = found.get(String(ref).toUpperCase());
      if (!p?.document_id) return 'unknown ref';
      return readAround(p, before, after);
    },
    // the whole prayer a found passage belongs to (tools.js whole_lookup: it never reads around a copyrighted book) — 11-12: the agent quoted the
    // Short Obligatory Prayer without its last line
    whole_lookup: async ({ ref }) => {
      const p = found.get(String(ref).toUpperCase());
      if (!p?.document_id) return 'unknown ref';
      if (!impl.whole) return 'no whole-prayer reading here';
      const r = await impl.whole(p).catch(() => null);
      if (!r?.passages?.length) return 'no whole prayer found around this passage — context_lookup it';
      // ONE ref for the whole prayer (its paragraphs joined, the first one's link): quoted once, cited once — as separate refs the
      // agent split it into two quotations and doubted they belonged together (11-12)
      const [a] = r.passages, whole = { ...a, id: `${a.id}-whole`, text: r.passages.map((x) => x.text).join('\n\n') };
      return `the whole prayer (${r.passages.length} paragraph${r.passages.length === 1 ? '' : 's'}, one prayer) — quote it as one:\n\n${show([add(whole)])}`;
    },
    document_search: async ({ title }) => {
      const w = await (impl.work || fallback.work || (async () => null))(title).catch(() => null);
      if (!w) return `no work titled "${title}" in the library`;
      // only the best match is the book asked for; the others (chapter files, namesakes) are listed but take no book-step slot
      // (11-03: The Dawn-Breakers + its Chapter X + Chapter I filled all three slots and crowded out the other histories)
      const all = [w.doc, ...w.others], urlOf = await (fallback.urlOf ? fallback.urlOf(all, !!impl.work) : (x) => x.url);   // the online publisher wins, as for a passage
      return all.map((x, i) => `[${addWork({ ...x, url: urlOf(x), ...(i ? { other: true } : {}) })}] ${x.title}${x.author ? ` — ${x.author}` : ''}${x.encumbered === 1 ? ' (copyrighted: opening pages only)' : ''}\nlink: ${urlOf(x) || 'none (no public page: write the title unlinked)'}`).join('\n\n');
    },
    // the whole tablet as a PDF, original beside translation — its link a [B#] the reply gives (Chad 11-13)
    side_by_side_document: async ({ ref }) => {
      const p = found.get(String(ref).toUpperCase());
      if (!p?.document_id) return 'unknown ref';
      if (!impl.sbsDocument) return 'documents cannot be made here';
      const r = await impl.sbsDocument(p).catch((e) => ({ error: e.message }));
      if (!r?.url) return `no side-by-side document: ${r?.error || 'it could not be made'} — say so in one line`;
      const b = addWork({ id: `sbs-${r.document_id}`, title: `${r.title} (PDF)`, url: r.url, pdf: true });
      return `[${b}] ${r.title}: a printable PDF, ${r.rows} rows${r.approximate ? ', aligned approximately' : ''}. Give it to the reader as [[${b}]].`;
    },
    original_lookup: async ({ english }) => show((await impl.original(english)).map((x) => add(x))),
    translation_lookup: async ({ original }) => {
      const found = impl.translation ? await impl.translation(original) : [];
      if (!found.some((x) => x.translation)) return `no linked translation found from the original wording${found.length ? ` (the original: ${show(found.map((x) => add(x)))})` : ''} — draft an English rendering of one distinctive sentence and call quotation_candidates with it`;
      return show(found.map((x) => add(x)), 4000);
    },
    // the contract names the word term_arabic (tools.js); `word` is the older name (11-12: the agent sent term_arabic, the runner read word → every call empty)
    rendering_lookup: async ({ word: w, term_arabic: ta }) => {
      const word = ta ?? w;
      const r = await impl.wordStudy(word);
      // an empty result is about the SPELLING, never evidence (10-19: "bayt" found nothing and the reply disowned a real chart)
      if (!r) return `no concordance entry for "${word}" in this spelling — this says nothing about the word; try it in Arabic script (e.g. بيت, غرفة, حجرة)`;
      return `${r.summary}\n\n${show((r.passages || []).map((x) => add(x)))}`;
    },
    source_trace: async ({ ref }) => {
      const p = found.get(String(ref).toUpperCase());
      if (!p) return 'unknown ref';
      return show((await impl.trace(p)).map((x) => add(x)));
    },
    quotation_candidates: async ({ quotation }) => {
      const r = show(sourceAnswer(await impl.sourceOf(quotation)).map((x) => add(x)));
      return r === '(nothing)' ? `no published source found for that wording — ${searchName} with its most distinctive phrase; if that finds nothing either, say plainly that the library holds no source for it` : r;
    },
    web_search: async ({ query }) => {
      const r = await impl.web(query);
      if (!r?.text) return 'no web answer';
      const ref = add({ text: r.text, title: `Web: ${clipText(query, 60)}`, author: 'web search', source_url: r.citations?.[0]?.url || null, web: true }, true);
      return `[${ref}] (WEB — not the library)\n${clipText(r.text, 1500)}${r.citations?.length ? `\nSources: ${r.citations.slice(0, 5).map((c) => c.url || c).join(' · ')}` : ''}`;
    },
  };
  return { found, works, searched, add, addWork, show, run, readAround, rowsAround };
}

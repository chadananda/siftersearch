// THE RESEARCHER (Chad 10-19: "How do we make Anís into a useful research and study assistant. It seems downright
// reluctant to be helpful" · "I think we have made it too determinative" · "Even Haiku 5.5 might be sufficient for
// planning research"). Regexes used to decide beforehand what kind of question it was and which ONE lookup to run; a
// question between shapes got a generic search and an apology. Here a model plans the research itself, with the
// library's own instruments as tools — search, read around a passage, the original of an English passage, Shoghi
// Effendi's renderings of a word, the source of a quotation, the web — and ends with a BRIEF for the writer. Its
// passages become the reply's evidence, so the quote gate and link rules still hold. Deps injectable (tests).
import { logger } from '../logger.js';
import { withDeadlines } from './deadline.js';
import { currentAIContext, withAIContext } from '../ai-context.js';
import { run as runTool, llmTools, canonical, toPassage, translationLabel, letterVariants } from './tools.js';
import { combinedSearch, COMBINED_TOOL } from './combined-search.js';
import { authorMatch, fold, mainKey } from '../dewey/title-index.js';
import { DOCTRINAL_KEYS } from '../search/doctrinal-rank.js';
import { headOf, PASSAGE_CHARS } from './prompt.js';
import { byTier, hasAuthoritative, tierLabel } from './source-tier.js';
import { copyClass, COPY_CLASSES } from '../audit/forensics.js';
import { anchorToolCalls, hasSearch, subjectOr } from './query-anchor.js';
export { translationLabel, letterVariants };
const log = logger.child ? logger.child({ mod: 'anis-researcher' }) : logger;

// the researcher's tools, by canonical name (tools.js registry); the definitions are generated from the registry's schemas
export const RESEARCH_TOOL_NAMES = ['combined_search', 'originals_search', 'context_lookup', 'original_lookup', 'translation_lookup', 'rendering_lookup', 'source_trace', 'quotation_candidates', 'document_search', 'web_search'];
const canon = (n) => (n === 'combined_search' ? n : canonical(n));   // the rollback planner search is not a registry tool
export const TOOLS = RESEARCH_TOOL_NAMES.flatMap((n) => (n === 'combined_search' ? [COMBINED_TOOL] : llmTools([n])));
// THE ENGLISH BESIDE AN ORIGINAL (11-04 digest #147): of an original's linked English copies, the translation of that work
// (Shoghi Effendi's first, then another translation of the Writing) is its rendering; a compilation, or a letter or talk quoting
// it, is only the fallback, and says what it is. Stable among equals (the links arrive best first). Pure.
const RENDERING_CLASSES = new Set(['se-translation', 'writing']);
export function pickRendering(list = []) {
  const ranked = (list || []).filter(Boolean).map((t, i) => ({ t, i, cls: copyClass(t) }))
    .sort((a, b) => COPY_CLASSES.indexOf(a.cls) - COPY_CLASSES.indexOf(b.cls) || a.i - b.i);
  return ranked.length ? { ...ranked[0], rendering: RENDERING_CLASSES.has(ranked[0].cls) } : null;
}
/** The head for the English shown beside original ref: a translation is named one; any other copy is named by its class. */
export const renderingTitle = (title, ref, pick) => (!pick || pick.rendering ? `${title} (English translation of the original ${ref})`
  : `${title} (${pick.cls.replace(/-/g, ' ')} copy of the original ${ref} — not its own translation)`);
/** How many original-language Writings a Bahá'í search keeps beside its English hits (the per-language quota). */
export const ORIGINALS_QUOTA = 3;
// a shown passage head in Arabic/Persian: "[P3] Title — Author (fa) · …" (show())
const ORIGINAL_HEAD = /^\[P\d+\] [^\n]* — [^\n]*?\((?:ar|fa|per|pes)[a-z]*\)/gim;
/** A passage in Arabic or Persian (the library's codes are not normalised: ar/Ar/ara, fa/Fa/fas/per). Pure. */
export const isOriginalLanguage = (p) => /^(ar|fa|per|pes)/i.test(String(p?.language || ''));

export const RESEARCH_SYSTEM = `You are the research mind behind Anís, a study companion for the world's sacred texts. The library holds primary texts in English and in their original languages (Arabic, Persian, Hebrew…), authorised interpretation, history and scholarship, and you reach it through tools. Your job: find what a generous, well-read scholar would bring to THIS person's question, then write a BRIEF for the writer.
- First work out what the person is reaching for, and serve that — read them charitably; never quibble with their wording, spelling or grammar.
- Read references in the sense of the reader's own community, and in the PRESENT, unless they say otherwise (10-19 battery: "ABS" read as the American Bible Society, "the Nine Year Plan" as 1964). For the Bahá'í library: "the House" = the Universal House of Justice; "the Nine Year Plan" = the current plan (2022–2031); "ABS" = the Association for Bahá'í Studies; "the Master" = 'Abdu'l-Bahá; "the Guardian" = Shoghi Effendi; "the Blessed Beauty" = Bahá'u'lláh; "the Most Holy Book" = the Kitáb-i-Aqdas; a reference like "63.6" is a message's paragraph, not a year.
- Match the depth to the question. A STUDY question (what do the Writings say about X; compile, list, compare; background; how to apply) deserves broad research — usually 4–8 calls, several passages per point from the authoritative texts. A quick factual question: the answer, then its source.
- Research like a scholar: search in the words the texts would use; follow leads — read around a passage, fetch its original, study how a word was rendered, trace a quotation to its source. Usually 2–5 calls; stop when you have enough.
- AUTHORITY DECIDES (a decision, Chad 10-23). DOCTRINAL and INTERPRETIVE questions (what the Faith teaches, what a text means): the sources are, in order, the Writings of the Báb, Bahá'u'lláh and 'Abdu'l-Bahá; then Shoghi Effendi (letters written on his behalf included); then pilgrims' notes of the Central Figures and the Guardian. NOTHING after the Guardian has doctrinal or interpretive authority (Chad 10-23: "The House of Justice has zero doctrinal or interpretive authority. Zero. … The House only has legal authority") — not the Universal House of Justice, no institution, no scholar. Search for the Writings' and the Guardian's own words first; keep pilgrims' notes as the next evidence (when the written text exists it leads and the note follows; when it does not, the note is the best evidence there is — mark it in the brief as a pilgrim's recollection: who, which notes; never brief it as "no authority"; flag it only where it seems to conflict with the written text). Never rest a doctrinal point on a House letter, an institution or a scholar — they may be named only as commentary or as signposts (source_trace them to the texts). LAW and ADMINISTRATION questions (the Plans, elections, Assemblies, the Fund, Huqúqu'lláh, consent to marriage, what is permitted now): the Universal House of Justice is the PRIMARY source — its legal authority — cited after the law it applies. Scholars and memoirs: commentary and history, labelled as such.
- NO REFLEX TRUISMS (Chad 10-23: "a poorly thought out truism repeated out of context by many Bahá'ís to the point of exaggeration"): never repeat a popular Bahá'í saying or stock disclaimer by reflex — "pilgrim notes have no authority", blanket claims about what "Bahá'ís believe" that are not in the texts, a single quotation read far beyond its context. Reason from the texts and their context; when a common saying is relevant, state precisely what the sources support, with its proper scope, and say where the folk version goes further than they do. Measured, source-anchored phrasing — no boilerplate caveats.
- Well-known background is yours to give too: e.g. Shoghi Effendi translated Gleanings, The Hidden Words, the Kitáb-i-Íqán and Prayers and Meditations — never doubt such a fact for want of a passage.
- A passage from the House, a scholar, a memoir or a compilation that states a teaching is a SIGNPOST, never the support: source_trace it and cite the primary passage it points to.
- Your own knowledge of LANGUAGE (what an Arabic/Persian/Hebrew word means, other words for the idea, roots, grammar) and well-known general background may go in the brief, marked [own]. Facts about people, events, dates and teachings need a passage (P#) — or a web result (W#), named as such.
- TRANSLATING (Chad 10-23: "when doing a translation, please use CTAI or use existing translation text to inform the translation"): when the reader gives an Arabic/Persian text to translate or read line by line, FIRST look for an existing translation — translation_lookup with the original; if that finds none, write your own rough English of one distinctive sentence and call quotation_candidates with it (it finds published and Phelps' provisional translations in other wordings). Use what exists VERBATIM, in this order: an authorized translation (Shoghi Effendi, the Bahá'í World Centre / Universal House of Justice), then a published one, then Stephen Phelps' provisional rendering (public domain — label it so). Only for lines no translation covers, translate yourself, after rendering_lookup on the key terms so you use Shoghi Effendi's renderings of them; mark those lines "provisional translation by Anís". In the brief, give the existing translation's FULL text with its P#, and say which lines each source covers.
- FINDING THE ORIGINAL of an English translation the library may not hold (10-23 Liliane: a prayer in an older translation; the tablet WAS in the library and was missed): (1) original_lookup and quotation_candidates with its most distinctive sentences; (2) if they do not land, render 2–3 of its most distinctive clauses into the Persian/Arabic the author would have written — 'Abdu'l-Bahá's prayers are mostly Persian; names and pairs survive translation ("the Turks … the Persians" = ترک … تاجیک, "the East … embrace the West" = شرق دست در آغوش غرب) — and combined_search each; (3) the moment ANY passage shows original wording that matches — a tablet, or a memoir or compilation quoting it — call translation_lookup with that exact original line: it finds the library's own tablet (Phelps' inventory, PI number) and its translations. Confirm by reading the candidate whole: the right tablet matches the English line after line, not one shared image. A closing "‘Ayn ‘Ayn" (ع ع) is 'Abdu'l-Bahá's signature.
- When you name candidate words (other Arabic/Persian words for an idea), check each in rendering_lookup, in Arabic script, so the brief can say how Shoghi Effendi rendered them.
- Earlier replies in the conversation are context, not something to audit: never review or correct them unless the reader questions them (you cannot see how an earlier chart or count was built — 10-19 three "corrections" of Lal's chart were all false). If the reader does question one, say precisely what was wrong, with the passage.
- An empty tool result means only that this lookup found nothing — never treat it as evidence, and never disown or "correct" an earlier reply unless a passage shows it was wrong.
- Never conclude "nothing found" while a reasonable search is untried. If the library truly lacks something, say what it does have that helps.
- A FOLLOW-UP that disputes, narrows or asks for the evidence is a new question: search for what it asks now (11-04: a brief written from the earlier reply alone, with no search, told the reader nothing settled it).
- WHAT THE TEACHINGS SAY ON A SOCIAL OR LEGAL MATTER (taxation, consultation, work, wealth, punishment, marriage, the arts…): search the Writings of Bahá'u'lláh, the Báb and 'Abdu'l-Bahá first, in the words a tablet would use (the matter's own terms and its older names), then Shoghi Effendi; the Writings in their original Persian and Arabic too (every Bahá'í search brings the closest originals, each marked ORIGINAL with its linked translation or none; originals_search for more, in English or in the original words); talks and pilgrims' notes after them, as REPORTED SPEECH; commentary last, only as a signpost. Each passage head carries its standing (WRITINGS, SHOGHI EFFENDI, REPORTED SPEECH, UNIVERSAL HOUSE OF JUSTICE, SECONDARY). In the brief, put what the passages DO say first, each point with its standing (for an ORIGINAL, the P# of its linked translation or "no linked translation — provisional"), then list the sub-questions they leave open as "Open: …".
- Never propose a search for the reader to approve: if one is worth running, run it now.
When done, reply with no tool call, in exactly this form:
BRIEF:
Reaching for: <one line>
- <a point of the answer, with its support: P#, W# or [own]>
- <…>
Thread to pull: <one line>
KEEP: <the refs the reply should quote or cite, e.g. P2, P5 — only those that carry a point>`;

// a cut ends at a sentence (else a word) and says the text goes on — never mid-word (prompt.js headOf)
const clipText = (t, n) => headOf(String(t || '').replace(/\s+/g, ' ').trim(), n);
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

/** The researcher's closing message → { brief, keep: ['P2', …] }. Pure. */
export function parseBrief(text) {
  const t = String(text || '');
  const keep = (t.match(/^\s*KEEP:\s*(.*)$/im)?.[1] || '').match(/[PW]\d+/gi)?.map((x) => x.toUpperCase()) || [];
  const brief = t.replace(/^\s*KEEP:.*$/im, '').replace(/^\s*BRIEF:\s*/im, '').trim();
  return { brief, keep };
}

/** The library tools behind refs: P# passages, W# web answers, B# works. Shared by research() and the agent (agent.js). */
export function toolRunner(impl, { search: searchName = 'combined_search' } = {}) {
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
      return `[${r}] ${p.title || '?'} — ${p.author || '?'}${p.language && p.language !== 'en' ? ` (${p.language})` : ''}${tier ? ` · ${tier}` : ''}${p.translation ? ` · EXISTING TRANSLATION: ${p.translation}` : ''}${p.note ? ` · ${p.note}` : ''}`; });
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
      const tref = t ? add({ ...t, translation: t.translation || 'translation', title: renderingTitle(t.title || p.title, ref, pick?.t === t ? pick : null) }) : null;
      const o = found.get(ref);
      if (o && !o.note) o.note = tref ? (pick && pick.t === t && !pick.rendering
        ? `ORIGINAL — no translation of this work is linked; its English appears in ${tref}, a ${pick.cls.replace(/-/g, ' ')} copy: quote that verbatim beside this original line and name it as that copy, not as the translation`
        : `ORIGINAL — its linked translation is ${tref}: quote that verbatim beside this original line`)
        : `ORIGINAL — no linked translation: render the key line yourself, marked "provisional translation by Anís", with the original line beside it, linked to this tablet`;
      return [ref, tref];
    }).flat();
  };
  const searchLibrary = async ({ query, tradition: tr, filters }) => {
    const tradition = tr ?? filters?.tradition;
    const early = impl.originals && /bah/i.test(String(tradition || '')) ? impl.originals(query).catch(() => []) : null;
    let hits = (await impl.search(query, tradition)).slice(0, 8);
    if (impl.writings && hits.length !== 0 && bahaiSearch(tradition, hits) && !hasAuthoritative(hits)) {
      const extra = await impl.writings(query).catch(() => []);
      const seen = new Set(hits.map((p) => p.id).filter((x) => x != null));
      hits = [...(extra || []).filter((p) => p.id == null || !seen.has(p.id)).slice(0, 4), ...hits];
    } else if (impl.writings && !hits.length && /bah/i.test(String(tradition || ''))) {
      hits = (await impl.writings(query).catch(() => [])).slice(0, 4);
    }
    const orig = await originalsFor(query, hits, early);
    hits = byTier(hits).slice(0, 10 - orig.length);
    searched.push({ query, docs: hits.map((p) => p.document_id).filter((x) => x != null) });
    const refs = hits.map((p) => add(p));
    return show([...refs, ...(await showOriginals(orig))]);
  };
  // originals_search: the original-language pass alone, as many as it finds (the researcher's own Persian/Arabic or English words)
  const searchOriginals = async ({ query }) => {
    if (!impl.originals) return 'no original-language search here';
    const orig = ((await impl.originals(query).catch(() => [])) || []).filter(isOriginalLanguage).slice(0, 6);
    return orig.length ? show(await showOriginals(orig)) : `no Persian/Arabic Writing found for "${query}" — try the matter's own words in Persian or Arabic`;
  };
  // keyed by canonical tool name (tools.js); a call by an old name resolves through canonical()
  // a copyrighted (encumbered) book is never read around — consecutive paragraphs are not a short excerpt (Chad 10-23)
  // rowsAround → the neighbouring passages, or the copyright notice (a string); readAround also adds them for the model
  const COPYRIGHT = 'this book is under copyright: quote only the excerpt you already have (with its link); its neighbouring paragraphs are not available';
  const rowsAround = async (p, before, after) => {
    const enc = await (impl.encumberedAmong || (await import('../repos/rights-repo.js')).encumberedAmong)([p.document_id]).catch(() => new Set([Number(p.document_id)]));   // fails CLOSED: unknown rights = copyrighted
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
    document_search: async ({ title }) => {
      const w = await (impl.work || (async (t) => (await import('./work-request.js')).findTitled([t])))(title).catch(() => null);
      if (!w) return `no work titled "${title}" in the library`;
      const { workUrl } = await import('../source-links.js');
      // only the best match is the book asked for; the others (chapter files, namesakes) are listed but take no book-step slot
      // (11-03: The Dawn-Breakers + its Chapter X + Chapter I filled all three slots and crowded out the other histories)
      const all = [w.doc, ...w.others], links = impl.work ? null : await (await import('../hit-links.js')).workLinks(all).catch(() => null), urlOf = (x) => links?.get(x.id) ?? workUrl(x);   // the online publisher wins, as for a passage
      return all.map((x, i) => `[${addWork({ ...x, url: urlOf(x), ...(i ? { other: true } : {}) })}] ${x.title}${x.author ? ` — ${x.author}` : ''}${x.encumbered === 1 ? ' (copyrighted: opening pages only)' : ''}\nlink: ${urlOf(x) || 'none (no public page: write the title unlinked)'}`).join('\n\n');
    },
    original_lookup: async ({ english }) => show((await impl.original(english)).map((x) => add(x))),
    translation_lookup: async ({ original }) => {
      const found = impl.translation ? await impl.translation(original) : [];
      if (!found.some((x) => x.translation)) return `no linked translation found from the original wording${found.length ? ` (the original: ${show(found.map((x) => add(x)))})` : ''} — draft an English rendering of one distinctive sentence and call quotation_candidates with it`;
      return show(found.map((x) => add(x)), 4000);
    },
    rendering_lookup: async ({ word }) => {
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
      const r = show((await impl.sourceOf(quotation)).map((x) => add(x)));
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

/**
 * → { passages, brief, steps, ms } or null. passages carry the search shape respond.js expects (text, title, author,
 * source_url, document_id, paragraph_index, religion, collection, language, id, ref).
 */
// A LIVE chat (respond.js liveResearch): one round, no brief — the model asks for everything at once and the writer works
// from the passages (11-03: the 6-round loop + brief put first text at 23-26 s median).
const ONE_ROUND = 'THIS TURN HAS ONE ROUND: a reader is waiting. Ask now, in this one reply, for EVERY tool call the answer needs (they run in parallel; you will not see their results and write no brief) — search the main question and each of its sides or aspects separately, and add a lookup or trace only where the question calls for one. When the answer turns on WHEN things happened (a date, a sequence, a story across months or years), one of your searches asks for the dates themselves — the chronology of those events, in the words a history or a chronology would use — so every event can be dated from a passage.';
const BOOK_STEP = 'After your round, the library is searched again INSIDE the books your searches found, for the passages that tell the story or make the argument. When the answer lies in a particular book or author (a history such as The Dawn-Breakers, a study such as Gate of the Heart), also call document_search for that book, so it is one of them.';

/** The books a one-round research found, for the in-book step: works asked for by title first (with the reader's question; stubs and
 *  lesser title matches skipped),
 *  then each search's documents round-robin by rank (with the query that found it), distinct, at most n. Each book also carries
 *  `queries`: the query that found it, then the round's other searches, then the reader's question — distinct, at most perBook —
 *  so a history is read for every side the round asked about (11-03: one query per book left the story half told). Pure. */
export function booksFound({ works = [], searched = [], question = '', n = 3, perBook = 1 }) {
  const out = [], seen = new Set();
  const all = [...new Set(searched.map((s) => s.query).filter(Boolean))];
  const queriesFor = (first) => [...new Set([first, ...all, question].filter(Boolean))].slice(0, Math.max(1, perBook));
  const take = (id, query) => { const k = Number(id); if (!Number.isFinite(k) || seen.has(k) || out.length >= n) return; seen.add(k); out.push({ document_id: k, query, queries: queriesFor(query) }); };
  for (const w of works) if (!w.other && !(Number(w.paragraph_count) < 10)) take(w.id, question);   // a stub (a catalogue entry, a tag page) is no book; a lesser title match is not the book asked for
  for (let rank = 0; out.length < n && searched.some((s) => rank < s.docs.length); rank++) for (const s of searched) if (rank < s.docs.length) take(s.docs[rank], s.query);
  return out;
}

/** The passages the book step reads AROUND: in each of the first `books` books, its best `hits` from its own query (rank order).
 *  `outs` are the book step's results ({ b, hits, extra }). Pure. */
export function aroundTargets(books = [], outs = [], { books: nb = 1, hits: nh = 1 } = {}) {
  return books.slice(0, nb).flatMap((b) => (outs.find((o) => o.b === b && !o.extra)?.hits || [])
    .filter((p) => p?.document_id != null && p.paragraph_index != null).slice(0, nh));
}

/** BRIDGE reads: two read-around targets in one book that are further apart than one window but within `span` paragraphs mark
 *  the two ends of one stretch of narrative (db-24: the order to leave Iṣfahán at 409, the order to go on to Tabríz at 455 —
 *  Káshán, Qum, Kulayn lie between). Up to two points evenly between them are read too. Positions only, never the words. Pure. */
export function bridgeTargets(targets = [], { span = 0, before = 2, after = 2 } = {}) {
  if (!(span > 0)) return [];
  const win = before + after + 1, out = [];
  const byDoc = new Map();
  for (const p of targets) byDoc.set(p.document_id, [...(byDoc.get(p.document_id) || []), p]);
  for (const [doc, hits] of byDoc) {
    const at = [...new Set(hits.map((p) => Number(p.paragraph_index)))].sort((x, y) => x - y);
    for (let i = 1; i < at.length; i++) {
      const gap = at[i] - at[i - 1];
      if (gap <= win || gap > span) continue;
      const k = Math.min(2, Math.floor(gap / win) - 1) || 1;
      for (let j = 1; j <= k; j++) out.push({ document_id: doc, paragraph_index: at[i - 1] + Math.round((gap * j) / (k + 1)), title: hits[0].title, bridge: true });
    }
  }
  return out;
}

/**
 * THE SOURCE JEV NAMED (search-plan `drawFrom`: the book or author the answer is to be drawn from — "Gate of the Heart",
 * "Saiedi", "Nabíl") → its library documents and passages. Code resolves the name against the LIBRARY, never the user's
 * words: the work by title (document_search) beside a wide search of the name with the question; the documents whose
 * AUTHOR is that name give the author's library names (at most 2: "saiedi", "Nader Saiedi"), and the question is then
 * searched in each author's own works (fused_search filters.author; 11-03: Saiedi's words were never found by topic alone).
 * A title match of a stub (under 10 paragraphs) is not the work. → { works, passages, authors }.
 */
export async function namedSource(name, question, impl, { maxAuthors = 2 } = {}) {
  const nm = String(name || '').trim();
  if (!nm || !(impl?.probe || impl?.search)) return { works: [], passages: [], authors: [], name: nm };
  const r = await resolveSource(nm, question, impl, maxAuthors);
  if (r.works.length || r.authors.length) return r;
  // nothing in the library answers to the whole span: its tail from each later capitalised word, longest first
  // ("According to Gate of the Heart" → "Gate of the Heart"; 11-04 goth-03: the sentence's opening word joined the title)
  for (const tail of nameTails(nm)) {
    const t = await resolveSource(tail, question, impl, maxAuthors);
    if (t.works.length || t.authors.length) return t;
  }
  return r;
}

/** The tails of a name span that start at a later capitalised word, longest first ("According to Gate of the Heart" →
 *  ["Gate of the Heart", "Heart"]). Structure only (capitalisation), never a word list. Pure. */
export function nameTails(name) {
  const w = String(name || '').trim().split(/\s+/);
  return w.map((x, i) => (i > 0 && /^\p{Lu}/u.test(x) ? w.slice(i).join(' ') : null)).filter((t) => t && t.length >= 3);
}

/** Is the title match the work the name names? Its author is the named author, or the name covers the title's main words
 *  ("Gate of the Heart" covers "Gate of the Heart: Understanding…"; "Nabíl" does not cover "Nabil's Narrative"). Pure. */
export function namesTheWork(name, doc, authors = []) {
  if (authors.some((a) => fold(a) === fold(doc?.author))) return true;
  const nw = fold(name).split(' ').filter((w) => w.length > 2);
  const tw = fold(mainKey(doc?.title || '')).split(' ').filter((w) => w.length > 2);
  return !!tw.length && tw.every((t) => nw.some((n) => n === t || (n.length >= 5 && t.length >= 5 && (n.startsWith(t) || t.startsWith(n)))));
}

async function resolveSource(nm, question, impl, maxAuthors) {
  const [w, hits] = await Promise.all([
    impl.work ? impl.work(nm).catch(() => null) : null,
    (impl.probe || impl.search)(`${nm} ${question}`.slice(0, 400)).catch(() => []),
  ]);
  // the named author is the passage's writer OR its book's author: a quotation inside Saiedi's book carries the Báb as its
  // voice and Saiedi as book_author (11-04 goth-05: every Gate of the Heart hit was a quotation, so "Saiedi" matched no one)
  const authors = [...new Set((hits || []).flatMap((p) => [p.author, p.book_author]).filter((a) => a && authorMatch(nm, a) === true))].slice(0, maxAuthors);
  const byNamed = (p) => authors.includes(p.author) || authors.includes(p.book_author);
  // a title match is the work only when it is not a stub (< 10 paragraphs) and, when the name is an author's, it is that
  // author's or the name covers its title (11-04 db-32: "Nabíl" matched the title "Nabil's Narrative", another writer's 408
  // paragraphs, which then led the in-book step and its read-around instead of The Dawn-Breakers)
  const titled = w?.doc?.id != null && !(Number(w.doc.paragraph_count) < 10) ? w.doc : null;
  const works = titled && (!authors.length || namesTheWork(nm, titled, authors)) ? [titled] : [];
  const own = impl.searchBy ? await Promise.all(authors.map((a) => impl.searchBy(question, a).catch(() => []))) : [];
  const isWork = (p) => works.some((x) => Number(x.id) === Number(p.document_id));
  const passages = [...(hits || []).filter((p) => byNamed(p) || isWork(p)), ...own.flat()];
  for (const [i, a] of authors.entries()) {
    const top = own[i]?.[0] || (hits || []).find((p) => p.author === a || p.book_author === a);
    if (top?.document_id != null && !isWork(top)) works.push({ id: Number(top.document_id), title: top.title, author: a });
  }
  // the lesser title match stays listed after the author's works, never searched inside (booksFound skips `other`)
  if (titled && !works.some((x) => Number(x.id) === Number(titled.id))) works.push({ ...titled, other: true });
  return { works, passages, authors, name: nm };
}

export async function research({ messages, create, tools: impl, maxRounds = 6, maxCalls = 10, brief: wantBrief = true, inBooks = 0, perBook = 1, extraMs = Infinity, drawFrom = null, around = null, subject = null, narrate = null }) {
  const t0 = Date.now();
  const { found, works, searched, run, add, addWork, rowsAround } = toolRunner(impl);
  // spec #5 (11-06): the first round's library search must carry Jev's subject (query-anchor.js) — code checks, never intent
  const subj = subjectOr(subject, messages);
  let anchored = false;
  // the source Jev named is resolved BESIDE the planning round (no added wait); its passages and works join before the book step
  const userQ = clipText([...messages].reverse().find((m) => m.role === 'user')?.content, 300);
  const sourceP = drawFrom ? namedSource(drawFrom, userQ, impl).catch((err) => { log.warn({ drawFrom, err: String(err?.message).slice(0, 160) }, 'named source failed'); return null; }) : null;
  const convo = messages.slice(-7).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clipText(m.content, 3000) }));
  const msgs = [{ role: 'system', content: wantBrief ? RESEARCH_SYSTEM : `${RESEARCH_SYSTEM}\n\n${ONE_ROUND}${inBooks && impl.searchIn ? ` ${BOOK_STEP}` : ''}` }, ...convo];
  const steps = [];
  let calls = 0, final = '';
  for (let round = 0; round < maxRounds; round++) {
    if (round > 0) narrate?.('research.round');   // humanized status on a live channel (narrate.js); a no-op elsewhere
    // without a brief every round may call tools (the last one too); with one, the last round writes it
    const last = wantBrief && (round === maxRounds - 1 || calls >= maxCalls);
    // one retry for a timed-out or dropped round; the failure says which round and how long (10-19: bare "Request timed out")
    // a live ONE-ROUND research (no brief) exists only to gather passages: the round must call the library (p7 db-26: Haiku answered
    // from memory with no call, 1 of 37, and the turn fell back to a 1,000-character "fact" reply)
    // the FIRST round must search too (11-04 mail-1403: a disputing follow-up on taxation got a brief written from memory with
    // zero calls, and the letter said the search found nothing settling it); later rounds may stop and write
    const ask = () => create({ messages: msgs, ...(last ? {} : { tools: TOOLS, tool_choice: round === 0 || (!wantBrief && maxRounds === 1) ? 'required' : 'auto' }), max_tokens: 4000 });
    let r;
    try { r = await ask(); } catch (err) {
      log.warn({ round, calls, ms: Date.now() - t0, err: String(err?.message).slice(0, 160) }, 'research round failed — retrying once');
      try { r = await ask(); } catch (err2) { throw Object.assign(new Error(`round ${round} after ${Date.now() - t0} ms: ${err2?.message}`), { cause: err2 }); }
    }
    const m = r?.choices?.[0]?.message || {};
    let tcs = (m.tool_calls || []).slice(0, Math.max(0, maxCalls - calls));
    if (!tcs.length) { final = String(m.content || ''); break; }
    let rebuilt = null;
    if (!anchored && hasSearch(tcs)) { anchored = true; ({ tcs, rebuilt } = anchorToolCalls(tcs, subj)); }
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: tcs });
    // a round's calls run IN PARALLEL (11-03: one by one, three searches and a trace cost 6-15 s). P# refs are numbered as
    // the tools return; the steps and tool messages keep the model's order.
    calls += tcs.length;
    const outs = await Promise.all(tcs.map(async (tc) => {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* bad args → empty */ }
      const fn = run[canon(tc.function?.name)];
      const step = { trace: { ...(currentAIContext().trace || {}), step: canon(tc.function?.name) || tc.function?.name } };   // search_trace.step
      const out = fn ? await withAIContext(step, () => fn(args)).catch((err) => `tool failed: ${String(err.message).slice(0, 160)}`) : 'unknown tool';
      return { tc, args, out };
    }));
    for (const [i, { tc, args, out }] of outs.entries()) {
      // originals: how many of the passages it showed are Arabic/Persian (the battery's originals check reads this, never the reply)
      const originals = (String(out).match(ORIGINAL_HEAD) || []).length;
      steps.push({ tool: tc.function?.name, args, found: (String(out).match(/^\[[PW]\d+\]/gm) || []).length, ...(originals ? { originals } : {}), ...(rebuilt?.index === i ? { rebuilt_from: rebuilt.from } : {}) });
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: clipText(out, TOOL_CHARS) });
    }
    if (!wantBrief && (round === maxRounds - 1 || calls >= maxCalls)) break;
  }
  const src = sourceP ? await sourceP : null;
  if (src) {
    for (const w of src.works) addWork(w);
    steps.push({ tool: 'named_source', args: { name: drawFrom, ...(src.name && src.name !== drawFrom ? { resolved: src.name } : {}), authors: src.authors, works: src.works.filter((w) => !w.other).map((w) => w.id) }, found: src.passages.map((p) => add(p)).filter(Boolean).length });
  }
  if (!wantBrief && inBooks && impl.searchIn) {
    // the BOOK STEP (coordinator 11-03): code, no model call — each top book searched with the query that found it, in parallel
    // (the named source's works come first: booksFound takes works before searched documents)
    const question = userQ;
    const books = booksFound({ works: [...(src?.works || []), ...works.values()], searched, question, n: inBooks, perBook });
    if (books.length) {
      const title = [...(src?.works || []), ...works.values()].find((w) => Number(w.id) === books[0].document_id)?.title;
      narrate?.(title ? 'research.reading' : 'research.reading_more', { book: title });
    }
    // every (book × query) pair at once: the fan-out widens the evidence without another model round. Each book's own query is
    // awaited (as before the fan-out); the extra queries get at most extraMs beyond those, and a late one costs only its passages
    // (11-03 smoke: 9 searches at once ran 2.5-5.8 s on a loaded tower and doubled the first text)
    const pairs = books.flatMap((b) => b.queries.map((q, i) => ({ b, q, extra: i > 0 })));
    const one = ({ b, q }) => impl.searchIn(q, b.document_id).catch((err) => {
      log.warn({ document_id: b.document_id, err: String(err?.message).slice(0, 160) }, 'in-book search failed'); return []; });
    const started = pairs.map((x) => ({ ...x, p: one(x) }));
    const own = await Promise.all(started.filter((x) => !x.extra).map(async (x) => ({ ...x, hits: await x.p })));
    // READ AROUND (coordinator 11-03): the main books' best hits are read with their neighbours (context_lookup), so the writer
    // has the consecutive passages of the story, not single paragraphs (db-24: Nabíl's hit was the order to go on to Tabríz;
    // the towns before it, Káshán, Qum, Kinár-Gird, Kulayn, never reached the writer), plus up to two BRIDGE reads between two
    // hits of one book (bridgeTargets). Code, no model call; started as soon as the books' own searches are back, so the reads
    // run beside the extra queries; a read past `around.ms` is dropped. A copyrighted book is never read around (rowsAround).
    const targets = around && impl.around ? (() => { const best = aroundTargets(books, own, around); return [...best, ...bridgeTargets(best, around)]; })() : [];
    let t2;
    const cut = targets.length && Number.isFinite(around.ms) ? new Promise((r) => { t2 = setTimeout(() => r('late'), around.ms); }) : null;
    const readsP = Promise.all(targets.map(async (p) => {
      const read = rowsAround(p, around.before ?? 2, around.after ?? 2).catch((err) => `tool failed: ${String(err?.message).slice(0, 160)}`);
      return { p, out: cut ? await Promise.race([read, cut]) : await read };
    }));
    let timer;
    const late = Number.isFinite(extraMs) ? new Promise((r) => { timer = setTimeout(() => r('late'), extraMs); }) : null;
    const outs = await Promise.all(started.map(async (x) => {
      const hits = x.extra && late ? await Promise.race([x.p, late]) : await x.p;
      return { ...x, hits: hits === 'late' ? [] : hits, late: hits === 'late' };
    }));
    clearTimeout(timer);
    if (outs.some((o) => o.late)) log.info({ late: outs.filter((o) => o.late).length, extraMs }, 'in-book extra searches past the budget');
    for (const { b, q, hits, late } of outs) steps.push({ tool: 'in_book_search', args: { document_id: b.document_id, query: q }, ...(late ? { late: true } : {}), found: (hits || []).map((p) => add(p)).filter(Boolean).length });
    // the reads join after the in-book hits (passage order unchanged); a bridge point is a position, never itself a passage
    const reads = await readsP;
    clearTimeout(t2);
    for (const { p, out } of reads) {
      if (!p.bridge) add(p);
      const rows = Array.isArray(out) ? out.map((x) => add(x)).filter(Boolean) : [];
      steps.push({ tool: 'context_lookup', args: { document_id: p.document_id, paragraph_index: p.paragraph_index, ...(p.bridge ? { bridge: true } : {}) }, ...(out === 'late' ? { late: true } : {}), found: rows.length });
    }
  }
  if (!wantBrief) {
    log.info({ steps: steps.map((s) => `${s.tool}:${s.found}`), found: found.size, ms: Date.now() - t0 }, 'researched (one round)');
    return found.size ? { passages: [...found.values()], brief: null, steps, ms: Date.now() - t0 } : null;
  }
  const { brief, keep } = parseBrief(final);
  // the reply's evidence: what the researcher kept, else everything it found (in order)
  const kept = (keep.length ? keep : [...found.keys()]).map((r) => found.get(r)).filter(Boolean);
  log.info({ steps: steps.map((s) => `${s.tool}:${s.found}`), found: found.size, kept: kept.length, ms: Date.now() - t0 }, 'researched');
  if (!brief) return null;
  // a brief with no evidence behind it is not research: the routed pipeline answers instead (11-04 mail-1403: steps [], the
  // letter written from an empty evidence set said nothing was found)
  if (!found.size) { log.warn({ steps: steps.length, ms: Date.now() - t0 }, 'research brief without passages — not used'); return null; }
  return { passages: kept, brief, steps, ms: Date.now() - t0 };
}

export const RESEARCH_HOW = (brief) => `Write the reply from this research brief — it says what the person is reaching for and what the answer holds. Give the substance generously: every point of the brief. A study question gets a full, organised answer — a short bold lead for each part, several quoted passages, the distinctions that matter, and specifics (names, dates, references); a quick question gets a direct answer first. When the reader asks for a table, a list or a programme, give exactly that; quote the passages that carry it (exact words, linked as the house style says). A point marked [own] is your knowledge of the language or general background — say it plainly as a scholar friend would, without a source. A point from W# is from the web: name it as such, never as scripture. Never comment on, review or correct your earlier replies unless the reader questioned them — and then only precisely, with the passage. Never write the brief's markers (P#, W#, [own]) — they are notes to you. TRANSLATIONS: a passage marked EXISTING TRANSLATION is quoted verbatim, never re-translated; only lines it does not cover are your own (the brief says which). A passage marked ORIGINAL (a Persian or Arabic Writing): quote its key line in its own script with the English beside it — its existing translation verbatim when one is given, else your own short rendering marked "provisional translation by Anís" — and link the tablet (with its PI number when the brief gives one). Give what the passages DO say first, quoted and cited at their standing (REPORTED SPEECH is a talk or recollection — "in a talk recorded in…"; SECONDARY is commentary, never the support); then, for each sub-question the brief marks Open, one plain sentence that the texts here do not settle it. Never write that nothing was found while the brief gives passages. Well-known background is fine to state (Shoghi Effendi translated Gleanings, The Hidden Words, the Kitáb-i-Íqán). End with the thread to pull, as an invitation to read — never an offer to search ("if you like, I can search…"): the research is done — no summary, no remarks about sources or authority.\n\nBRIEF:\n${brief}`;

/** An EXACT quotation: a quoted run of 6+ words, or a bare 9+ word sentence that is not framed as a keyword/paraphrase ask. Pure (Chad 11-02: "religion science two wings bird quote" is inexact). */
export const isExactQuote = (text) => { const t = String(text || '').trim(), q = [...t.matchAll(/[“"«]([^”"»]+)[”"»]/g)].some((m) => m[1].trim().split(/\s+/).length >= 6);
  return q || (t.split(/\s+/).length >= 9 && !/\b(quote|saying|something like|kind of|about|paraphrase|gist)\b/i.test(t)); };
/** The reader asked for the original / tablet / Persian / Arabic / Inventory — otherwise the original is not volunteered (Chad 11-02: going to source can disconcert). Pure. */
export const asksForOriginal = (text) => /\b(in (the )?(original|persian|farsi|arabic)\b|(persian|arabic|farsi|original)[- ](word|words|phrase|text|wording|version|language|tablet)|what (is|are|was) the (persian|arabic|original)|original[- ]language|source tablet|which tablet|phelps|inventory)/i.test(String(text || ''));

/** The live tools over the library (the API process): toolRunner's impl, each a call into the tools.js registry (tools.run →
 *  its JSON), unwrapped here for the formatter. The search is combined_search, or fused_search when a fastSearch is given (the agent). */
export function libraryTools({ search, fastSearch, sourceHunt: hunt }) {
  const shape = toPassage;
  const ctx = { search, fastSearch, sourceHunt: hunt };
  const passages = async (name, input) => (await runTool(name, input, ctx)).passages;
  return withDeadlines({
    search: async (query, tradition) => (fastSearch ? await passages('fused_search', { query, ...(tradition ? { filters: { tradition } } : {}) }) : (await combinedSearch({ query, ...(tradition ? { tradition } : {}) }, ctx)).passages)
      .filter((p) => String(p.text || '').length <= 8000).map(shape),
    // inside one book: the query as written, no planner (the book IS the scope) — research's book step
    searchIn: async (query, documentId) => (await passages('fused_search', { query, limit: 5, filters: { documentId: Number(documentId) } }))
      .filter((p) => String(p.text || '').length <= 8000).map(shape),
    // a wide plain search (namedSource's probe for the named author's documents)
    probe: async (query) => (await passages('fused_search', { query, limit: 20 })).map(shape),
    // inside one author's works (namedSource): the author's library name as the filter
    searchBy: async (query, author) => (await passages('fused_search', { query, limit: 6, filters: { author } }))
      .filter((p) => String(p.text || '').length <= 8000).map(shape),
    // the authoritative written tier alone: the Báb, Bahá'u'lláh, 'Abdu'l-Bahá and Shoghi Effendi as WRITERS (searchLibrary)
    writings: async (query) => (await passages('fused_search', { query, limit: 6, filters: { tradition: "Baha'i", author: DOCTRINAL_KEYS, writerOnly: true } }))
      .filter((p) => String(p.text || '').length <= 8000).map(shape),
    // the original-language Writings (the per-language quota and originals_search): the same words, held to the ar-fa group
    // a hit's own inline English (content translation_text) arrives in `translation`, which the formatter reads as a LABEL:
    // keep it as `english` (shown as the original's translation when no aligned one is linked), never as a label
    originals: async (query) => (await passages('originals_search', { query }))
      .filter((p) => String(p.text || '').length <= 8000).map(shape)
      .map((p) => (String(p.translation || '').length > 80 ? { ...p, translation: null, english: p.translation } : p)),
    // each original's linked English translations (content_alignment), best first: id → [Passage + translation label]
    translationsOf: async (ids) => {
      const links = await (await import('../passage-links.js')).resolveLinks(ids, { quotedBy: false });
      return new Map([...links].map(([id, l]) => [id, (l.translations || []).filter((t) => !/^(ar|fa)/i.test(String(t.language || '')))
        .map((t) => ({ ...shape(t), translation: translationLabel(t.translated_by, t.translation_authority) }))]));
    },
    // a work by its title (document_search) → { doc, others } (toolRunner's and namedSource's shape)
    work: async (title) => { const r = await runTool('document_search', { title }, ctx); return r?.works?.length ? { doc: r.works[0], others: r.works.slice(1) } : null; },
    // the found passage's own title/author/religion label its neighbours (ctx.meta), as before
    around: async (p, before, after) => (await runTool('context_lookup', { document_id: p.document_id, paragraph_index: Number(p.paragraph_index) || 0, before, after },
      { ...ctx, meta: { title: p.title, author: p.author, religion: p.religion } })).passages,
    original: (english) => passages('original_lookup', { english }),
    translation: (original) => passages('translation_lookup', { original }),
    wordStudy: async (word) => {
      // the lookup takes Arabic script; a Latin spelling is turned into Arabic here (a model step of the researcher, not the tool's)
      const term = (await (await import('./judges.js')).termScript(word).catch(() => null))?.term_arabic;
      if (!term) return null;
      const s = await runTool('rendering_lookup', { term_arabic: term }, ctx);
      if (!s.found) return null;
      const bars = (s.renderings || []).map((x) => `${x.en} ${x.count}`).join(' · ');
      // say WHAT the counts are (10-19 audit: root-wide counts were presented as the phrase's)
      const of = s.counted ? `in ${s.counted} aligned passages` : 'across all words of the root';
      const root = s.counted && s.root_renderings?.length ? ` · CTAI's ROOT-LEVEL counts (every word of the root, a different measure): ${s.root_renderings.map((x) => `${x.en} ${x.count}`).join(' · ')}` : '';
      return { summary: `Word ${s.term}${s.transliteration ? ` (${s.transliteration})` : ''}${s.root ? `, root ${s.root}` : ''}${s.meaning ? ` — ${s.meaning}` : ''}. Shoghi Effendi's renderings ${of}: ${bars || 'n/a'}${root}${s.research_url ? ` · all renderings: ${s.research_url}` : ''}`,
        passages: s.passages };
    },
    trace: (p) => passages('source_trace', { paragraph_id: p.id, text: String(p.text) }),
    // quotation_candidates (the sourcehunt strategy): the origin, the certain original (else the top possible one), up to 3 works quoting it;
    // the original is labelled for the writer, and only offered when the reader quoted exactly (Chad 11-02)
    sourceOf: async (quotation) => {
      const tag = (label) => (isExactQuote(quotation) ? ` (${label})` : ` (${label} — give only if the reader asked for it)`);
      // the tool returns scored candidates only; the holds judgement is this fixed second step (judge.holds, one call): a candidate that does not hold the quoted sentence drops
      const cands = await passages('quotation_candidates', { quotation });
      const judged = (await (await import('./judges.js')).judgeHolds({ quotation, passages: cands }).catch(() => null))?.passages ?? cands;
      return judged.map(({ role, ...p }) => shape({ ...p,
        title: `${p.title}${role === 'original' ? tag('original') : role === 'possible_original' ? tag('possible original') : ''}` }));
    },
    web: async (query) => { const r = await runTool('web_search', { query }, ctx); return r.text ? { text: r.text, citations: r.citations.map((url) => ({ url })) } : null; },
  }, { search: [], probe: [], searchBy: [], writings: [], originals: [], translationsOf: null, work: null, around: [], original: [], translation: [], wordStudy: null });
}

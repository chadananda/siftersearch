// THE RESEARCHER (Chad 10-19: "How do we make Anís into a useful research and study assistant. It seems downright
// reluctant to be helpful" · "I think we have made it too determinative" · "Even Haiku 5.5 might be sufficient for
// planning research"). Regexes used to decide beforehand what kind of question it was and which ONE lookup to run; a
// question between shapes got a generic search and an apology. Here a model plans the research itself, with the
// library's own instruments as tools — search, read around a passage, the original of an English passage, Shoghi
// Effendi's renderings of a word, the source of a quotation, the web — and ends with a BRIEF for the writer. Its
// passages become the reply's evidence, so the quote gate and link rules still hold. Deps injectable (tests).
import { logger } from '../logger.js';
import { withDeadlines } from './deadline.js';
import { run as runTool, llmTools, canonical, toPassage, translationLabel, letterVariants } from './tools.js';
import { authorMatch } from '../dewey/title-index.js';
export { translationLabel, letterVariants };
const log = logger.child ? logger.child({ mod: 'anis-researcher' }) : logger;

// the researcher's tools, by canonical name (tools.js registry); the definitions are generated from the registry's schemas
export const RESEARCH_TOOL_NAMES = ['combined_search', 'context_lookup', 'original_lookup', 'translation_lookup', 'rendering_lookup', 'source_trace', 'quotation_trace', 'document_search', 'web_search'];
export const TOOLS = llmTools(RESEARCH_TOOL_NAMES);

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
- TRANSLATING (Chad 10-23: "when doing a translation, please use CTAI or use existing translation text to inform the translation"): when the reader gives an Arabic/Persian text to translate or read line by line, FIRST look for an existing translation — translation_lookup with the original; if that finds none, write your own rough English of one distinctive sentence and call quotation_trace with it (it finds published and Phelps' provisional translations in other wordings). Use what exists VERBATIM, in this order: an authorized translation (Shoghi Effendi, the Bahá'í World Centre / Universal House of Justice), then a published one, then Stephen Phelps' provisional rendering (public domain — label it so). Only for lines no translation covers, translate yourself, after rendering_lookup on the key terms so you use Shoghi Effendi's renderings of them; mark those lines "provisional translation by Anís". In the brief, give the existing translation's FULL text with its P#, and say which lines each source covers.
- FINDING THE ORIGINAL of an English translation the library may not hold (10-23 Liliane: a prayer in an older translation; the tablet WAS in the library and was missed): (1) original_lookup and quotation_trace with its most distinctive sentences; (2) if they do not land, render 2–3 of its most distinctive clauses into the Persian/Arabic the author would have written — 'Abdu'l-Bahá's prayers are mostly Persian; names and pairs survive translation ("the Turks … the Persians" = ترک … تاجیک, "the East … embrace the West" = شرق دست در آغوش غرب) — and combined_search each; (3) the moment ANY passage shows original wording that matches — a tablet, or a memoir or compilation quoting it — call translation_lookup with that exact original line: it finds the library's own tablet (Phelps' inventory, PI number) and its translations. Confirm by reading the candidate whole: the right tablet matches the English line after line, not one shared image. A closing "‘Ayn ‘Ayn" (ع ع) is 'Abdu'l-Bahá's signature.
- When you name candidate words (other Arabic/Persian words for an idea), check each in rendering_lookup, in Arabic script, so the brief can say how Shoghi Effendi rendered them.
- Earlier replies in the conversation are context, not something to audit: never review or correct them unless the reader questions them (you cannot see how an earlier chart or count was built — 10-19 three "corrections" of Lal's chart were all false). If the reader does question one, say precisely what was wrong, with the passage.
- An empty tool result means only that this lookup found nothing — never treat it as evidence, and never disown or "correct" an earlier reply unless a passage shows it was wrong.
- Never conclude "nothing found" while a reasonable search is untried. If the library truly lacks something, say what it does have that helps.
When done, reply with no tool call, in exactly this form:
BRIEF:
Reaching for: <one line>
- <a point of the answer, with its support: P#, W# or [own]>
- <…>
Thread to pull: <one line>
KEEP: <the refs the reply should quote or cite, e.g. P2, P5 — only those that carry a point>`;

const clipText = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

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
  const show = (refs, n = 900) => refs.filter(Boolean).map((r) => { const p = found.get(r); return `[${r}] ${p.title || '?'} — ${p.author || '?'}${p.language && p.language !== 'en' ? ` (${p.language})` : ''}${p.translation ? ` · EXISTING TRANSLATION: ${p.translation}` : ''}\n${clipText(p.text, p.translation ? Math.max(n, 4000) : n)}`; }).join('\n\n') || '(nothing)';
  const searched = [];   // each search's query and its passages' documents in rank order (research's book step)
  const searchLibrary = async ({ query, tradition }) => {
    const hits = (await impl.search(query, tradition)).slice(0, 8);
    searched.push({ query, docs: hits.map((p) => p.document_id).filter((x) => x != null) });
    return show(hits.map((p) => add(p)));
  };
  // keyed by canonical tool name (tools.js); a call by an old name resolves through canonical()
  // a copyrighted (encumbered) book is never read around — consecutive paragraphs are not a short excerpt (Chad 10-23)
  // rowsAround → the neighbouring passages, or the copyright notice (a string); readAround also adds them for the model
  const COPYRIGHT = 'this book is under copyright: quote only the excerpt you already have (with its link); its neighbouring paragraphs are not available';
  const rowsAround = async (p, before, after) => {
    const enc = await (impl.encumberedAmong || (await import('../repos/rights-repo.js')).encumberedAmong)([p.document_id]).catch(() => new Set());
    if (enc.has(Number(p.document_id))) return COPYRIGHT;
    return impl.around(p, Math.min(5, before), Math.min(5, after));
  };
  const readAround = async (p, before, after) => { const r = await rowsAround(p, before, after); return typeof r === 'string' ? r : show(r.map((x) => add(x))); };
  const run = {
    combined_search: searchLibrary,
    fused_search: searchLibrary,
    context_lookup: async ({ ref, before = 2, after = 2 }) => {
      const p = found.get(String(ref).toUpperCase());
      if (!p?.document_id) return 'unknown ref';
      return readAround(p, before, after);
    },
    document_search: async ({ title }) => {
      const w = await (impl.work || (async (t) => (await import('./work-request.js')).findTitled([t])))(title).catch(() => null);
      if (!w) return `no work titled "${title}" in the library`;
      const { readerUrl } = await import('../source-links.js');
      // only the best match is the book asked for; the others (chapter files, namesakes) are listed but take no book-step slot
      // (11-03: The Dawn-Breakers + its Chapter X + Chapter I filled all three slots and crowded out the other histories)
      return [w.doc, ...w.others].map((x, i) => `[${addWork({ ...x, url: readerUrl(x), ...(i ? { other: true } : {}) })}] ${x.title}${x.author ? ` — ${x.author}` : ''}${x.encumbered === 1 ? ' (copyrighted: opening pages only)' : ''}\nlink: ${readerUrl(x)}`).join('\n\n');
    },
    original_lookup: async ({ english }) => show((await impl.original(english)).map((x) => add(x))),
    translation_lookup: async ({ original }) => {
      const found = impl.translation ? await impl.translation(original) : [];
      if (!found.some((x) => x.translation)) return `no linked translation found from the original wording${found.length ? ` (the original: ${show(found.map((x) => add(x)))})` : ''} — draft an English rendering of one distinctive sentence and call quotation_trace with it`;
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
    quotation_trace: async ({ quotation }) => {
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
  if (!nm || !(impl?.probe || impl?.search)) return { works: [], passages: [], authors: [] };
  const [w, hits] = await Promise.all([
    impl.work ? impl.work(nm).catch(() => null) : null,
    (impl.probe || impl.search)(`${nm} ${question}`.slice(0, 400)).catch(() => []),
  ]);
  const works = w?.doc?.id != null && !(Number(w.doc.paragraph_count) < 10) ? [w.doc] : [];
  const authors = [...new Set((hits || []).filter((p) => p.author && authorMatch(nm, p.author) === true).map((p) => p.author))].slice(0, maxAuthors);
  const own = impl.searchBy ? await Promise.all(authors.map((a) => impl.searchBy(question, a).catch(() => []))) : [];
  const isWork = (p) => works.some((x) => Number(x.id) === Number(p.document_id));
  const passages = [...(hits || []).filter((p) => authors.includes(p.author) || isWork(p)), ...own.flat()];
  // each author's best-ranked document joins the works, so the book step reads inside it
  for (const [i, a] of authors.entries()) {
    const top = own[i]?.[0] || hits.find((p) => p.author === a);
    if (top?.document_id != null && !isWork(top)) works.push({ id: Number(top.document_id), title: top.title, author: a });
  }
  return { works, passages, authors };
}

export async function research({ messages, create, tools: impl, maxRounds = 6, maxCalls = 10, brief: wantBrief = true, inBooks = 0, perBook = 1, extraMs = Infinity, drawFrom = null, around = null }) {
  const t0 = Date.now();
  const { found, works, searched, run, add, addWork, rowsAround } = toolRunner(impl);
  // the source Jev named is resolved BESIDE the planning round (no added wait); its passages and works join before the book step
  const userQ = clipText([...messages].reverse().find((m) => m.role === 'user')?.content, 300);
  const sourceP = drawFrom ? namedSource(drawFrom, userQ, impl).catch((err) => { log.warn({ drawFrom, err: String(err?.message).slice(0, 160) }, 'named source failed'); return null; }) : null;
  const convo = messages.slice(-7).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clipText(m.content, 3000) }));
  const msgs = [{ role: 'system', content: wantBrief ? RESEARCH_SYSTEM : `${RESEARCH_SYSTEM}\n\n${ONE_ROUND}${inBooks && impl.searchIn ? ` ${BOOK_STEP}` : ''}` }, ...convo];
  const steps = [];
  let calls = 0, final = '';
  for (let round = 0; round < maxRounds; round++) {
    // without a brief every round may call tools (the last one too); with one, the last round writes it
    const last = wantBrief && (round === maxRounds - 1 || calls >= maxCalls);
    // one retry for a timed-out or dropped round; the failure says which round and how long (10-19: bare "Request timed out")
    const ask = () => create({ messages: msgs, ...(last ? {} : { tools: TOOLS, tool_choice: 'auto' }), max_tokens: 4000 });
    let r;
    try { r = await ask(); } catch (err) {
      log.warn({ round, calls, ms: Date.now() - t0, err: String(err?.message).slice(0, 160) }, 'research round failed — retrying once');
      try { r = await ask(); } catch (err2) { throw Object.assign(new Error(`round ${round} after ${Date.now() - t0} ms: ${err2?.message}`), { cause: err2 }); }
    }
    const m = r?.choices?.[0]?.message || {};
    const tcs = (m.tool_calls || []).slice(0, Math.max(0, maxCalls - calls));
    if (!tcs.length) { final = String(m.content || ''); break; }
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: tcs });
    // a round's calls run IN PARALLEL (11-03: one by one, three searches and a trace cost 6-15 s). P# refs are numbered as
    // the tools return; the steps and tool messages keep the model's order.
    calls += tcs.length;
    const outs = await Promise.all(tcs.map(async (tc) => {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* bad args → empty */ }
      const fn = run[canonical(tc.function?.name)];
      const out = fn ? await fn(args).catch((err) => `tool failed: ${String(err.message).slice(0, 160)}`) : 'unknown tool';
      return { tc, args, out };
    }));
    for (const { tc, args, out } of outs) {
      steps.push({ tool: tc.function?.name, args, found: (String(out).match(/^\[[PW]\d+\]/gm) || []).length });
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: clipText(out, 12000) });
    }
    if (!wantBrief && (round === maxRounds - 1 || calls >= maxCalls)) break;
  }
  const src = sourceP ? await sourceP : null;
  if (src) {
    for (const w of src.works) addWork(w);
    steps.push({ tool: 'named_source', args: { name: drawFrom, authors: src.authors, works: src.works.map((w) => w.id) }, found: src.passages.map((p) => add(p)).filter(Boolean).length });
  }
  if (!wantBrief && inBooks && impl.searchIn) {
    // the BOOK STEP (coordinator 11-03): code, no model call — each top book searched with the query that found it, in parallel
    // (the named source's works come first: booksFound takes works before searched documents)
    const question = userQ;
    const books = booksFound({ works: [...(src?.works || []), ...works.values()], searched, question, n: inBooks, perBook });
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
  return { passages: kept, brief, steps, ms: Date.now() - t0 };
}

export const RESEARCH_HOW = (brief) => `Write the reply from this research brief — it says what the person is reaching for and what the answer holds. Give the substance generously: every point of the brief. A study question gets a full, organised answer — a short bold lead for each part, several quoted passages, the distinctions that matter, and specifics (names, dates, references); a quick question gets a direct answer first. When the reader asks for a table, a list or a programme, give exactly that; quote the passages that carry it (exact words, linked as the house style says). A point marked [own] is your knowledge of the language or general background — say it plainly as a scholar friend would, without a source. A point from W# is from the web: name it as such, never as scripture. Never comment on, review or correct your earlier replies unless the reader questioned them — and then only precisely, with the passage. Never write the brief's markers (P#, W#, [own]) — they are notes to you. TRANSLATIONS: a passage marked EXISTING TRANSLATION is quoted verbatim, never re-translated; only lines it does not cover are your own (the brief says which). Never volunteer what could not be found or confirmed; give what is known. Well-known background is fine to state (Shoghi Effendi translated Gleanings, The Hidden Words, the Kitáb-i-Íqán). End with the thread to pull, as an invitation — no summary, no remarks about sources or authority.\n\nBRIEF:\n${brief}`;

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
    search: async (query, tradition) => (await passages(fastSearch ? 'fused_search' : 'combined_search', { query, ...(tradition ? { tradition } : {}) }))
      .filter((p) => String(p.text || '').length <= 8000).map(shape),
    // inside one book: the query as written, no planner (the book IS the scope) — research's book step
    searchIn: async (query, documentId) => (await passages('fused_search', { query, limit: 5, filters: { documentId: Number(documentId) } }))
      .filter((p) => String(p.text || '').length <= 8000).map(shape),
    // a wide plain search (namedSource's probe for the named author's documents)
    probe: async (query) => (await passages('fused_search', { query, limit: 20 })).map(shape),
    // inside one author's works (namedSource): the author's library name as the filter
    searchBy: async (query, author) => (await passages('fused_search', { query, limit: 6, filters: { author } }))
      .filter((p) => String(p.text || '').length <= 8000).map(shape),
    // a work by its title (document_search) → { doc, others } (toolRunner's and namedSource's shape)
    work: async (title) => { const r = await runTool('document_search', { title }, ctx); return r?.works?.length ? { doc: r.works[0], others: r.works.slice(1) } : null; },
    // the found passage's own title/author/religion label its neighbours (ctx.meta), as before
    around: async (p, before, after) => (await runTool('context_lookup', { document_id: p.document_id, paragraph_index: Number(p.paragraph_index) || 0, before, after },
      { ...ctx, meta: { title: p.title, author: p.author, religion: p.religion } })).passages,
    original: (english) => passages('original_lookup', { english }),
    translation: (original) => passages('translation_lookup', { original }),
    wordStudy: async (word) => {
      const s = await runTool('rendering_lookup', { word }, ctx);
      if (!s.found) return null;
      const bars = (s.renderings || []).map((x) => `${x.en} ${x.count}`).join(' · ');
      // say WHAT the counts are (10-19 audit: root-wide counts were presented as the phrase's)
      const of = s.counted ? `in ${s.counted} aligned passages` : 'across all words of the root';
      const root = s.counted && s.root_renderings?.length ? ` · CTAI's ROOT-LEVEL counts (every word of the root, a different measure): ${s.root_renderings.map((x) => `${x.en} ${x.count}`).join(' · ')}` : '';
      return { summary: `Word ${s.term}${s.transliteration ? ` (${s.transliteration})` : ''}${s.root ? `, root ${s.root}` : ''}${s.meaning ? ` — ${s.meaning}` : ''}. Shoghi Effendi's renderings ${of}: ${bars || 'n/a'}${root}${s.research_url ? ` · all renderings: ${s.research_url}` : ''}`,
        passages: s.passages };
    },
    trace: (p) => passages('source_trace', { paragraph_id: p.id, text: String(p.text) }),
    // quotation_trace (the sourcehunt strategy): the origin, the certain original (else the top possible one), up to 3 works quoting it;
    // the original is labelled for the writer, and only offered when the reader quoted exactly (Chad 11-02)
    sourceOf: async (quotation) => {
      const tag = (label) => (isExactQuote(quotation) ? ` (${label})` : ` (${label} — give only if the reader asked for it)`);
      return (await passages('quotation_trace', { quotation })).map(({ role, ...p }) => shape({ ...p,
        title: `${p.title}${role === 'original' ? tag('original') : role === 'possible_original' ? tag('possible original') : ''}` }));
    },
    web: async (query) => { const r = await runTool('web_search', { query }, ctx); return r.text ? { text: r.text, citations: r.citations.map((url) => ({ url })) } : null; },
  }, { search: [], probe: [], searchBy: [], work: null, around: [], original: [], translation: [], wordStudy: null });
}

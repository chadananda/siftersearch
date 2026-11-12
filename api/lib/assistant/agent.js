// THE AGENT (Chad 11-01: "start with using haiku + tools to answer everything … it hallucinates constantly instead of using
// its library"). One model loop that researches AND writes — no brief handed to a second writer — over the library tools
// (researcher.js toolRunner over the tools.js registry) plus work_notes_lookup (work-notes.json: sourced lines on a core work's importance). Grounding is code's
// job: the model cites only the refs its tools gave it ([[P3]] a passage, [[B1]] a book); renderRefs turns them into links and
// drops any it was not given, and the quote gate removes a sentence quoting words no passage holds. Deps injectable (tests).
import { toolRunner, libraryTools, TOOL_CHARS } from './researcher.js';
import { llmTools, canonical, canonWork, run as runTool, toPassage } from './tools.js';
import { dropUnverified, fixQuoteSpeakers, linkQuotes, markQuotes, restoreElisions } from './quotes.js';
import { dropSearchOffer } from './lint.js';
import { dropPreamble } from './work-request.js';
import { agentSearch } from './agent-search.js';
import { roleReplyCap } from './reply-cap.js';
import { anchorToolCalls, hasSearch, subjectOr } from './query-anchor.js';
import { agentCache, callScope, cachedImpl } from './tool-cache.js';
import { SAME_QUESTION } from './research-cache.js';
import { asPassage, strategyImpl } from './agent-strategies.js';

const clip = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

// the agent's tools, by canonical name (tools.js registry): its search is fused_search (no planner), never combined_search under another name
// the strategies first (Chad 11-12: strategies are the agent's tools, never a front door); the primitives stay beside them for exploration
export const AGENT_TOOL_NAMES = ['research_lookup', 'book_card', 'search_in_work', 'find_passage', 'extract_from_work', 'fused_search', 'originals_search', 'context_lookup', 'whole_lookup', 'original_lookup', 'translation_lookup', 'rendering_lookup', 'source_trace', 'quotation_candidates', 'document_search', 'work_notes_lookup', 'web_search'];
export const AGENT_TOOLS = llmTools(AGENT_TOOL_NAMES);
export { canonWork };

// the agent's marker for "the library does not hold it" (code strips it; language-free); a lacking verdict reached on < MIN_SEARCHES library searches gets one more round
export const NOT_FOUND = '[[NOT_IN_LIBRARY]]', MIN_SEARCHES = 3;
const nudge = (n) => `You have run ${n} library search${n === 1 ? '' : 'es'}. Before the library is said to lack this, run at least ${MIN_SEARCHES} differently worded searches in the right scope, in the words the SOURCE itself would use (a 1910 birth notice says "a daughter was born", not "birth"); a hint the reader gave (an issue, a year) is a scope to search, never a reason to ask back. Search now, then answer.`;

export const AGENT_SYSTEM = `You are Anís, a study companion in a library of the world's sacred texts (above all the Bahá'í Writings, with their originals, history and scholarship). You answer readers in chat.

ANSWER LIKE A SCHOLAR WHO KNOWS THE FIELD AND CHECKS EVERYTHING. Use what you know to decide what the answer is and where the texts say it — then find those texts with the tools and quote them. Every statement about a text, person, event, date, number or teaching carries the ref of a passage that supports it; a claim you cannot find support for is left out or plainly marked as unconfirmed in the library. Never present memory as a source.

RESEARCH BEFORE WRITING. After research_lookup, your first search round should launch several searches at once from different angles (the obvious primary source, Shoghi Effendi's account, the key term, the person's name with the event). Read the results; if the best source is still missing, search again with the words that source would use, or context_lookup the strongest passage. Stop when you hold the passages a well-read Bahá'í scholar would cite — not before.

PERSISTENCE. Before you say the library lacks something, run at least 3 differently worded searches in the right scope, in the words the SOURCE would use (a 1910 birth notice says "a daughter was born", not "birth"). Never ask the reader to narrow the question or name an issue before you have tried; a hint the reader gives ("it's in the 1910 issue") is a scope to search, not a reason to ask back. Only after that, say plainly that the library does not hold it and start that reply with ${NOT_FOUND} (code removes it).

WEB. web_search only when the reader asks for the web or the library is exhausted, always labelled as from the web; never as evidence about what the library's texts say.

CONVERSATION. Answer exactly what was asked and keep the subject of the thread. When the reader argues a point, engage it with sources: agree where the texts agree, push back where they do not. No empty acknowledgements.

TOOLS — use them before answering; call several at once when they are independent:
- research_lookup: FIRST and ALONE (your first round is this one call, before any search), on every new question, restated so it stands alone (a follow-up resolved from the conversation). It returns research already done for that question. When it holds what the answer needs, answer from it (whole_lookup a prayer you will quote) with no more searching; search only for what it does not cover. The "several searches at once" rule starts after it.
- book_card: ONLY when the reader wants the book itself (to read it, to have it). Shows its card; returns [B#].
- search_in_work: anything inside one named work or periodical (Star of the West = all its issues; give years to narrow). Give several differently worded queries; each is searched by exact words and by meaning, merged. Returns [P#] with their place.
- find_passage: the reader quotes or describes a passage; optionally held to a religion, author or work.
- whole_lookup: the WHOLE prayer (or devotional unit) a found passage belongs to — before quoting any prayer for the reader to say.
- extract_from_work: a selection from one whole work ("the prayers in it"). Slow; for selections, not searches.
- document_search: whenever a book, tablet or work is named. It returns [B#] — the library's own copy. Always give it.
- work_notes_lookup: sourced lines on a core work's importance — use beside document_search when the reader asks for or about a book.
- fused_search: passages. Phrase the query in the words the texts would use. When the reader wants one writer's words ("where does 'Abdu'l-Bahá say…"), set author to that writer and leave the name out of the query. Try another wording before concluding anything is missing.
- SOURCE QUESTIONS (a reader gives a quotation, or asks where words come from, who said them, whether they are authentic): call quotation_candidates first, with fused_search on the distinctive phrase in parallel. EXACT quotation (or the reader asks for the original/tablet/Persian/Arabic): answer with the source linked, the original when found, and works that quote it. INEXACT ask (keywords, a paraphrase, "the X quote"): give the MAIN source quoted and linked plus 1–2 similar passages from fused_search, and NO original-language text, Phelps Inventory or tablet detail unless asked; if no published source holds the words, say so plainly — never attribute from memory. Quote the located sentence and its surrounding sentences verbatim, with no "…" inside a quotation (keep the source's own spelling, even a typo); wording variants between copies go in a separate line, never stitched into the quote.
- context_lookup, quotation_candidates (where a quotation comes from), original_lookup, translation_lookup, rendering_lookup, source_trace (a letter or scholar stating a teaching → the primary passages), web_search (last resort; label it as from the web, never as scripture).

WRITING:
- The first sentence gives the obvious answer plainly (who/what/where), as a reader would expect from a knowledgeable friend. No preamble, no "Great question", no "Let me", no "I found", no "Based on the library".
- A broad question about a teaching or practice ("how do Bahá'ís pray", "what happens after death") gets a researched answer: a plain summary of 2–4 sentences, then the 3–5 passages that show where it comes from (each a short quotation with its ref, the Writings first), and an example when one helps (a short prayer, quoted whole). Not one source, not a single sample.
- Otherwise the shortest complete answer; more only on request (follow-up questions are offered under every reply). A short question gets 1–3 sentences; a request for a book gets its link and one or two sourced lines on it; a study question gets the passages that carry it, quoted, and nothing the reader did not ask for.
- Cite with refs: put [[P3]] right after the words that come from passage P3; write a book's name as [[B1]] (code turns it into the linked title). Never write a URL. Never use a ref you were not given.
- A prayer, verse or short tablet the reader will read or recite is quoted WHOLE: call whole_lookup on its ref first (it returns the whole prayer, every paragraph) and quote that. Never add a line you did not read in a passage.
- References for a paper: give the standard reference a scholar would use (DN 16.6.1, Qur'án 2:255, John 3:16, Kitáb-i-Aqdas ¶18) and name the translation/edition when you recognise it from its wording (e.g. "mendicants", "Realized One" = Bhikkhu Sujato, SuttaCentral) — from what you know, said plainly, to be checked against the edition. The library's own locators and missing metadata ("#1.1616", "translator Unknown") are never shown as section numbers or as facts about the work.
- Cite each quotation once, from the edition you quoted. The original-language text (Arabic, Persian) is cited only when the reader asks for the original.
- Quotation marks only around words copied exactly from a passage. Credit a quotation to the passage's writer (a letter written on behalf of Shoghi Effendi is not his own words; an editor's introduction is not the author's).
- Prefer, in order: the Writings of Bahá'u'lláh, the Báb and 'Abdu'l-Bahá; Shoghi Effendi; then compilations; "Uncompiled Published Letters" (or "Uncompiled Letters") only when nothing else holds the words. A recollection of a Central Figure's spoken words (pilgrim notes, a visitor's article) only when no Writing says it, and named as a recollection in a few words. Doctrine rests on the Writings and Shoghi Effendi; the Universal House of Justice speaks with authority on law and administration.
- Readings in the community's sense: "the House" = the Universal House of Justice, "the Master" = 'Abdu'l-Bahá, "the Guardian" = Shoghi Effendi, "the Blessed Beauty" = Bahá'u'lláh, "the Most Holy Book" = the Kitáb-i-Aqdas, "the Nine Year Plan" = 2022–2031.
- When the library does not hold what was asked (after the searches above), say so in one sentence, start with ${NOT_FOUND}, and give what it does hold that helps, with refs. Never fill a gap from memory.
- Never send the reader to another website or catalogue for something the library holds.
- Never end with an offer to search, look up, check or find more: run that lookup now, in this turn; if the library does not hold it, say so plainly in one sentence. No summary, no remarks about your sources or tools.`;

/** [[P3]] / [[P3, P5]] / [[B1]] (single brackets too) → links from what the tools returned; any other ref is dropped. Pure. */
export function renderRefs(text, { found, works }) {
  const G = /\[\[?([PW]\d+(?:\s*[,;]\s*[PW]\d+)*)\]\]?(?!\()/.source;
  let t = String(text || '');
  // "[[P1]] [[P2]]" / "[[P1]], [[P2]]" → "[[P1, P2]]": one citation, never "( (a), (b))" (11-12 prayer across two paragraphs)
  for (let prev = null; prev !== t;) { prev = t; t = t.replace(new RegExp(`${G}\\s*[,;]?\\s*${G}`, 'g'), '[[$1, $2]]'); }
  return t
    .replace(/\(\s*(\[\[?[PW]\d+(?:\s*[,;]\s*[PW]\d+)*\]\]?)\s*\)/g, '$1')   // "([[P1]])" → one pair of parens
    .replace(/\*{0,2}\[\[?(B\d+)\]\]?\*{0,2}(?!\()/g, (m, r) => { const w = works.get(r); return w ? (w.url ? `[*${w.title}*](${w.url})` : `*${w.title}*`) : ''; })
    .replace(/\s*\[\[?((?:[PW]\d+)(?:\s*[,;]\s*[PW]\d+)*)\]\]?(?!\()/g, (m, list) => {
      const seen = new Set();
      const links = list.split(/\s*[,;]\s*/).map((r) => found.get(r)).filter((p) => { const k = p?.document_id ?? p?.source_url; return p?.source_url && !seen.has(k) && seen.add(k); })
        .map((p) => `[${p.web ? 'web: ' : ''}${clip(p.title || 'source', 70)}](${p.source_url})`);
      return links.length ? ` (${links.join('; ')})` : '';
    })
    .replace(/[ \t]+([.,;:!?])/g, '$1');
}

const STATUS = { research_lookup: () => 'Checking earlier research', book_card: (a) => `Finding ${clip(a.title, 60)}`, search_in_work: (a) => `Searching ${clip(a.work, 40)}`, find_passage: (a) => `Finding the passage: ${clip(a.query, 50)}`,
  extract_from_work: (a) => `Reading ${clip(a.work, 40)} for ${clip(a.select, 40)}`, fused_search: (a) => `Searching the library: ${clip(a.query, 60)}`, combined_search: (a) => `Searching the library: ${clip(a.query, 60)}`, document_search: (a) => `Finding ${clip(a.title, 60)}`,
  work_notes_lookup: (a) => `What the sources say about ${clip(a.title, 50)}`, context_lookup: () => 'Reading around a passage', whole_lookup: () => 'Reading the whole prayer', quotation_candidates: () => 'Tracing a quotation',
  original_lookup: () => 'Finding the original', translation_lookup: () => 'Finding a translation', rendering_lookup: (a) => `Word study: ${clip(a.word, 40)}`,
  source_trace: () => 'Tracing to the primary texts', web_search: () => 'Searching the web' };

/**
 * One turn: → { reply, retrieved, citations, steps, usage, timings }. create = OpenAI-compatible chat (roleCreate('anis-agent')).
 * impl = libraryTools({ search }) (+ notes for work_notes_lookup, tests).
 */
// library searches a tool call made (the earned-not-found rule counts them): search_in_work counts each wording
const SEARCHES = { fused_search: () => 1, originals_search: () => 1, find_passage: () => 1, document_search: () => 1, quotation_candidates: () => 1, book_card: () => 1,
  search_in_work: (a) => Math.max(1, (a?.queries || []).length) };
const librarySearches = (steps) => steps.reduce((n, s) => n + (s.deferred ? 0 : SEARCHES[canonical(s.tool)]?.(s.args) || 0), 0);

export async function agentAnswer({ messages, create, tools: raw, onEvent = () => {}, maxRounds = 8, maxCalls = 24, subject = null, cache = null, cardDocs = undefined, frame = null }) {
  const impl = cache ? cachedImpl(raw, cache) : raw;   // data-level cache: refs are per turn, so what is stored is the passages, never the rendered text
  // spec #5 (11-06): the first round's library search must carry Jev's subject (query-anchor.js) — code checks, never intent
  const subj = subjectOr(subject, messages);
  let anchored = false;
  const t0 = Date.now();
  const { found, works, add, addWork, show, run } = toolRunner(impl, { search: 'fused_search' });
  // the strategy tools (agent-strategies.js): their data → refs here; passages they gave are remembered for the cards
  const bookCards = new Map(), fromStrategy = new Set();
  const give = (ps) => ps.map((x) => { const r = add(asPassage(x)); if (r) fromStrategy.add(r); return r; }).filter(Boolean);
  if (impl.bookCard) run.book_card = async (a) => {
    const r = await impl.bookCard(a);
    if (!r) return `no work or section like "${a.title}" in the library — try document_search with another spelling, or fused_search for passages that name it`;
    const b = r.book, ref = addWork({ id: r.kind === 'section' ? `${b.id}:${r.sec?.start_index}` : b.id, title: b.title, author: b.author, url: b.url, religion: r.doc?.religion ?? null });
    bookCards.set(ref, b);
    return `[${ref}] ${b.title}${b.author ? ` — ${b.author}` : ''}${r.kind === 'section' ? ` (a section of ${b.section?.of})` : ''}${b.description ? `\n${clip(b.description, 400)}` : ''}\nThe reader sees its card; write [[${ref}]] where you name it.`;
  };
  if (impl.searchInWork) run.search_in_work = async (a) => {
    const r = await impl.searchInWork(a);
    if (!r) return `no work titled "${a.work}" in the library`;
    if (!r.passages.length) return `nothing in ${r.work.title} for ${(a.queries || []).map((q) => `"${q}"`).join(', ')} (${r.note || r.per_query.map((q) => `${q.exact} exact / ${q.meaning} by meaning`).join('; ')}) — this is the wording, not the end: try the words the source itself would use`;
    return `${r.total} passage${r.total === 1 ? '' : 's'} in ${r.work.title}, exact words and by meaning merged${r.total > 12 ? ' (first 12 shown)' : ''}:\n\n${show(give(r.passages.slice(0, 12)))}`;
  };
  if (impl.findPassage) run.find_passage = async (a) => {
    const r = await impl.findPassage(a);
    if (!r?.passages?.length) return `no passage holds or comes close to "${a.query}"${a.author || a.work || a.religions?.length ? ' in that scope' : ''} — try other wording, or widen the scope`;
    const head = r.mode_used === 'literal' ? `${r.total} passage${r.total === 1 ? '' : 's'} hold those exact words:` : 'No passage holds those exact words; the closest in meaning:';
    return `${head}\n\n${show(give(r.passages.slice(0, 8)))}`;
  };
  if (impl.extractFromWork) run.extract_from_work = async (a) => {
    const r = await impl.extractFromWork(a);
    if (!r?.result?.passages?.length) return `could not select "${a.select}" from "${a.work}" (not found, too large to read whole, or nothing fits) — use search_in_work`;
    return `${r.result.total} picked from ${r.work?.title ?? a.work}, in reading order:\n\n${show(give(r.result.passages))}`;
  };
  // research cache (research-cache.js, Chad 11-12): passages earlier answers to this question used; never a finished reply. Not tool-cached (sets grow).
  let researchQ = null;
  if (raw?.researchLookup) run.research_lookup = async ({ question }) => {
    researchQ = String(question || '').trim() || researchQ;
    const r = await raw.researchLookup(researchQ).catch((err) => { console.warn(`[anis] research lookup failed: ${err.message}`); return null; });
    if (!r?.passages?.length) return 'no research held for this question yet — research it with the tools';
    const same = r.similarity >= SAME_QUESTION;
    if (same && r.question) researchQ = r.question;   // a reworded question grows the set it matched, not a duplicate
    return `${same ? 'research held for this question' : `research held for a RELATED question ("${r.question}")`} (${r.status}): start from these; search further for what they do not cover${same ? '' : ' — this question may need more'}\n\n${show(give(r.passages))}`;
  };
  run.work_notes_lookup = async ({ title }) => {
    const { work, notes } = await runTool('work_notes_lookup', { title }, { notes: impl.notes });
    if (!work) return `no compiled notes for "${title}" — fused_search for passages that name it`;
    if (!notes.length) return `no compiled notes for ${work} — fused_search for passages that name it`;
    return show(notes.slice(0, 5).map((n, i) => add({ id: `note:${work}:${i}`, text: n.quote, title: n.source_title,
      author: n.speaker || n.source_author, source_url: n.url, religion: "Baha'i" })), 600);
  };
  const convo = messages.slice(-9).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clip(m.content, 3000) }));
  const msgs = [{ role: 'system', content: frame ? `${AGENT_SYSTEM}\n\nTHIS CHANNEL'S REPLY FRAME (it governs length and tone; it overrides the lengths above): ${frame}` : AGENT_SYSTEM }, ...convo];
  const steps = [], usage = { in: 0, out: 0 };
  let calls = 0, final = '', firstToolMs = null, nudged = false;
  for (let round = 0; round < maxRounds; round++) {
    const last = round === maxRounds - 1 || calls >= maxCalls;
    const r = await create({ messages: msgs, ...(last ? {} : { tools: AGENT_TOOLS, tool_choice: 'auto' }), max_tokens: roleReplyCap('anis-agent') });   // the reply's safety ceiling, never a length cut (11-04)
    usage.in += r?.usage?.prompt_tokens || 0; usage.out += r?.usage?.completion_tokens || 0;
    const m = r?.choices?.[0]?.message || {};
    let tcs = (m.tool_calls || []).slice(0, Math.max(0, maxCalls - calls));
    if (!tcs.length) {
      final = String(m.content || '');
      // earned not-found: the library "lacks it" (the agent's marker, or searches that found nothing at all) on fewer than MIN_SEARCHES → one more round
      const n = librarySearches(steps);
      if ((final.includes(NOT_FOUND) || (n > 0 && !found.size && !works.size)) && n < MIN_SEARCHES && !nudged && round < maxRounds - 1 && calls < maxCalls) {
        nudged = true;
        msgs.push({ role: 'assistant', content: final.replaceAll(NOT_FOUND, '').trim() || '(no answer yet)' }, { role: 'user', content: nudge(n) });
        continue;
      }
      break;
    }
    let rebuilt = null;
    if (!anchored && hasSearch(tcs)) { anchored = true; ({ tcs, rebuilt } = anchorToolCalls(tcs, subj)); }
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: tcs });
    firstToolMs ??= Date.now() - t0;
    // research_lookup goes first: calls asked beside it wait for it, and when it holds research they are not run (the agent re-asks for what it lacks)
    const li = tcs.length > 1 ? tcs.findIndex((tc) => canonical(tc.function?.name) === 'research_lookup') : -1;
    let heldNow; const held = li < 0 ? null : new Promise((r) => { heldNow = r; });
    // independent calls run together; results go back in the order asked
    const outs = await Promise.all(tcs.map(async (tc, i) => {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* bad args → empty */ }
      const name = tc.function?.name, fn = run[canonical(name)];
      if (held && i !== li && await held) {
        steps.push({ tool: name, args, found: 0, count: 0, ms: 0, cache: 'none', deferred: true });
        return { tc, out: 'not run: research for this question is held (see research_lookup). Answer from it; call this again only for what it does not cover.' };
      }
      onEvent({ type: 'status', text: STATUS[canonical(name)]?.(args) || name });
      const s0 = Date.now();
      const { out, cache: hit } = fn ? await callScope(() => fn(args).catch((err) => `tool failed: ${String(err.message).slice(0, 160)}`)) : { out: 'unknown tool', cache: 'none' };
      if (i === li) heldNow(String(out).startsWith('research held'));
      const n = (String(out).match(/^\[[PWB]\d+\]/gm) || []).length;
      steps.push({ tool: name, args, found: n, count: n, ms: Date.now() - s0, cache: hit, ...(rebuilt?.index === i ? { rebuilt_from: rebuilt.from } : {}) });
      return { tc, out };
    }));
    calls += tcs.length;
    for (const { tc, out } of outs) msgs.push({ role: 'tool', tool_call_id: tc.id, content: clip(out, TOOL_CHARS) });
  }
  final = final.replaceAll(NOT_FOUND, '').trim();
  // code does the grounding: refs → links, unverifiable quotations out, speakers fixed, quotations linked, no preamble
  const retrieved = [...found.values()].map((p) => ({ ...p, citation_url: p.source_url, source_title: p.title, source_author: p.author, doc_id: p.document_id }));
  const rendered = renderRefs(final, { found, works });
  const asked = messages.filter((m) => m.role === 'user').map((m) => String(m.content || ''));
  const whole = restoreElisions(rendered, retrieved, { asked });   // a "…" bridging the passage's own words → its contiguous words (11-04 #161/#138)
  const guarded = dropUnverified(whole.text, retrieved, { asked });
  const speakers = fixQuoteSpeakers(guarded.text, retrieved);
  const linked = linkQuotes(speakers.text, retrieved);
  const offerless = dropSearchOffer(dropPreamble(linked.text).trim());   // the research is his to run, never an offer (11-04 #163)
  const reply = markQuotes(offerless.text, retrieved).text;   // quoted words styled apart (Chad 11-04)
  const citations = [...[...works.values()].map((w) => ({ title: w.title, author: w.author, url: w.url, religion: w.religion, document_id: w.id, paragraph_index: null, text: '' })),
    ...retrieved.map((q) => ({ title: q.source_title, author: q.source_author, url: q.citation_url, religion: q.religion, document_id: q.doc_id, paragraph_index: q.paragraph_index ?? null, text: String(q.text).slice(0, 300) }))]
    .filter((c) => c.url && reply.includes(c.url));
  const cited = retrieved.filter((q) => q.citation_url && reply.includes(q.citation_url));
  const keep = cited.filter((q) => /^\d+$/.test(String(q.id)));
  if (cited.length && !keep.length) console.warn(`[anis] research capture: no paragraph ids among ${cited.length} cited (${cited.slice(0, 3).map((q) => q.id).join(', ')})`);
  if (researchQ && raw?.researchCapture && keep.length) raw.researchCapture(researchQ, keep).catch((err) => console.warn(`[anis] research capture failed: ${err.message}`));   // fire and forget
  // cards from the refs the reply cites (quote-cards.js refCards): one strategy passage → its passage card; a book_card book → its card unless a card already shows that work
  let cards = { passage: null, books: [] };
  if (reply) cards = await import('./quote-cards.js').then((m) => m.refCards({ reply, passages: cited.filter((q) => fromStrategy.has(q.ref)),
    books: [...bookCards].filter(([ref]) => works.get(ref)?.url && reply.includes(works.get(ref).url)).map(([, b]) => b) }, cardDocs ? { docs: cardDocs } : {})).catch(() => cards);
  const tally = steps.reduce((t, x) => ({ ...t, [x.cache]: (t[x.cache] || 0) + 1 }), {});
  return { reply, raw: final, retrieved: cited, citations, steps, usage, cards,
    agent: { steps, searches: librarySearches(steps), nudged, cache: tally, ...(cache ? { store: cache.stats() } : {}) },
    quotes_removed: guarded.removed, quotes_recredited: speakers.fixed || 0, quotes_linked: linked.linked || 0,
    quotes_restored: whole.restored, offers_dropped: offerless.dropped,
    timings: { first_tool_ms: firstToolMs, total_ms: Date.now() - t0 } };
}

/** The live tools for the agent (the API process): the researcher's library tools + the strategies (agent-strategies.js). */
export const agentTools = ({ search, fastSearch } = {}) => {
  const fast = fastSearch || agentSearch();
  // own source on every fused_search (11-12: the Aqdas verse came back credited to a compilation and a parallel-translation copy)
  const ownSource = async (hits) => {
    const os = await import('./own-source.js');
    return (await os.preferOwnWork(hits, { search: os.literalOwnSearch, link: os.linkHits, shape: toPassage })).passages;
  };
  const researchLookup = async (q) => {
    const rc = await import('./research-cache.js');
    const hit = await rc.lookupResearch(q);
    return hit ? { status: hit.set.status, question: hit.set.question, similarity: hit.similarity, passages: await rc.hydrate(hit.set) } : null;
  };
  const researchCapture = async (q, ps) => (await import('./research-cache.js')).captureResearch(q, ps);
  return { ...libraryTools({ search, fastSearch: fast }), ...strategyImpl({ search, fastSearch: fast }), ownSource, researchLookup, researchCapture };
};
export { agentCache };

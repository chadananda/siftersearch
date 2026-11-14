// THE AGENT CORE (Chad 11-01): one model loop that researches AND writes over the library tools; grounding is code's job (refs → links, quote gate,
// no preamble). PURE — no server imports, bundles for a Worker (tests/api/agent-core-pure.test.js). agent.js injects the server pieces. Deps: tool-runner, quotes, lint, query-anchor, tool-cache, tool-defs
import { toolRunner, TOOL_CHARS } from './tool-runner.js';
import { workNotes as workNotesLookup, asPassage, SAME_QUESTION } from './tool-defs.js';
import { createSentenceGate, dropUnverified, fixQuoteSpeakers, linkQuotes, markQuotes, restoreElisions } from './quotes.js';
import { dropSearchOffer } from './lint.js';
import { anchorToolCalls, hasSearch, subjectOr } from './query-anchor.js';
import { callScope, cachedImpl } from './tool-cache.js';
import { expandTemplates } from './widgets/templates.js';

const clip = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

// the agent's tools, by canonical name (tools.js registry): its search is fused_search (no planner), never combined_search under another name
// the strategies first (Chad 11-12: strategies are the agent's tools, never a front door); the primitives stay beside them for exploration
export const AGENT_TOOL_NAMES = ['research_lookup', 'book_card', 'search_in_work', 'find_passage', 'extract_from_work', 'fused_search', 'originals_search', 'context_lookup', 'whole_lookup', 'original_lookup', 'translation_lookup', 'side_by_side_document', 'rendering_lookup', 'source_trace', 'quotation_candidates', 'document_search', 'talk_search', 'work_notes_lookup', 'web_search'];

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
- research_lookup: FIRST and ALONE (your first round is this one call, before any search), on every new question — but NOT when the reader only asks for a book or document (a title alone, "find X"): that is no question; call book_card alone — restated so it stands alone (a follow-up resolved from the conversation) in its canonical form: the plain question with full proper names, diacritics and the subject's own title ("What is the Kitáb-i-Aqdas?" for "what's the Most Holy Book about"; "Who was Shoghi Effendi?" for "who was the Guardian"), no conversational wording — the same question asked in other words must come out the same. It returns research already done for that question. When it holds what the answer needs, answer from it (whole_lookup a prayer you will quote) with no more searching; search only for what it does not cover. The "several searches at once" rule starts after it.
- book_card: when the reader wants the book itself (to read it, to have it), AND whenever the ANSWER is a particular book — "which book…", "the most important…", "where is X explained" (→ the Kitáb-i-Íqán): call it for that one work so the reader sees its card at once. When the reader ASKS FOR a book or document (a title alone — "Iqan" — "find X", "show me X", "where can I read X"), the card IS the answer: write one short line naming it ("Here is [[B1]] by Bahá'u'lláh." — the ref IS the linked title; never type the title beside it), nothing more — not what it is, not its importance, not its contents, no other copies. Answer about the work only what the reader asks, when they ask (Chad 11-13: "Do not preemptively ramble on about something without being asked"). Shows its card; returns [B#]. The same for a talk that is the answer: talk_search shows its card.
- search_in_work: anything inside one named work or periodical (Star of the West = all its issues; give years to narrow). Give several differently worded queries; each is searched by exact words and by meaning, merged. Returns [P#] with their place.
- find_passage: the reader quotes or describes a passage; optionally held to a religion, author or work.
- whole_lookup: the WHOLE prayer (or devotional unit) a found passage belongs to — before quoting any prayer for the reader to say.
- extract_from_work: a selection from one whole work ("the prayers in it"). Slow; for selections, not searches.
- document_search: whenever a book, tablet or work is named. It returns [B#] — the library's own copy. Always give it. Give ONE copy of a work — the best published one — and never mention, count or link any other copy or edition of it (Chad 11-13: "why are we linking to a duplicate?").
- talk_search: a TALK, lecture or recording in the media library, by speaker, topic or title (any spelling). When the reader asks for a talk, answer with the talk — the reader sees its card; write its title in italics (never in quotation marks) and its speaker, no [[ref]], no URL — and no passages unless they ask. Talks are library documents: use this, never document_search, for a recording.
- work_notes_lookup: sourced lines on a core work's importance — only when the reader asks ABOUT a book (its importance, what it is); never when they only ask for it.
- fused_search: passages. Phrase the query in the words the texts would use. When the reader wants one writer's words ("where does 'Abdu'l-Bahá say…"), set author to that writer and leave the name out of the query. Try another wording before concluding anything is missing.
- SOURCE QUESTIONS (a reader gives a quotation, or asks where words come from, who said them, whether they are authentic): call quotation_candidates first, with fused_search on the distinctive phrase in parallel. EXACT quotation (or the reader asks for the original/tablet/Persian/Arabic): answer with the source linked, the original when found, and works that quote it. INEXACT ask (keywords, a paraphrase, "the X quote"): give the MAIN source quoted and linked plus 1–2 similar passages from fused_search, and NO original-language text, Phelps Inventory or tablet detail unless asked; if no published source holds the words, say so plainly — never attribute from memory. Quote the located sentence and its surrounding sentences verbatim, with no "…" inside a quotation (keep the source's own spelling, even a typo); wording variants between copies go in a separate line, never stitched into the quote.
- context_lookup, quotation_candidates (where a quotation comes from), original_lookup, translation_lookup, rendering_lookup, source_trace (a letter or scholar stating a teaching → the primary passages), web_search (last resort; label it as from the web, never as scripture).

WRITING:
- The first sentence gives the obvious answer plainly (who/what/where), as a reader would expect from a knowledgeable friend. No preamble, no "Great question", no "Let me", no "I found", no "Based on the library".
- A broad question about a teaching or practice ("how do Bahá'ís pray", "what happens after death") gets a researched answer: a plain summary of 2–4 sentences, then the 3–5 passages that show where it comes from (each a short quotation with its ref, the Writings first), and an example when one helps (a short prayer, quoted whole). Not one source, not a single sample.
- Replies are short and interesting: a few plain sentences between display cards. Wherever a passage can carry the point, show it as a card rather than write a paragraph — the more cards breaking up the text, the better.
- A question about a person or an event ("who was Ṭáhirih", "tell me about Badasht") is ALWAYS answered in scenes — this is its short form: one opening sentence, then 3–5 scenes in order — who they were, the turning points, the end — each a line {{scene "Conference of Badasht" "1848: the old law is set aside" P4 P5}}: a short title, one line of your own, then the 1–2 passages (from the research held when there is some; the Writings or Shoghi Effendi first — God Passes By, Memorials of the Faithful) that record that moment, shown whole. A sentence or two of yours between scenes at most. Never only a paraphrase with a citation after it.
- Otherwise the shortest complete answer; more only on request (follow-up questions are offered under every reply). A short question gets 1–3 sentences; a request for a book gets its link and one or two sourced lines on it; a study question gets the passages that carry it, quoted, and nothing the reader did not ask for. A follow-up, objection or comparison in a conversation answers that one point: a direct sentence or two, then the 2–3 passages that settle it — never a fresh survey of the topic or of what earlier replies covered.
- A word or vocabulary question (an Arabic or Persian term, a title, a phrase): rendering_lookup on it in Arabic script, then show it at work in one or two passages — the original line and its published English, each with its ref — and say how Shoghi Effendi renders it. Grammar or etymology you add yourself is marked in two words ("my reading"), never a paragraph about your sources. An original is quoted exactly as its passage gives it — never add vowel marks or change a letter; word-by-word glosses go in italics, never in quotation marks.
- Documents and email: when the reader asks for something printed, saved or emailed, write the content itself — the system turns your reply into a PDF and emails it (asking for the address if it has none). Never say you cannot send email or make a document, and never describe the delivery yourself. A heading or label over a passage names what that passage itself says — a passage on fasting is never labelled as one on prayer.
- Speak about the texts, never about your tools: no "the excerpt I can see", "the library does not link", "my search returned". If something was not found, say once, plainly, that you found no such text. Capitalise He/His/Him for Bahá'u'lláh, the Báb and 'Abdu'l-Bahá.
- Cite with refs: put [[P3]] right after the words that come from passage P3; write a book's name as [[B1]] (code turns it into the linked title). Never write a URL. Never use a ref you were not given.
- Display templates, when they help the reader: a line holding only {{quote P3}} shows passage P3 whole as a card (the key passage of an answer; do not also type its words); {{book B1}} shows the book's card where you recommend a work; {{side_by_side P1 P4}} sets an original beside its translation; {{scene "Title" "line" P4 P5}} shows a moment of a story with the passages that record it. Optional — plain prose with refs is always fine.
- A prayer, verse or short tablet the reader will read or recite is quoted WHOLE: call whole_lookup on its ref first (it returns the whole prayer, every paragraph) and quote that. Never add a line you did not read in a passage.
- References for a paper: give the standard reference a scholar would use (DN 16.6.1, Qur'án 2:255, John 3:16, Kitáb-i-Aqdas ¶18) and name the translation/edition when you recognise it from its wording (e.g. "mendicants", "Realized One" = Bhikkhu Sujato, SuttaCentral) — from what you know, said plainly, to be checked against the edition. The library's own locators and missing metadata ("#1.1616", "translator Unknown") are never shown as section numbers or as facts about the work.
- Cite each quotation once, from the edition you quoted.
- A TABLET OR WORK written in Arabic or Persian (or another original language) that the reader asks about: never hide it because it is not in English. Say plainly that the library holds it in its original (name the language) and link that original — call original_lookup or document_search so you hold its own passage or book, and cite it ([[P#]] / [[B#]]: its link opens it on Ocean of Lights). Close with one line offering to read and discuss it with the reader and to prepare a side-by-side document of the original beside the English. With no English translation in the library, say so and still offer to discuss the original. Original-language lines are QUOTED only when the reader asks for the original, or in {{side_by_side}}; the original is always named and linked.
- The reader asks for the side-by-side document: call side_by_side_document on a passage of that work and give its [[B#]] in one sentence.
- Quotation marks only around words copied exactly from a passage. Credit a quotation to the passage's writer (a letter written on behalf of Shoghi Effendi is not his own words; an editor's introduction is not the author's).
- Prefer, in order: the Writings of Bahá'u'lláh, the Báb and 'Abdu'l-Bahá; Shoghi Effendi; then compilations; "Uncompiled Published Letters" (or "Uncompiled Letters") only when nothing else holds the words. A recollection of a Central Figure's spoken words (pilgrim notes, a visitor's article) only when no Writing says it, and named as a recollection in a few words. Doctrine rests on the Writings and Shoghi Effendi; the Universal House of Justice speaks with authority on law and administration.
- Readings in the community's sense: "the House" = the Universal House of Justice, "the Master" = 'Abdu'l-Bahá, "the Guardian" = Shoghi Effendi, "the Blessed Beauty" = Bahá'u'lláh, "the Most Holy Book" = the Kitáb-i-Aqdas, "the Nine Year Plan" = 2022–2031.
- When the library does not hold what was asked (after the searches above), say so in one sentence, start with ${NOT_FOUND}, and give what it does hold that helps, with refs. Never fill a gap from memory.
- Never send the reader to another website or catalogue for something the library holds.
- Never end with an offer to search, look up, check or find more: run that lookup now, in this turn; if the library does not hold it, say so plainly in one sentence. No summary, no remarks about your sources or tools.`;

// a long title loses its trailing parenthetical before any clip ("…Volume XVI (Baha'i Era 130–133, 1973–1976)" was cut to "(Baha'i Era 130–…")
const shortTitle = (t) => (t.length > 70 ? t.replace(/\s*\([^()]*\)\s*$/, '') : t);
/** [[P3]] / [[P3, P5]] / [[B1]] (single brackets too) → links from what the tools returned; any other ref is dropped. Pure. */
export function renderRefs(text, { found, works }) {
  const G = /\[\[?([PW]\d+(?:\s*[,;]\s*[PW]\d+)*)\]\]?(?!\()/.source;
  let t = String(text || '');
  // "[[P1]] [[P2]]" / "[[P1]], [[P2]]" → "[[P1, P2]]": one citation, never "( (a), (b))" (11-12 prayer across two paragraphs)
  for (let prev = null; prev !== t;) { prev = t; t = t.replace(new RegExp(`${G}\\s*[,;]?\\s*${G}`, 'g'), '[[$1, $2]]'); }
  // "*Selections…* [[B1]]": the title written out AND its ref → the ref alone (one linked title, never twice; 11-12 Arabic student)
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [r, w] of works || []) if (w?.title) t = t.replace(new RegExp(`(\\*{1,2}|_)?${esc(w.title)}\\1?\\s*\\(?\\s*\\[\\[?${r}\\]\\]?\\s*\\)?(?!\\()`, 'g'), `[[${r}]]`);
  return t
    .replace(/\(\s*(\[\[?[PW]\d+(?:\s*[,;]\s*[PW]\d+)*\]\]?)\s*\)/g, '$1')   // "([[P1]])" → one pair of parens
    .replace(/\*{0,2}\[\[?(B\d+)\]\]?\*{0,2}(?!\()/g, (m, r) => { const w = works.get(r); return w ? (w.url ? `[*${w.title}*](${w.url})` : `*${w.title}*`) : ''; })
    .replace(/\s*\[\[?((?:[PW]\d+)(?:\s*[,;]\s*[PW]\d+)*)\]\]?(?!\()/g, (m, list) => {
      const seen = new Set();
      const links = list.split(/\s*[,;]\s*/).map((r) => found.get(r)).filter((p) => { const k = p?.document_id ?? p?.source_url; return p?.source_url && !seen.has(k) && seen.add(k); })
        .map((p) => `[${p.web ? 'web: ' : ''}${clip(shortTitle(p.title || 'source'), 70)}](${p.source_url})`);
      return links.length ? ` (${links.join('; ')})` : '';
    })
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    // the same citation twice in a row ("(X). (X)": two refs of one book across a full stop, 11-12 decentralization) → once
    .replace(/(\(\[[^\]\n]+\]\([^)\s]+\)\))([.,;:]?)\s*\1/g, '$1$2')
    // a ref that rendered to nothing inside bold leaves a stray "**" ("**6. Title** **", 11-12 email documents) → dropped
    .replace(/^.*$/gm, (line) => ((line.match(/\*\*/g) || []).length % 2 ? line.replace(/[ \t]+\*\*[ \t]*$/, '') : line).replace(/\*\*[ \t]*\*\*/g, ''));
}

export const STATUS = { research_lookup: () => 'Checking earlier research', book_card: (a) => `Finding ${clip(a.title, 60)}`, search_in_work: (a) => `Searching ${clip(a.work, 40)}`, find_passage: (a) => `Finding the passage: ${clip(a.query, 50)}`,
  extract_from_work: (a) => `Reading ${clip(a.work, 40)} for ${clip(a.select, 40)}`, fused_search: (a) => `Searching the library: ${clip(a.query, 60)}`, combined_search: (a) => `Searching the library: ${clip(a.query, 60)}`, document_search: (a) => `Finding ${clip(a.title, 60)}`, talk_search: (a) => `Finding the talk: ${clip([a.speaker, a.topic, a.title].filter(Boolean).join(' — '), 60)}`,
  work_notes_lookup: (a) => `What the sources say about ${clip(a.title, 50)}`, context_lookup: () => 'Reading around a passage', whole_lookup: () => 'Reading the whole prayer', quotation_candidates: () => 'Tracing a quotation',
  original_lookup: () => 'Finding the original', side_by_side_document: () => 'Preparing the side-by-side document', translation_lookup: () => 'Finding a translation', rendering_lookup: (a) => `Word study: ${clip(a.term_arabic ?? a.word, 40)}`,
  source_trace: () => 'Tracing to the primary texts', web_search: () => 'Searching the web' };

/**
 * One turn: → { reply, retrieved, citations, steps, usage, timings }. create = OpenAI-compatible chat (roleCreate('anis-agent')).
 * impl = libraryTools({ search }) (+ notes for work_notes_lookup, tests).
 */
// library searches a tool call made (the earned-not-found rule counts them): search_in_work counts each wording
const SEARCHES = { fused_search: () => 1, originals_search: () => 1, find_passage: () => 1, document_search: () => 1, talk_search: () => 1, quotation_candidates: () => 1, book_card: () => 1,
  search_in_work: (a) => Math.max(1, (a?.queries || []).length) };
export const librarySearches = (steps, canonical = (n) => n) => steps.reduce((n, s) => n + (s.deferred ? 0 : SEARCHES[canonical(s.tool)]?.(s.args) || 0), 0);

// One model round, streamed when the provider streams (11-12: the reply was seen only after the whole final round, 5–9 s).
// Text reaches onText only once the round has written PREAMBLE chars with no tool call (a short "let me search" before a
// call is never shown); a fake/non-streaming create returns a whole response and nothing streams. Returns the response shape.
const PREAMBLE = 200;
export async function readRound(create, params, onText = null) {
  const r = await create(onText ? { ...params, stream: true } : params);
  if (!r?.[Symbol.asyncIterator]) return r;
  let content = '', sent = 0, usage = null, tooled = false, thinking = null;
  const tcs = [];
  for await (const c of r) {
    if (c?.usage) usage = c.usage;
    if (c?._thinking) thinking = c._thinking;
    const d = c?.choices?.[0]?.delta || {};
    for (const t of d.tool_calls || []) {
      tooled = true;
      const x = (tcs[t.index ?? tcs.length] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
      if (t.id) x.id = t.id;
      if (t.function?.name) x.function.name += t.function.name;
      if (t.function?.arguments) x.function.arguments += t.function.arguments;
    }
    if (d.content) content += d.content;
    if (!tooled && content.length >= PREAMBLE) { onText(content.slice(sent)); sent = content.length; }
  }
  return { choices: [{ message: { content, ...(tcs.length ? { tool_calls: tcs.filter(Boolean) } : {}), ...(thinking ? { _thinking: thinking } : {}) } }], usage, streamed: sent > 0 && !tooled, leaked: sent > 0 && tooled, unsent: content.slice(sent) };
}

// The server pieces are injected (agent.js): toolDefs (the LLM tool schemas), canonical (tool name resolver), workNotes(title, notes) → { work, notes },
// post.dropPreamble, runner (toolRunner with the server fallbacks: rights, title finder, link maps), cards(args, opts) → refCards, maxTokens (reply ceiling). Each defaults to a pure no-op so the core runs in a Worker.
export async function agentAnswer({ messages, create, tools: raw, onEvent = () => {}, maxRounds = 8, maxCalls = 24, subject = null, cache = null, cardDocs = undefined, frame = null,
  toolDefs = [], canonical = (n) => n, held = null, links = (t) => t, workNotes = (title, notes) => workNotesLookup(title, notes || (async () => ({ works: [] }))), post = {}, cards: cardsFn = null, maxTokens = 16000, runner = toolRunner }) {
  const dropPreamble = post.dropPreamble || ((t) => t);
  const impl = cache ? cachedImpl(raw, cache) : raw;   // data-level cache: refs are per turn, so what is stored is the passages, never the rendered text
  // spec #5 (11-06): the first round's library search must carry Jev's subject (query-anchor.js) — code checks, never intent
  const subj = subjectOr(subject, messages);
  let anchored = false;
  const t0 = Date.now();
  const { found, works, add, addWork, show, run } = runner(impl, { search: 'fused_search' });
  // the strategy tools (agent-strategies.js): their data → refs here; passages they gave are remembered for the cards
  const bookCards = new Map(), fromStrategy = new Set();
  const give = (ps) => ps.map((x) => { const r = add(asPassage(x)); if (r) fromStrategy.add(r); return r; }).filter(Boolean);
  if (impl.bookCard) run.book_card = async (a) => {
    const r = await impl.bookCard(a);
    if (!r) return `no work or section like "${a.title}" in the library — try document_search with another spelling, or fused_search for passages that name it`;
    const b = r.book, ref = addWork({ id: r.kind === 'section' ? `${b.id}:${r.sec?.start_index}` : b.id, title: b.title, author: b.author, url: b.url, religion: r.doc?.religion ?? null });
    bookCards.set(ref, b);
    onEvent({ type: 'books', books: [...bookCards.values()].slice(0, 3) });   // the card shows the moment the work is found (Chad 11-13), not after the reply
    return `[${ref}] ${b.title}${b.author ? ` — ${b.author}` : ''}${r.kind === 'section' ? ` (a section of ${b.section?.of})` : ''}${b.description ? `\n${clip(b.description, 400)}` : ''}\nThe reader sees its card; write [[${ref}]] where you name it.`;
  };
  // a talk (media library): its card is shown to the reader (the turn's `talks`); the agent gets the facts, never a ref or a URL to write
  const talks = new Map();
  if (impl.talkSearch) run.talk_search = async (a) => {
    const r = await impl.talkSearch(a);
    const hit = (r?.talks || []).filter((t) => t.matched);
    if (!hit.length) return `no published talk found for ${[a.speaker, a.topic, a.title].filter(Boolean).map((x) => `"${x}"`).join(' / ')}${r?.talks?.length ? `; ${a.speaker} has these talks: ${r.talks.map((t) => `"${t.title}"${t.year ? ` (${t.year})` : ''}`).join('; ')}` : ' — try another wording, or fused_search the transcripts'}`;
    for (const t of hit) talks.set(t.slug, t);
    onEvent({ type: 'talks', talks: [...talks.values()].slice(0, 3) });   // the talk's card shows at once, before the reply is written
    return `${hit.length} talk${hit.length === 1 ? '' : 's'}, best first (the reader sees ${hit.length === 1 ? 'its card' : 'their cards'} with a player; name the talk in italics and its speaker, write no ref, no link, no quotation marks; no passages unless asked):\n${hit.map((t) => `- *${t.title}* — ${t.speaker || 'speaker unknown'}${t.year ? `, ${t.year}` : ''}${t.duration_s ? `, ${Math.round(t.duration_s / 60)} min` : ''}`).join('\n')}`;
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
    return `${same ? `research held for this question (${r.status}): these passages answered it before — answer from them; search only for a point the reader raises that they do not cover` : `research held for an EARLIER question ("${r.question}"; you judge: if it asks the same thing, treat it as this question's research and answer from it; if only related, start from it and search for the rest; if unrelated, ignore it) (${r.status})`}\n\n${show(give(r.passages))}`;   // a hit answers from the held research (11-13: hits re-searched 9–15 tower calls, 15–20 s)
  };
  // research looked up BEFORE the first round (the Worker, on a same-question hit): it rides in the reader's turn, not a tool result —
  // the API holds a reply written after a tool result until it is complete (11-13: first word 5–6 s after research_lookup; in the turn, 0.9 s)
  let heldText = null;
  if (held?.passages?.length) {
    // same: this question's set (grows it). Close but not same: an EARLIER question's set the agent judges; answered with no search → it was the same question
    if (held.same) researchQ = held.question;
    const head = held.same ? `RESEARCH HELD FOR THIS QUESTION (${held.status}): these passages answered it before and hold its quotations — choose the quotes, scenes and cards from them and answer with NO search. Search only if the reader asks for something specific (a named work, date or detail) that none of them holds.`
      : `RESEARCH HELD FOR AN EARLIER QUESTION ("${held.question}", ${held.status}) — you judge: if the reader asks about the same subject in other words (\"tell me about X\" = \"who was X?\"; a casual or misspelt form = the canonical one), it IS this question: answer from these passages with no searching. If it asks something narrower or different, start from them and search only for the rest; if unrelated, ignore them and research.`;
    heldText = `${head} research_lookup is already done this turn — do not call it.\n\n${show(give(held.passages))}`;
  } else if (held?.question) {
    researchQ = held.question;   // the canonical restatement: what this turn's research is saved under
    heldText = 'NO RESEARCH HELD for this question yet — research_lookup is already done this turn; do not call it. Research it with the tools.';
  }
  run.work_notes_lookup = async ({ title }) => {
    const { work, notes } = await workNotes(title, impl.notes);
    if (!work) return `no compiled notes for "${title}" — fused_search for passages that name it`;
    if (!notes.length) return `no compiled notes for ${work} — fused_search for passages that name it`;
    return show(notes.slice(0, 5).map((n, i) => add({ id: `note:${work}:${i}`, text: n.quote, title: n.source_title,
      author: n.speaker || n.source_author, source_url: n.url, religion: "Baha'i" })), 600);
  };
  const convo = messages.slice(-9).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clip(m.content, 3000) }));
  // a turn inside a conversation answers its one new point (11-12: a follow-up objection came back as a 550–700-word survey)
  const followUp = convo.some((m) => m.role === 'assistant') ? `\n\nTHIS TURN CONTINUES A CONVERSATION. The reader has read your earlier replies: answer only the new point, in about 150–250 words — a direct answer, then the 2–3 passages that settle it. Do not repeat or re-survey what earlier replies covered; more is offered under the reply. Never say an earlier reply was cut off, incomplete or wrong unless a passage you hold now shows it.` : '';
  const msgs = [{ role: 'system', content: frame ? `${AGENT_SYSTEM}${followUp}\n\nTHIS CHANNEL'S REPLY FRAME (it governs length and tone; it overrides the lengths above): ${frame}` : `${AGENT_SYSTEM}${followUp}` }, ...convo];
  if (heldText) { const u = msgs.findLastIndex((m) => m.role === 'user'); msgs[u] = { ...msgs[u], content: `${msgs[u].content}\n\n---\n${heldText}` }; }
  const steps = [], usage = { in: 0, out: 0 };
  let calls = 0, final = '', firstToolMs = null, nudged = false, streamed = false;
  // the answering round streams a sentence at a time; only sentences whose quotations are in a passage held are shown
  const asked0 = messages.filter((m) => m.role === 'user').map((m) => String(m.content || ''));
  const held0 = () => [...found.values()].map((p) => ({ ...p, source_title: p.title }));
  let gate = null, live = '';
  const liveWidgets = [];
  const heldNowAll = () => [...found.values()].map((p) => ({ ...p, citation_url: p.source_url, source_title: p.title, source_author: p.author, doc_id: p.document_id }));
  // each released sentence is finished as the final reply is (Chad 11-13 "formatting live"): refs → links, quotations restored,
  // credited, linked and styled, links narrowed, a template → its widget at once (event first, then the text holding its marker)
  // a work the reply cites ([[B#]]) is its answer's book: its card shows as the sentence naming it is released (Chad 11-13
  // "the answer could be a book card"), from the ref the agent wrote — the work found, its cover by doc id
  const shownCards = () => new Set([...bookCards].flatMap(([ref, b]) => [ref, `id:${b.id}`]));   // works whose card already showed (a 'books' event)
  const citedWorkCards = (core) => {
    let added = false;
    for (const [, ref] of String(core).matchAll(/\[\[?(B\d+)\]\]?/g)) {
      const w = works.get(ref);
      if (bookCards.has(ref) || [...bookCards.values()].some((b) => Number(b.id) === Number(w?.id)) || bookCards.size >= 3 || !w?.url || !(Number(w.id) > 0) || String(w.id).includes(':')) continue;
      bookCards.set(ref, { id: Number(w.id), title: w.title, author: w.author ?? null, url: w.url, year: null, description: null,
        cover_url: `https://siftersearch.com/img/covers/${Number(w.id)}` });
      added = true;
    }
    if (added) onEvent({ type: 'books', books: [...bookCards.values()].slice(0, 3) });
  };
  const finishLive = (s) => {
    const [, lead, core, trail] = String(s).match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!core) return s;
    citedWorkCards(core);
    const ret = heldNowAll();
    const t = linkQuotes(fixQuoteSpeakers(restoreElisions(renderRefs(core, { found, works }), ret, { asked: asked0 }).text, ret).text, ret).text;
    const x = expandTemplates(markQuotes(t, ret).text, { found, works, books: bookCards, shown: shownCards() }, { start: liveWidgets.length });
    for (const w of x.widgets) { liveWidgets.push(w); onEvent({ type: 'widget', widget: w }); }
    return lead + links(x.text, ret) + trail;
  };
  const onText = (t) => {
    if (t.includes(NOT_FOUND)) { gate = false; return; }   // a not-found draft may be nudged into another round: never shown
    gate ??= createSentenceGate(held0(), (s) => { const c = finishLive(s); live += c; onEvent({ type: 'text', content: c }); }, { asked: asked0 });
    if (gate) gate.push(t);
  };
  for (let round = 0; round < maxRounds; round++) {
    const last = round === maxRounds - 1 || calls >= maxCalls;
    const r = await readRound(create, { messages: msgs, ...(last ? {} : { tools: toolDefs, tool_choice: 'auto' }), max_tokens: maxTokens, thinking: false }, streamed || gate === false ? null : onText);   // the reply's safety ceiling, never a length cut (11-04); no thinking (11-12: Claude 5 thinks by default — seconds every round)
    usage.in += r?.usage?.prompt_tokens || 0; usage.out += r?.usage?.completion_tokens || 0;
    const m = r?.choices?.[0]?.message || {};
    if (r?.leaked) gate = false;   // text shown before a tool call: the final replay replaces it; nothing more streams
    let tcs = (m.tool_calls || []).slice(0, Math.max(0, maxCalls - calls));
    if (!tcs.length) {
      final = String(m.content || '');
      if (r?.streamed && gate) { if (!final.includes(NOT_FOUND)) gate.push(r.unsent || ''); gate.flush(); streamed = !final.includes(NOT_FOUND); }
      // earned not-found: the library "lacks it" (the agent's marker, or searches that found nothing at all) on fewer than MIN_SEARCHES → one more round
      const n = librarySearches(steps, canonical);
      if ((final.includes(NOT_FOUND) || (n > 0 && !found.size && !works.size)) && n < MIN_SEARCHES && !nudged && round < maxRounds - 1 && calls < maxCalls) {
        nudged = true;
        msgs.push({ role: 'assistant', content: final.replaceAll(NOT_FOUND, '').trim() || '(no answer yet)' }, { role: 'user', content: nudge(n) });
        continue;
      }
      break;
    }
    let rebuilt = null;
    if (!anchored && hasSearch(tcs)) { anchored = true; ({ tcs, rebuilt } = anchorToolCalls(tcs, subj)); }
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: tcs, ...(m._thinking ? { _thinking: m._thinking } : {}) });
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
      const { out, cache: hit, parts } = fn ? await callScope(() => fn(args).catch((err) => `tool failed: ${String(err.message).slice(0, 160)}`)) : { out: 'unknown tool', cache: 'none' };
      if (i === li) heldNow(String(out).startsWith('research held'));
      const n = (String(out).match(/^\[[PWB]\d+\]/gm) || []).length;
      steps.push({ tool: name, args, found: n, count: n, ms: Date.now() - s0, cache: hit, ...(parts && Object.keys(parts).length ? { parts } : {}), ...(rebuilt?.index === i ? { rebuilt_from: rebuilt.from } : {}) });
      return { tc, out };
    }));
    calls += tcs.length;
    for (const { tc, out } of outs) msgs.push({ role: 'tool', tool_call_id: tc.id, content: clip(out, TOOL_CHARS) });
  }
  final = final.replaceAll(NOT_FOUND, '').trim();
  citedWorkCards(final);   // a short reply never streamed: the work it names still gets its card (idempotent after a stream)
  // code does the grounding: refs → links, unverifiable quotations out, speakers fixed, quotations linked, no preamble
  const retrieved = [...found.values()].map((p) => ({ ...p, citation_url: p.source_url, source_title: p.title, source_author: p.author, doc_id: p.document_id }));
  const rendered = renderRefs(final, { found, works });
  const asked = messages.filter((m) => m.role === 'user').map((m) => String(m.content || ''));
  const whole = restoreElisions(rendered, retrieved, { asked });   // a "…" bridging the passage's own words → its contiguous words (11-04 #161/#138)
  const guarded = dropUnverified(whole.text, retrieved, { asked });
  const speakers = fixQuoteSpeakers(guarded.text, retrieved);
  const linked = linkQuotes(speakers.text, retrieved);
  // streamed: the reply IS what the reader watched arrive, finished sentence by sentence (finishLive) — nothing snaps at the end
  const shown = streamed && live.trim() ? live : null;
  const offerless = dropSearchOffer(dropPreamble(shown ?? linked.text).trim());   // the research is his to run, never an offer (11-04 #163)
  // inline templates ({{quote P3}} …) → widget marker + fallback + data, last: the words are the passage's own, never re-grounded (widgets/templates.js)
  const { text: reply, widgets } = shown != null ? { text: offerless.text, widgets: liveWidgets }
    : ((x) => ({ ...x, text: links(x.text, retrieved) }))(expandTemplates(markQuotes(offerless.text, retrieved).text, { found, works, books: bookCards, shown: shownCards() }));   // quoted words styled apart (Chad 11-04)
  const citations = [...[...works.values()].map((w) => ({ title: w.title, author: w.author, url: w.url, religion: w.religion, document_id: w.id, paragraph_index: null, text: '' })),
    ...retrieved.map((q) => ({ title: q.source_title, author: q.source_author, url: q.citation_url, religion: q.religion, document_id: q.doc_id, paragraph_index: q.paragraph_index ?? null, text: String(q.text).slice(0, 300) }))]
    .filter((c) => c.url && reply.includes(c.url));
  const cited = retrieved.filter((q) => q.citation_url && reply.includes(q.citation_url));
  const keep = cited.filter((q) => /^\d+$/.test(String(q.id)));
  if (cited.length && !keep.length) console.warn(`[anis] research capture: no paragraph ids among ${cited.length} cited (${cited.slice(0, 3).map((q) => q.id).join(', ')})`);
  if (held?.passages?.length && !held.same) researchQ = librarySearches(steps, canonical) ? (researchQ || held.asked) : held.question;
  if (researchQ && raw?.researchCapture && keep.length) raw.researchCapture(researchQ, keep).catch((err) => console.warn(`[anis] research capture failed: ${err.message}`));   // fire and forget
  // cards from the refs the reply cites (quote-cards.js refCards): one strategy passage → its passage card; a book_card book → its card unless a card already shows that work
  let cards = { passage: null, books: [] };
  if (reply && cardsFn) cards = await Promise.resolve().then(() => cardsFn({ reply, passages: cited.filter((q) => fromStrategy.has(q.ref)),
    books: [...bookCards].filter(([ref]) => works.get(ref)?.url && reply.includes(works.get(ref).url)).map(([, b]) => b) }, cardDocs ? { docs: cardDocs } : {})).catch(() => cards);
  const tally = steps.reduce((t, x) => ({ ...t, [x.cache]: (t[x.cache] || 0) + 1 }), {});
  return { reply, raw: final, talks: [...talks.values()].slice(0, 3), retrieved: cited, citations, steps, usage, cards, widgets, streamed, widgetsShown: shown != null,
    agent: { steps, searches: librarySearches(steps, canonical), nudged, cache: tally, ...(cache ? { store: cache.stats() } : {}) },
    quotes_removed: guarded.removed, quotes_recredited: speakers.fixed || 0, quotes_linked: linked.linked || 0,
    quotes_restored: whole.restored, offers_dropped: offerless.dropped,
    timings: { first_tool_ms: firstToolMs, total_ms: Date.now() - t0 } };
}

// In-book / quote shaping (Chad 11-10): turns a quote_search result into the reply by CODE (no LLM): 1 hit = the passage quoted + linked
// citation (+ a card), n = count line + passages, meaning = labelled. Deps: quote-search.js (the search + text helpers, re-exported here).
import { SITE } from '../source-links.js';
import { sowCoverUrl, isSowWork, sowIssueIds } from '../sow-links.js';
import { foldText, holdsWords, boldWords, excerptOf, balanceQuotes } from './quote-search.js';
export { foldText, holdsWords, boldWords, excerptOf, balanceQuotes };

// Meaning matches in chat are BRIEF (Chad 11-11, "world order letters?" printed 8 whole paragraphs): the closest 3, each its opening sentences
// up to ~45 words, ending "…" when cut; the link under it opens the whole passage in the book.
const MEANING_SHOW = 3, BRIEF_WORDS = 45;
export function briefExcerpt(text, max = BRIEF_WORDS) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.split(' ').length <= max) return t;
  const sents = t.split(/(?<=[.!?]["”’)\]]*)\s+/u);
  let out = '';
  for (const s of sents) { const next = out ? `${out} ${s}` : s; if (out && next.split(' ').length > max) break; out = next; if (out.split(' ').length >= max) break; }
  const w = out.split(' ');
  return w.length > max + 15 ? `${w.slice(0, max).join(' ').replace(/[,;:—–-]+$/, '')} …` : out.length < t.length ? `${out} …` : out;
}
// the excerpt opens at the sentence that matched (`match`, quote-search bestSentence) when the opening would cut before it (11-11:
// "Five diamonds are worth more than five million stones" was the 4th sentence of the Ellis interview, shown only as its opening)
export function briefAround(text, match, max = BRIEF_WORDS) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const at = match ? t.indexOf(match) : -1;
  if (at <= 0 || briefExcerpt(t, max).replace(/ …$/, '').length >= at + match.length) return balanceQuotes(briefExcerpt(t, max));
  return balanceQuotes(`… ${briefExcerpt(t.slice(at), max)}`);
}
const brief = (r) => r.passages.slice(0, MEANING_SHOW).map((p) => ({ ...p, excerpt: briefAround(p.excerpt, p.match) }));
const closest = (n) => (n === 1 ? 'This passage is' : `These ${n} passages are`);

/** The reply, built by code (no writer): each place as a quoted passage with its linked citation; a count line only when there are several. Pure. */
export function inWorkReply(r, { section = null } = {}) {
  const name = section || r.work.title || 'this work';
  const title = `*${name}*`;
  const q = `“${r.query}”`;
  // each place is the passage itself, quoted, with its citation (the link) under it — no list, no paraphrase (Chad 11-10)
  // a hit in another document of the work (Star of the West: one document per issue) cites ITS issue, not the work's first one (11-12:
  // "v1, i1" labelled a v1 no. 17 link)
  const item = (p) => {
    const own = !section && p.work && r.work.id != null && Number(p.document_id ?? p.doc_id) !== Number(r.work.id) ? p.work : name;
    const cite = p.place ? `*${own}*, ${p.place}` : `*${own}*`;
    const by = p.credit ?? named(p.author) ?? named(r.work.author);
    return `> “${p.excerpt}”\n>\n> — ${by ? `${by}, ` : ''}${p.url ? `[${cite}](${p.url})` : cite}`;
  };
  if (r.mode === 'literal') {
    // one place: the passage is the answer, nothing before it; several: one count line, then each passage
    const more = r.total > r.passages.length ? `\n\nThose are the first ${r.passages.length} of the ${r.total}; ask for the rest and I will continue from there.` : '';
    if (r.total === 1) return item(r.passages[0]);
    return `${r.total} places in ${title} mention ${q}:\n\n${r.passages.map(item).join('\n\n')}${more}`;
  }
  if (r.mode === 'meaning') {
    const top = brief(r);
    return `No passage in ${title} has the exact words ${q}. ${closest(top.length)} the closest to them in meaning:\n\n${top.map(item).join('\n\n')}`;
  }
  return `I searched all of ${title} for ${q}: the words are not in it, and no passage in it comes close in meaning.`;
}

// a placeholder author is no author (11-11: "— Unknown, Star of the West…"): the citation names the issue, never "Unknown"
const named = (a) => (a && !/^(?:unknown|anonymous|n\/?a|none|various|-+|\?+)$/i.test(String(a).trim()) ? a : null);
// WHOSE words the hit is (Chad 11-11: an eyewitness reports 'Abdu'l-Bahá's answer): the paragraph's stored voices (content.authors —
// speaker + quoted, the paragraph-authors job) decide; words inside quotation marks in a paragraph quoting ONE person are that person's,
// "as reported by" the speaker. Pure.
const QUOTED_SPAN = /[“"]([^”"]{3,})[”"]/g;
export function creditOf(p, phrase) {
  const v = p?.voice;
  const speaker = named(v?.speaker) ?? named(p?.author);
  const quoted = (v?.quoted || []).map(named).filter(Boolean);
  if (phrase && p?.text && quoted.length <= 1) {
    const want = foldText(String(phrase).replace(/\*\*/g, ''));
    const inQuote = [...String(p.text).matchAll(QUOTED_SPAN)].some((m) => foldText(m[1]).includes(want));
    // quoted words of a voice the record does not name are never the reporter's own: "reported by" him, not "by" him
    if (inQuote && quoted.length === 1) return speaker && speaker !== quoted[0] ? `${quoted[0]}, as reported by ${speaker}` : quoted[0];
    if (inQuote && speaker) return `reported by ${speaker}`;
  }
  return speaker;
}
/** The shown literal hits' voices from their paragraphs' writer records (one batched read); a failed read leaves the author as it was. */
export async function withVoices(r, deps = {}) {
  const shown = r?.mode === 'literal' ? (r.passages || []).slice(0, 10).filter((p) => p.para_id) : [];
  if (!shown.length) return r;
  const rows = await (deps.paragraphsByIds || (async (ids) => (await import('../paragraphs-repo.js')).paragraphsByIds(ids)))(shown.map((p) => p.para_id)).catch(() => []);
  const { voiceOf } = await import('../authorship/voice.js');
  const byId = new Map((rows || []).map((x) => [Number(x.id), x]));
  for (const p of shown) {
    const row = byId.get(Number(p.para_id));
    if (!row?.authors) continue;
    p.voice = voiceOf({ authors: row.authors, author: r.work?.author ?? p.doc_author ?? null });
    p.credit = creditOf(p, r.query);
  }
  return r;
}
/** The passage card(s) for the chat widget: exactly ONE literal hit → [{work_id,title,author,cover_url,url,place,excerpt,phrase}] (excerpt keeps
 *  the **phrase** marks; the client splits on them, never injects HTML); several hits or a meaning match → none (the text list stays). Pure. */
export function passageCards(r, { cover = null } = {}) {
  if (r?.mode !== 'literal' || r.total !== 1 || r.passages?.length !== 1) return [];
  const p = r.passages[0], c = sowCoverUrl({ title: p.work ?? p.title }) ?? cover ?? r.work?.cover_url ?? null;   // the hit's own issue scan before the magazine's cover
  return [{ work_id: r.work?.id ?? p.document_id ?? null, title: r.work?.title ?? p.work ?? p.title ?? null, author: p.credit ?? named(p.author) ?? named(r.work?.author), cover_url: c ? (/^https?:/.test(c) ? c : `${SITE}${c}`) : null,
    url: p.url ?? null, place: p.place ?? null, excerpt: p.excerpt, phrase: r.query }];
}

/** The words to find, resolved by code from what Jev's lookup named: the quoted span(s) that are not the work's title, else Jev's topic. Pure. */
export function wordsToFind({ quoted = [], topic = null, titles = [] } = {}) {
  const t = titles.filter(Boolean).map(foldText);
  const q = quoted.map((s) => String(s).replace(/^[\s.,;:!?'"—–-]+|[\s.,;:!?'"—–-]+$/g, '').trim()).filter((s) => s && !t.includes(foldText(s)));
  const desc = topic ? describedWords(topic) : null;
  return q[0] || (desc && !namesTheWork(desc, titles) ? desc : null);
}
// The request's asking frame is not words to find (11-11: Jev's topic "find the statement about how five diamonds is worth…" was searched
// whole and quoted back as "the exact words"): "find (me) the statement / passage / quote … about (how) / that says" set aside. Word
// resolution of the search string, not intent (Jev chose find_passage). Pure.
const ASK = /^\s*(?:please\s+)?(?:can you\s+|could you\s+)?(?:find|locate|show|give|get|look\s+for|search\s+for|search|where\s+is|what\s+is)\s+(?:me\s+)?(?:(?:the|a|an|that|this)\s+)?(?:statement|passage|quote|quotation|words?|line|verse|text|saying|tablet|sentence|part)?\s*(?:(?:about|on|where|in\s+which|which\s+says|that\s+says|saying|that|which)\s+)?(?:how\s+)?/i;
export function describedWords(topic) {
  const t = String(topic || '').trim();
  const rest = t.replace(ASK, '').trim();
  return rest && rest !== t ? rest : t || null;
}

// A topic made only of the work's own title words (+ what kind of text it is) names the work — no words to find in it
// (11-11: "world order letters?" searched WOB for "world order letters" instead of giving the book). Word resolution, not intent.
const GENRE = new Set(['letter', 'letters', 'book', 'books', 'tablet', 'tablets', 'text', 'texts', 'work', 'works', 'volume', 'writings', 'writing',
  'the', 'a', 'an', 'of', 'by', 'and', 'on', 'to', 'in', 'his', 'her', 'its', 'their', 'this', 'that', 'my', 'your', 'some', 'any', 'all']);
const toks = (s) => foldText(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// The message, set aside what kind of text it is, IS one of the work's section titles (11-11: "Dispensation of Baha'u'llah" searched WOB
// for its own letter's title) → that section. Same words both ways, so a longer request ("search WOB for …") is still a search. Pure.
export function sectionNamed(text, sections = []) {
  const bag = (s) => new Set(toks(s).filter((w) => !GENRE.has(w)));
  const msg = bag(text);
  if (!msg.size) return null;
  const same = (a) => a.size === msg.size && [...a].every((w) => msg.has(w));
  return [...sections].sort((x, y) => (x.level ?? 1) - (y.level ?? 1)).find((s) => same(bag(s.title))) || null;
}
// "which one talks about the golden age?" with the book in focus: the message's own words (its asking frame, the kind of text and the book's
// own title set aside) all sit in exactly ONE top-level section title → that section (11-11: WOB's "The Golden Age of the Cause of
// Bahá'u'lláh" was missed and the turn ran 110 s of research). Ties or no match → null (the search runs). Word resolution, not intent. Pure.
const FRAME = new Set(['which', 'one', 'ones', 'what', 'where', 'who', 'talks', 'talk', 'talking', 'speaks', 'speak', 'about', 'is', 'are', 'was', 'does', 'do', 'did',
  'mention', 'mentions', 'discuss', 'discusses', 'deals', 'deal', 'with', 'it', 'part', 'parts', 'chapter', 'chapters', 'section', 'sections', 'there', 'describe', 'describes', 'covers', 'cover']);
export function sectionAbout(text, sections = [], workTitle = '') {
  const own = new Set(toks(workTitle));
  const want = [...new Set(toks(text).filter((w) => !GENRE.has(w) && !FRAME.has(w) && !own.has(w)))];
  if (!want.length || !sections.length) return null;
  const top = Math.min(...sections.map((x) => x.level ?? 1));
  const hits = sections.filter((x) => (x.level ?? 1) === top && x.title).filter((x) => { const t = new Set(toks(x.title)); return want.every((w) => t.has(w)); });
  return hits.length === 1 ? hits[0] : null;
}
export function namesTheWork(topic, titles = []) {
  const own = new Set(titles.filter(Boolean).flatMap(toks));
  const rest = toks(topic).filter((w) => !GENRE.has(w));
  return own.size > 0 && rest.every((w) => own.has(w));
}

/**
 * The turn path (Jev's lookup = in_work): the work by the one book finder (bookFastPath: candidates + one Jev pick, works AND
 * sections) → quote_search (works:[id]) → the code-built reply. null when no work resolves or there are no words (the turn researches as before).
 * LLM calls: the book pick only (one Jev call; a Haiku title extraction only when nothing fit).
 */
export async function findInWorkAnswer({ messages, names = [], by = null, topic = null, profile = {}, decisions = null, deps = {}, search = null, focus = null }) {
  const text = [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
  const quotedSpans = deps.quotedSpans || (await import('./request-features.js')).quotedSpans;
  const quoted = quotedSpans(text) || [];
  const book = deps.bookFastPath || (await import('./book-pick.js')).bookFastPath;
  const found = await book({ messages, names, by, profile, ...(decisions ? { decisions } : {}), deps: deps.bookDeps || {} });
  if (!found || (found.kind !== 'work' && found.kind !== 'section')) return null;
  const sec = found.kind === 'section' ? found.sec : null;
  const doc = sec ? { id: sec.doc_id, title: sec.book, author: sec.author } : found.work.doc;
  if (!doc?.id) return null;
  if (!sec) {
    const secs = await (deps.sectionsOf || (async (id) => (await import('../repos/sections-repo.js')).sectionsOfDoc(id)))(Number(doc.id)).catch(() => []);
    const named = sectionNamed(text, secs) || (focus ? sectionAbout(text, secs, doc.title) : null);
    if (named) {
      decisions?.record?.('in-work:section', { by: 'code', saw: { text, work: doc.id }, chosen: named.title, reason: focus ? 'the message\'s words are in this one part\'s title (book in focus): its card' : 'the message is this section\'s title: its card, not a search for it' });
      return { book: { kind: 'section', via: 'in-work:section', sec: { ...named, doc_id: doc.id, book: doc.title, author: doc.author ?? null }, doc }, work: doc };
    }
  }
  const other = await import('./work-request.js').then((m) => m.namesOf(doc.title)).catch(() => []);   // "KIQ", "World Order letters"
  // titles = the RESOLVED work's own names only: Jev's named units are unverified (11-12: '"five diamonds" in star of the west' — he
  // named the quote as a work, and its span was dropped as a title → "no words to find", the SoW card instead of the search)
  // no quoted words → the subject to look for, read from the conversation by a small model (11-12: "Can you try again to see if the
  // maxwell birth is mentioned in Star of the West?" was searched whole, asking words and all). Quoted words stay the reader's own.
  const ask = deps.subjectWords ?? (search ? null : subjectWords);
  const said = !quoted.length && ask ? await ask({ messages, title: doc.title }).catch(() => null) : null;
  const words = said || wordsToFind({ quoted, topic, titles: [doc.title, sec?.title, ...other] });
  decisions?.record?.('in-work:resolve', { by: said ? 'anis-find-words' : 'code', saw: { quoted, topic, work: doc.id, section: sec?.title ?? null }, chosen: words || 'none', reason: words ? null : 'no words to find: the work itself (its card)' });
  if (!words) return { book: found, work: doc };   // the work itself was asked for → the turn gives its card
  const run = search || (async (a) => (await import('./tools.js')).run('quote_search', a, { deps: deps.toolDeps || {} }));
  // Star of the West is filed one document per issue: the magazine named → every issue searched (Chad 11-11)
  const sow = !sec && isSowWork(doc) ? await (deps.sowIssueIds || sowIssueIds)().catch(() => []) : [];
  const res = await run({ query: words, works: sow.length ? sow : [Number(doc.id)], ...(sec ? { from: sec.start_index, to: sec.end_index ?? sec.start_index } : {}) });
  if (!res) return null;
  const r = await withVoices(asWorkResult(res, words, doc), deps);
  return { result: r, reply: inWorkReply(r, { section: sec?.title ?? null }), cards: passageCards(r, { cover: doc.cover_url ?? null }), work: doc, section: sec };
}

const WORDS_PROMPT = (convo, title) => `A reader is talking with a research assistant about the work "${title}". From the conversation below, what should be searched for inside that work to answer the reader's LAST message? Give the subject or words as the texts themselves would say them (names, the event, the idea), a few words — never the asking words ("can you", "try again", "see if", "mentioned", "find") and never the work's own title. Resolve "it", "that", "again" from the earlier turns. The work's name alone with nothing to look for → "".

${convo}

Reply with JSON only: {"words": "..."}`;
/** The words to look for in a work when none were quoted: one small-model call over the last turns. → string or null. */
export async function subjectWords({ messages, title, complete = null }) {
  const convo = (messages || []).slice(-5).map((m) => `${m.role === 'user' ? 'Reader' : 'Assistant'}: ${String(m.content || '').slice(0, 600)}`).join('\n');
  const call = complete || (async (msgs) => (await import('../ai.js')).chatCompletion(msgs, { ...(await import('../model-roles.js')).modelFor('anis-find-words'), temperature: 0, maxTokens: 80, thinking: false, caller: 'anis-find-words' }));
  const out = await call([{ role: 'user', content: WORDS_PROMPT(convo, title) }]);
  const t = String(out?.content ?? out?.text ?? out ?? '').match(/\{[\s\S]*\}/)?.[0];
  const w = t ? String(JSON.parse(t).words || '').trim() : '';
  return w && foldText(w) !== foldText(title) ? w : null;
}

/** quote_search's result → the shape inWorkReply / passageCards read: { work, query, mode, total, passages }. Pure. */
export const asWorkResult = (res, query, doc = null) => {
  const w = res.works?.[0] || {};
  return { work: { id: w.id ?? doc?.id ?? null, title: w.title ?? doc?.title ?? null, author: w.author ?? doc?.author ?? null, cover_url: w.cover_url ?? null }, query, mode: res.mode_used, total: res.total, passages: res.passages };
};

/** The library-wide reply (no work named): each passage quoted with ITS work in the citation; the filters named in the count / absence line. Pure. */
export function quoteReply(r, { scope = null, described = false } = {}) {
  const q = `“${r.query}”`, where = scope || 'the library';
  const item = (p) => { const name = p.work || p.title || 'this work', cite = p.place ? `*${name}*, ${p.place}` : `*${name}*`;
    const by = p.credit ?? named(p.author);
    return `> “${p.excerpt}”\n>\n> — ${by ? `${by}, ` : ''}${p.url ? `[${cite}](${p.url})` : cite}`; };
  if (r.mode === 'literal') {
    const more = r.total > r.passages.length ? `\n\nThose are the first ${r.passages.length} of the ${r.total}; ask for the rest and I will continue from there.` : '';
    return r.total === 1 ? item(r.passages[0]) : `${r.total} passages in ${where} hold ${q}:\n\n${r.passages.map(item).join('\n\n')}${more}`;
  }
  // the reader DESCRIBED the passage (no words in quotation marks): never "has the exact words …" of a description (11-11)
  if (r.mode === 'meaning' && described) { const top = brief(r); return `${top.length === 1 ? 'The passage' : `The ${top.length} passages`} in ${where} closest to what you describe:\n\n${top.map(item).join('\n\n')}`; }
  if (r.mode === 'meaning') { const top = brief(r); return `No passage in ${where} has the exact words ${q}. ${closest(top.length)} the closest to them in meaning:\n\n${top.map(item).join('\n\n')}`; }
  if (described) return `I searched ${where} and found no passage close to what you describe.`;
  return `I searched ${where} for ${q}: the words are not there, and no passage comes close in meaning.`;
}

// Jev's named person → the library's author(s) whose name it holds (11-11: Jev named "Somewhere Abdu'l-Baha" — the reader's "Somewhere"
// read as part of the name — and the author filter matched nothing, so "no passage comes close"). Longest library name contained in
// his wording wins; none → no author filter (recorded), never a filter that can only return nothing. Pure.
const authKey = (a) => foldText(a).replace(/[^\p{L}\p{N}]+/gu, '');
export function resolveAuthors(named = [], library = []) {
  const keys = [...new Set(library.filter(Boolean))].map((a) => [a, authKey(a)]).filter(([, k]) => k.length >= 4);
  return [...new Set(named.flatMap((n) => {
    const nk = authKey(n);
    const exact = keys.filter(([, k]) => k === nk).map(([a]) => a);
    if (exact.length) return exact;
    const held = keys.filter(([, k]) => nk.includes(k)).sort((x, y) => y[1].length - x[1].length);
    return held.length ? [held[0][0]] : [];
  }))];
}

/**
 * The turn path for "find the passage that says X" (Jev's lookup = find_passage; no book named): the filters are Jev's units (religions he
 * scoped, the person he named as author, a work he named) → quote_search → quoteReply. The words = a quoted span, else Jev's topic.
 * null when there are no words (the turn researches as before). No LLM.
 */
export async function findPassageAnswer({ messages, religions = [], authors = [], works = [], topic = null, language = null, decisions = null, deps = {}, search = null }) {
  const text = [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
  const quoted = (deps.quotedSpans || (await import('./request-features.js')).quotedSpans)(text) || [];
  const words = wordsToFind({ quoted, topic, titles: works });
  decisions?.record?.('find-passage:resolve', { by: 'code', saw: { quoted, topic, religions, authors, works }, chosen: words || 'none', reason: words ? null : 'no words to find: research instead' });
  if (!words) return null;
  if (authors.length) {
    const library = deps.libraryAuthors ? await deps.libraryAuthors() : await import('../dewey/title-index.js').then(async (m) => (await m.titleIndex()).docs.map((d) => d.author)).catch(() => null);
    if (library?.length) {   // no author list to hand (an empty index) → his names stand as given
      const got = resolveAuthors(authors, library);
      decisions?.record?.('find-passage:author', { by: 'code', saw: { named: authors }, chosen: got.length ? got : 'none', reason: got.length ? null : 'no library author by that name: no author filter' });
      authors = got;
    }
  }
  const run = search || (async (a) => (await import('./tools.js')).run('quote_search', a, { deps: deps.toolDeps || {} }));
  const res = await run({ query: words, ...(religions.length ? { religions } : {}), ...(authors.length ? { authors } : {}), ...(works.length ? { works } : {}), ...(language ? { language } : {}) });
  if (!res) return null;
  if (res.passages?.length) {
    const swap = await (deps.publishedCopies || publishedCopies)(res.passages, { decisions });
    if (swap) res.passages = swap;
  }
  // nothing at all under the reader's filters is not "nothing close in meaning": research takes it (it reads, rephrases, widens)
  if (!res.total && !res.passages?.length) { decisions?.record?.('find-passage:empty', { by: 'code', chosen: 'research', reason: 'no passage under these filters' }); return null; }
  const r = await withVoices({ work: null, query: words, mode: res.mode_used, total: res.total, passages: res.passages }, deps);
  const scope = [...oneSpelling(authors), ...(works.length ? works.map((w) => `*${w}*`) : []), ...(!authors.length && !works.length ? religions : [])].join(', ') || null;
  return { result: r, reply: quoteReply(r, { scope: scope && (authors.length || works.length ? `${scope}` : `the ${scope} texts`), described: !quoted.length }), cards: passageCards({ ...r, work: {} }), work: null, section: null };
}

// One spelling per author for the reader (11-11: "’Abdu’l-Bahá, 'Abdu'l-Bahá, ‘Abdu’l-Bahá, abdul-baha, ‘Abdu'l-Bahá"): the filter keeps every
// library spelling, the sentence names each person once — the spelling with its accents and capital. Pure.
export function oneSpelling(names = []) {
  const groups = new Map();
  for (const n of names) { const k = authKey(n); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); }
  const score = (n) => (/[^\x00-\x7f]/.test(n) ? 2 : 0) + (/^[’‘'"]?\p{Lu}/u.test(n) ? 1 : 0);
  return [...groups.values()].map((g) => g.slice().sort((a, b) => score(b) - score(a))[0]);
}

/**
 * A provisional translation (the Phelps inventory) gives way to a PUBLISHED copy of the same words (11-11: 'Abdu'l-Bahá's words to
 * William Ellis, first printed in Star of the West, were cited from the Phelps "Words to William Ellis … (provisional translation)"):
 * the matched sentence searched word for word; the first copies holding it, not provisional, linked; a paragraph-level link wins.
 * The speaker stays the passage's author; the copy gives title, place and link. Budget 1.5 s; late or none → the passage stays.
 */
async function publishedCopies(passages, { decisions = null, budgetMs = 1500 } = {}) {
  const { isProvisional } = await import('../source-hunt.js');
  const todo = passages.map((p, i) => ({ p, i })).filter(({ p }) => isProvisional(p) && (p.match || p.excerpt));
  if (!todo.length) return null;
  const os = await import('./own-source.js');
  const late = new Promise((r) => setTimeout(r, budgetMs, null));
  const one = async ({ p }) => {
    const span = String(p.match || p.excerpt).replace(/^…\s*|\s*…$/g, '');
    const hits = (await os.literalOwnSearch(span, {}, { timeoutMs: budgetMs, limit: 10 }).catch(() => []))
      .filter((h) => Number(h.document_id) !== Number(p.doc_id ?? p.document_id) && !isProvisional(h) && !os.slugTitle(h.title) && holdsWords(h.text, span)).slice(0, 5);
    if (!hits.length) return null;
    const linked = await os.linkHits(hits.map((h) => ({ ...h, quote: span }))).catch(() => hits);
    const best = linked.find((h) => h.link?.paragraph_level) || linked[0];
    return { ...p, doc_id: best.document_id, document_id: best.document_id, work: best.title, title: best.title, url: best.url ?? null, place: (await import('./tool-kit.js')).toPassage(best).place ?? null, copy_of: p.para_id ?? p.id };
  };
  const got = await Promise.race([Promise.all(todo.map((t) => one(t).catch(() => null))), late]);
  if (!got || !got.some(Boolean)) return null;
  const out = passages.slice();
  todo.forEach((t, k) => { if (got[k]) out[t.i] = got[k]; });
  decisions?.record?.('find-passage:published-copy', { by: 'code', saw: { provisional: todo.map((t) => t.p.para_id ?? t.p.id) }, chosen: got.filter(Boolean).map((g) => g.title), reason: 'a provisional translation gives way to the published copy holding the same words' });
  return out;
}

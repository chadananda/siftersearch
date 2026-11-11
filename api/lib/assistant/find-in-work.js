// In-book / quote shaping (Chad 11-10): turns a quote_search result into the reply by CODE (no LLM): 1 hit = the passage quoted + linked
// citation (+ a card), n = count line + passages, meaning = labelled. Deps: quote-search.js (the search + text helpers, re-exported here).
import { SITE } from '../source-links.js';
import { foldText, holdsWords, boldWords, excerptOf } from './quote-search.js';
export { foldText, holdsWords, boldWords, excerptOf };

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
const brief = (r) => r.passages.slice(0, MEANING_SHOW).map((p) => ({ ...p, excerpt: briefExcerpt(p.excerpt) }));
const closest = (n) => (n === 1 ? 'This passage is' : `These ${n} passages are`);

/** The reply, built by code (no writer): each place as a quoted passage with its linked citation; a count line only when there are several. Pure. */
export function inWorkReply(r, { section = null } = {}) {
  const name = section || r.work.title || 'this work';
  const title = `*${name}*`;
  const q = `“${r.query}”`;
  // each place is the passage itself, quoted, with its citation (the link) under it — no list, no paraphrase (Chad 11-10)
  const item = (p) => {
    const cite = p.place ? `*${name}*, ${p.place}` : `*${name}*`;
    const by = p.author ?? r.work.author ?? null;
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

/** The passage card(s) for the chat widget: exactly ONE literal hit → [{work_id,title,author,cover_url,url,place,excerpt,phrase}] (excerpt keeps
 *  the **phrase** marks; the client splits on them, never injects HTML); several hits or a meaning match → none (the text list stays). Pure. */
export function passageCards(r, { cover = null } = {}) {
  if (r?.mode !== 'literal' || r.total !== 1 || r.passages?.length !== 1) return [];
  const p = r.passages[0], c = cover ?? r.work?.cover_url ?? null;
  return [{ work_id: r.work?.id ?? p.document_id ?? null, title: r.work?.title ?? p.work ?? p.title ?? null, author: p.author ?? r.work?.author ?? null, cover_url: c ? (/^https?:/.test(c) ? c : `${SITE}${c}`) : null,
    url: p.url ?? null, place: p.place ?? null, excerpt: p.excerpt, phrase: r.query }];
}

/** The words to find, resolved by code from what Jev's lookup named: the quoted span(s) that are not the work's title, else Jev's topic. Pure. */
export function wordsToFind({ quoted = [], topic = null, titles = [] } = {}) {
  const t = titles.filter(Boolean).map(foldText);
  const q = quoted.map((s) => String(s).replace(/^[\s.,;:!?'"—–-]+|[\s.,;:!?'"—–-]+$/g, '').trim()).filter((s) => s && !t.includes(foldText(s)));
  return q[0] || (topic && !namesTheWork(topic, titles) ? topic : null);
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
export async function findInWorkAnswer({ messages, names = [], by = null, topic = null, profile = {}, decisions = null, deps = {}, search = null }) {
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
    const named = sectionNamed(text, secs);
    if (named) {
      decisions?.record?.('in-work:section', { by: 'code', saw: { text, work: doc.id }, chosen: named.title, reason: 'the message is this section\'s title: its card, not a search for it' });
      return { book: { kind: 'section', via: 'in-work:section', sec: { ...named, doc_id: doc.id, book: doc.title, author: doc.author ?? null }, doc }, work: doc };
    }
  }
  const other = await import('./work-request.js').then((m) => m.namesOf(doc.title)).catch(() => []);   // "KIQ", "World Order letters"
  const words = wordsToFind({ quoted, topic, titles: [doc.title, sec?.title, ...names, ...other] });
  decisions?.record?.('in-work:resolve', { by: 'code', saw: { quoted, topic, work: doc.id, section: sec?.title ?? null }, chosen: words || 'none', reason: words ? null : 'no words to find: the work itself (its card)' });
  if (!words) return { book: found, work: doc };   // the work itself was asked for → the turn gives its card
  const run = search || (async (a) => (await import('./tools.js')).run('quote_search', a, { deps: deps.toolDeps || {} }));
  const res = await run({ query: words, works: [Number(doc.id)], ...(sec ? { from: sec.start_index, to: sec.end_index ?? sec.start_index } : {}) });
  if (!res) return null;
  const r = asWorkResult(res, words, doc);
  return { result: r, reply: inWorkReply(r, { section: sec?.title ?? null }), cards: passageCards(r, { cover: doc.cover_url ?? null }), work: doc, section: sec };
}

/** quote_search's result → the shape inWorkReply / passageCards read: { work, query, mode, total, passages }. Pure. */
export const asWorkResult = (res, query, doc = null) => {
  const w = res.works?.[0] || {};
  return { work: { id: w.id ?? doc?.id ?? null, title: w.title ?? doc?.title ?? null, author: w.author ?? doc?.author ?? null, cover_url: w.cover_url ?? null }, query, mode: res.mode_used, total: res.total, passages: res.passages };
};

/** The library-wide reply (no work named): each passage quoted with ITS work in the citation; the filters named in the count / absence line. Pure. */
export function quoteReply(r, { scope = null } = {}) {
  const q = `“${r.query}”`, where = scope || 'the library';
  const item = (p) => { const name = p.work || p.title || 'this work', cite = p.place ? `*${name}*, ${p.place}` : `*${name}*`;
    return `> “${p.excerpt}”\n>\n> — ${p.author ? `${p.author}, ` : ''}${p.url ? `[${cite}](${p.url})` : cite}`; };
  if (r.mode === 'literal') {
    const more = r.total > r.passages.length ? `\n\nThose are the first ${r.passages.length} of the ${r.total}; ask for the rest and I will continue from there.` : '';
    return r.total === 1 ? item(r.passages[0]) : `${r.total} passages in ${where} hold ${q}:\n\n${r.passages.map(item).join('\n\n')}${more}`;
  }
  if (r.mode === 'meaning') { const top = brief(r); return `No passage in ${where} has the exact words ${q}. ${closest(top.length)} the closest to them in meaning:\n\n${top.map(item).join('\n\n')}`; }
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
export async function findPassageAnswer({ messages, religions = [], authors = [], works = [], topic = null, decisions = null, deps = {}, search = null }) {
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
  const res = await run({ query: words, ...(religions.length ? { religions } : {}), ...(authors.length ? { authors } : {}), ...(works.length ? { works } : {}) });
  if (!res) return null;
  // nothing at all under the reader's filters is not "nothing close in meaning": research takes it (it reads, rephrases, widens)
  if (!res.total && !res.passages?.length) { decisions?.record?.('find-passage:empty', { by: 'code', chosen: 'research', reason: 'no passage under these filters' }); return null; }
  const r = { work: null, query: words, mode: res.mode_used, total: res.total, passages: res.passages };
  const scope = [...authors, ...(works.length ? works.map((w) => `*${w}*`) : []), ...(!authors.length && !works.length ? religions : [])].join(', ') || null;
  return { result: r, reply: quoteReply(r, { scope: scope && (authors.length || works.length ? `${scope}` : `the ${scope} texts`) }), cards: passageCards({ ...r, work: {} }), work: null, section: null };
}

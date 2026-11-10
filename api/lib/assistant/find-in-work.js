// In-book / quote shaping (Chad 11-10): turns a quote_search result into the reply by CODE (no LLM): 1 hit = the passage quoted + linked
// citation (+ a card), n = count line + passages, meaning = labelled. Deps: quote-search.js (the search + text helpers, re-exported here).
import { SITE } from '../source-links.js';
import { foldText, holdsWords, boldWords, excerptOf } from './quote-search.js';
export { foldText, holdsWords, boldWords, excerptOf };

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
    return `No passage in ${title} has the exact words ${q}. ${r.passages.length === 1 ? 'This passage is' : `These ${r.passages.length} passages are`} the closest to them in meaning:\n\n${r.passages.map(item).join('\n\n')}`;
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
  return q[0] || (topic && !t.includes(foldText(topic)) ? topic : null);
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
  const words = wordsToFind({ quoted, topic, titles: [doc.title, sec?.title, ...names] });
  decisions?.record?.('in-work:resolve', { by: 'code', saw: { quoted, topic, work: doc.id, section: sec?.title ?? null }, chosen: words || 'none', reason: words ? null : 'no words to find: research instead' });
  if (!words) return null;
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
  if (r.mode === 'meaning') return `No passage in ${where} has the exact words ${q}. ${r.passages.length === 1 ? 'This passage is' : `These ${r.passages.length} passages are`} the closest to them in meaning:\n\n${r.passages.map(item).join('\n\n')}`;
  return `I searched ${where} for ${q}: the words are not there, and no passage comes close in meaning.`;
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
  const run = search || (async (a) => (await import('./tools.js')).run('quote_search', a, { deps: deps.toolDeps || {} }));
  const res = await run({ query: words, ...(religions.length ? { religions } : {}), ...(authors.length ? { authors } : {}), ...(works.length ? { works } : {}) });
  if (!res) return null;
  const r = { work: null, query: words, mode: res.mode_used, total: res.total, passages: res.passages };
  const scope = [...authors, ...(works.length ? works.map((w) => `*${w}*`) : []), ...(!authors.length && !works.length ? religions : [])].join(', ') || null;
  return { result: r, reply: quoteReply(r, { scope: scope && (authors.length || works.length ? `${scope}` : `the ${scope} texts`) }), cards: passageCards({ ...r, work: {} }), work: null, section: null };
}

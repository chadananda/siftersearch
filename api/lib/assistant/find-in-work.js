// In-work find (Chad 11-10, 'search for "private property" in God Passes By'): every paragraph of ONE work (or one section of it)
// that holds the words — literal, folded for accents/case/curly quotes — in reading order, each with its place ("#868") and link;
// no literal hit → the passages closest in MEANING inside that work, labelled as such. Code only, no LLM.
// Deps (ctx.deps, else the repos): paragraphTexts, paragraphsByIds, withLinks, getDoc. The turn path: findInWorkAnswer.
import { toPassage } from './tool-kit.js';
import { SITE } from '../source-links.js';

/** Fold for matching: accents off, curly/odd apostrophes → ', lower case, every other non-letter → one space. Pure. */
export const foldText = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`ʻʼ]/g, "'").toLowerCase()
  .replace(/[^\p{L}\p{N}']+/gu, ' ').replace(/(^|\s)'+|'+(?=\s|$)/g, '$1').replace(/\s+/g, ' ').trim();
/** Does the text hold the words, as words, in that order? Pure. */
export const holdsWords = (text, words) => { const w = foldText(words); return !!w && ` ${foldText(text)} `.includes(` ${w} `); };
const isHeading = (r) => /^heading/.test(r?.blocktype || '');

const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The words as a pattern over NFD text: any accents, any apostrophe, any punctuation/space between words. Pure. */
function wordsPattern(words) {
  const toks = foldText(words).split(' ').filter(Boolean);
  if (!toks.length) return null;
  const tok = (t) => [...t].map((c) => (c === "'" ? "['’‘`ʻʼ]?" : `${esc(c)}\\p{M}*`)).join('');
  return new RegExp(`(?<![\\p{L}\\p{N}])${toks.map(tok).join('[^\\p{L}\\p{N}]+')}(?![\\p{L}\\p{N}])`, 'giu');
}
/** The words in bold inside a piece of text (accents kept as written). Pure. */
export function boldWords(text, words) {
  const re = wordsPattern(words);
  const nfd = String(text || '').normalize('NFD');
  return (re ? nfd.replace(re, (m) => `**${m}**`) : nfd).normalize('NFC');
}
/** The passage that holds the words, words in bold: the sentence(s) with them; a long sentence (Chad 11-10: "I was looking for a
 *  passage, not a long-winded interpretation of the context") narrows to its clause(s) with them, cut only at a clause mark (; — – :).
 *  "…" marks what was left out. Words spanning two sentences → the whole paragraph. Pure. */
const LONG_WORDS = 45;
const clauseOf = (sent, words) => {
  if (sent.split(' ').length <= LONG_WORDS) return null;
  const cl = sent.split(/(?<=;)\s+|\s+(?=[—–]\s)|(?<=\s[—–])\s+|(?<=:)\s+/u);
  const hit = cl.map((c, i) => (holdsWords(c, words) ? i : -1)).filter((i) => i >= 0);
  if (!hit.length || cl.length < 2) return null;
  const tidy = (c) => c.replace(/^[—–]\s*/, '').replace(/[;:,]?\s*[—–]?\s*$/, '');
  const body = cl.slice(hit[0], hit.at(-1) + 1).map((c, i, a) => (i === a.length - 1 ? tidy(c) : c)).join(' ').replace(/^[—–]\s*/, '');
  const fullEnd = hit.at(-1) === cl.length - 1;
  return `${hit[0] > 0 ? '…' : ''}${body}${fullEnd ? '' : '…'}`;
};
export function excerptOf(text, words) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const sents = t.split(/(?<=[.!?]["”’)\]]*)\s+(?=["“‘(\[]?\p{Lu})/u);
  const idx = sents.map((s, i) => (holdsWords(s, words) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return boldWords(t, words);
  if (idx.length === 1) { const c = clauseOf(sents[idx[0]], words); if (c) return boldWords(c, words); }
  const parts = [];
  idx.forEach((i, k) => { if (k > 0 && i !== idx[k - 1] + 1) parts.push('…'); parts.push(sents[i]); });
  return `${idx[0] > 0 ? '… ' : ''}${boldWords(parts.join(' '), words)}${idx.at(-1) < sents.length - 1 ? ' …' : ''}`;
}

const repo = async (ctx, name, mod) => ctx?.deps?.[name] || (await import(mod))[name];

/**
 * { work_id, query, from?, to?, literal = true, limit = 200 } → { work: {id,title,author}, query, mode: 'literal'|'meaning'|'none',
 *   total, passages: Passage[] (+ url, excerpt) }. meaning(query, workId) = the fallback search (tools.js passes fused_search).
 */
export async function inWorkSearch({ work_id, query, from = null, to = null, literal = true, limit = 200 } = {}, ctx = {}, meaning = null) {
  const id = Number(work_id);
  const lo = from ?? 0, hi = to ?? 1e9;
  const getDoc = await repo(ctx, 'getDoc', '../docs-repo.js');
  const doc = await Promise.resolve(getDoc(id)).catch(() => null);
  const work = { id, title: doc?.title ?? null, author: doc?.author ?? null, cover_url: doc?.cover_url ?? null };
  const link = async (ps) => { try { return await (await repo(ctx, 'withLinks', '../hit-links.js'))(ps); } catch { return ps; } };
  let mode = 'none', hits = [];
  if (literal !== false) {
    const rows = await (await repo(ctx, 'paragraphTexts', '../paragraphs-repo.js'))(id, { from: lo, to: hi });
    hits = (rows || []).filter((r) => !isHeading(r) && holdsWords(r.text, query));
    if (hits.length) mode = 'literal';
  }
  const total = hits.length;
  let passages = [];
  if (hits.length) {
    const shown = hits.slice(0, Math.max(1, limit));
    let hydrated = [];
    try { hydrated = await (await repo(ctx, 'paragraphsByIds', '../paragraphs-repo.js'))(shown.map((r) => r.id)); } catch { hydrated = []; }
    const full = new Map((hydrated || []).map((p) => [Number(p.id), p]));
    // a row hydrate drops (a paragraph flagged duplicate) still counts: it is in the book — cited from its own row
    const rows = shown.map((r) => full.get(Number(r.id)) || { id: r.id, doc_id: id, paragraph_index: r.paragraph_index, text: r.text, heading: r.heading, title: work.title, author: work.author });
    // the link highlights the words found, not the whole paragraph (Chad 11-10)
    const linked = await link(rows.map((r) => ({ ...r, quote: query })));
    passages = linked.map((p) => ({ ...toPassage(p), url: p.url ?? null, excerpt: excerptOf(p.text, query), found_by: ['in_work'] }));
  } else if (meaning) {
    let near = [];
    try { near = (await meaning(query, id)) || []; } catch { near = []; }
    near = near.filter((p) => (p.paragraph_index ?? 0) >= lo && (p.paragraph_index ?? 0) <= hi);
    if (near.length) mode = 'meaning';
    passages = near.sort((a, b) => (a.paragraph_index ?? 0) - (b.paragraph_index ?? 0))
      .map((p) => ({ ...p, url: p.url ?? p.source_url ?? null, excerpt: String(p.text || '').replace(/\s+/g, ' ').trim(), found_by: ['meaning'] }));
  }
  if (!work.title && passages[0]?.title) Object.assign(work, { title: passages[0].title, author: passages[0].book_author || passages[0].author || null });
  return { work, query, mode, total: mode === 'literal' ? total : passages.length, passages };
}

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
  return [{ work_id: r.work.id, title: r.work.title ?? null, author: p.author ?? r.work.author ?? null, cover_url: c ? (/^https?:/.test(c) ? c : `${SITE}${c}`) : null,
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
 * sections) → inWorkSearch → the code-built reply. null when no work resolves or there are no words (the turn researches as before).
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
  const run = search || (async (a) => (await import('./tools.js')).run('in_work_search', a, { deps: deps.toolDeps || {} }));
  const r = await run({ work_id: Number(doc.id), query: words, ...(sec ? { from: sec.start_index, to: sec.end_index ?? sec.start_index } : {}) });
  if (!r) return null;
  if (!r.work?.title) r.work = { ...(r.work || {}), title: doc.title };
  return { result: r, reply: inWorkReply(r, { section: sec?.title ?? null }), cards: passageCards(r, { cover: doc.cover_url ?? null }), work: doc, section: sec };
}

// quote_search internals (Chad 11-10: ONE "find quote" tool, filters for religion / author(s) / work(s); in-book find is just works:[id]).
// Literal first (accent/case/curly-quote folded), meaning fallback in 'auto'. Pure search: no wording, no shaping (quote-results shapes it).
// Deps (ctx.deps, else the repos): paragraphTexts, paragraphsByIds, withLinks, getDoc, findTitled; `fused` = the fused_search runner.
import { toPassage } from './tool-kit.js';
import { sowCoverUrl, sowWholeAsked } from '../sow-links.js';
import { canonicalTradition } from './tradition-name.js';
import { isMainThread } from 'node:worker_threads';
import { foldText, holdsWords, literalScanRows } from '../search/literal-scan.js';

export { foldText, holdsWords } from '../search/literal-scan.js';
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
// A cut excerpt can keep half of a quotation (11-12, Star of the West: "… Five diamonds are worth more than five million stones.\" …"):
// the mark whose partner was cut away goes with the cut — a closer with no opener before it, an opener with no closer after it. Only cut
// excerpts (opening or ending "…"); a whole passage keeps its marks as written. Pure.
export function balanceQuotes(s) {
  const t = String(s ?? '');
  const head = /^…/.test(t), tail = /…$/.test(t);
  if (!head && !tail) return t;
  const c = [...t];
  const drop = new Set();
  const open = [];
  c.forEach((ch, i) => { if (ch === '“') open.push(i); else if (ch === '”') { if (open.length) open.pop(); else if (head) drop.add(i); } });
  if (tail) open.forEach((i) => drop.add(i));
  const straight = c.map((ch, i) => (ch === '"' ? i : -1)).filter((i) => i >= 0);
  if (straight.length % 2) drop.add(head ? straight[0] : tail ? straight.at(-1) : -1);
  return drop.size ? c.filter((_, i) => !drop.has(i)).join('').replace(/ {2,}/g, ' ') : t;
}

export function excerptOf(text, words) {
  return balanceQuotes(excerptCut(text, words));
}
function excerptCut(text, words) {
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
const asList = (x) => (x == null || x === '' ? [] : Array.isArray(x) ? x : [x]);
const uniq = (l) => [...new Set(l)];
const authorKey = (a) => foldText(a).replace(/'/g, '');
/** Text as a reader sees it: sentence markers ⁅s1⁆, footnote refs [^1], pandoc {…} attributes and markdown emphasis out (11-11: a
 *  meaning match printed "⁅s1⁆ای احبّای…" and "_that the melody…_" raw). Pure. */
export const plainText = (t) => String(t || '').replace(/⁅\/?[sp]\d+⁆/g, '').replace(/\[\^[^\]]*\]/g, '').replace(/\{[^{}]*\}/g, '')
  .replace(/(\*\*|__)(\S(?:.*?\S)?)\1/g, '$2').replace(/(^|[\s(“"‘'])[*_](\S(?:.*?\S)?)[*_](?=[\s.,;:!?)”"’']|$)/g, '$1$2').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'for', 'are', 'was', 'were', 'his', 'her', 'its', 'how', 'what', 'about', 'from', 'than', 'more', 'into', 'which', 'who', 'not']);
const content = (s) => foldText(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
/** The sentence of a meaning match that holds most of the asked words (11-11: "five diamonds are worth more than five million stones"
 *  sat in the 4th sentence, the 45-word opening cut before it). null when no sentence shares a word. Pure. */
export function bestSentence(text, words) {
  const want = new Set(content(words));
  if (!want.size) return null;
  const sents = plainText(text).split(/(?<=[.!?]["”’)\]]*)\s+/u);
  let best = null, top = 0;
  for (const x of sents) { const n = new Set(content(x).filter((w) => want.has(w))).size; if (n > top) { top = n; best = x; } }
  return best;
}

/**
 * { query: phrase, mode = 'auto', religions[], authors[], works[] (ids or titles), from?, to?, limit } → { total, passages, mode_used, works }.
 * Filters AND across kinds, OR inside a list. Passages: toPassage + { doc_id, work, para_id, url, excerpt, found_by }.
 * works given → each work's paragraphs read whole (complete, reading order); none → the library by the literal layer.
 * mode_used: 'literal' | 'meaning' | 'none'. fused(args) = run('fused_search', args) (tools.js passes it).
 */
export async function quoteSearch({ query: phrase, mode = 'auto', religions = [], authors = [], works = [], from = null, to = null, limit, language = null } = {}, ctx = {}, fused = null) {
  const lo = from ?? 0, hi = to ?? 1e9;
  const rels = uniq(asList(religions).map((r) => canonicalTradition(r)).filter(Boolean)), auts = uniq(asList(authors).filter(Boolean));
  const link = async (ps) => { try { return await (await repo(ctx, 'withLinks', '../hit-links.js'))(ps); } catch { return ps; } };
  const getDoc = await repo(ctx, 'getDoc', '../docs-repo.js');
  // works → document ids: a number (or digit string) is an id, a title goes through the book finder
  const ids = [];
  for (const w of asList(works)) {
    if (/^\d+$/.test(String(w))) ids.push(Number(w));
    else {
      // the title finder lives in work-request.js (it imported a missing './works.js' → every title failed, 11-12)
      const f = await (await repo(ctx, 'findTitled', './work-request.js'))([String(w)]).catch(() => null);
      // a periodical named as a whole is every issue (Star of the West: one document per issue), never the one issue the finder picked
      if (f?.doc && sowWholeAsked(f.doc, String(w))) ids.push(...await (await repo(ctx, 'sowIssueIds', '../sow-links.js'))().catch(() => []));
      else if (f?.doc?.id) ids.push(Number(f.doc.id));
    }
  }
  const named = asList(works).length > 0;
  const docs = new Map();
  // in parallel: a periodical is hundreds of documents (Star of the West 395 one at a time took ~5 s, 11-12)
  await Promise.all(uniq(ids).map(async (id) => docs.set(id, await Promise.resolve(getDoc(id)).catch(() => null))));
  // the work's own religion / author must pass the other filters (AND)
  const docOk = (d) => (!rels.length || (d?.religion && rels.includes(canonicalTradition(d.religion)))) && (!auts.length || (d?.author && auts.some((a) => authorKey(d.author).includes(authorKey(a)))));
  const kept = [...docs.entries()].filter(([, d]) => docOk(d)).map(([id]) => id);
  const meta = (id) => ({ id, title: docs.get(id)?.title ?? null, author: docs.get(id)?.author ?? null, cover_url: docs.get(id)?.cover_url ?? sowCoverUrl(docs.get(id)) });
  const worksOut = kept.map(meta);
  const cap = Math.max(1, limit ?? (named ? 200 : 20));
  const shape = (p, how, text = p.text) => ({ ...p, doc_id: p.document_id ?? p.doc_id ?? null, work: p.title ?? null, para_id: p.id ?? null, url: p.url ?? p.source_url ?? null,
    excerpt: how === 'literal' ? excerptOf(plainText(text), phrase) : plainText(text), ...(how === 'literal' ? {} : { match: bestSentence(text, phrase) }), found_by: [how === 'literal' ? (named ? 'in_work' : 'literal') : 'meaning'] });
  let used = 'none', total = 0, passages = [];
  if (named && !kept.length) return { total, passages, mode_used: used, works: worksOut };
  // ── literal
  if (mode !== 'meaning') {
    let hits = [];
    if (named) {
      const texts = ctx?.deps?.paragraphTexts;
      if (texts) for (const id of kept) hits.push(...((await texts(id, { from: lo, to: hi })) || []).filter((r) => !isHeading(r) && holdsWords(r.text, phrase)).map((r) => ({ ...r, __doc: id })));
      else hits = isMainThread ? await (await import('../search/read-pool.js')).runRead('quote:literal-scan', kept, { from: lo, to: hi }, phrase) : await literalScanRows(kept, { from: lo, to: hi }, phrase);
      total = hits.length;
      const shown = hits.slice(0, cap);
      let hydrated = [];
      try { hydrated = await (await repo(ctx, 'paragraphsByIds', '../paragraphs-repo.js'))(shown.map((r) => r.id)); } catch { hydrated = []; }
      const full = new Map((hydrated || []).map((p) => [Number(p.id), p]));
      // a row hydrate drops (a paragraph flagged duplicate) still counts: it is in the book, cited from its own row
      const rows = shown.map((r) => full.get(Number(r.id)) || { id: r.id, doc_id: r.__doc, document_id: r.__doc, paragraph_index: r.paragraph_index, text: r.text, heading: r.heading, title: meta(r.__doc).title, author: meta(r.__doc).author });
      // the link highlights the words found, not the whole paragraph
      passages = (await link(rows.map((r) => ({ ...r, quote: phrase })))).map((p) => shape({ ...toPassage(p), url: p.url ?? null }, 'literal', p.text));
    } else if (fused) {
      const got = await libraryRows(fused, phrase, { rels, auts }, ['literal'], cap * 3);
      const kept2 = got.filter((p) => holdsWords(p.text, phrase));
      total = kept2.length;
      passages = kept2.slice(0, cap).map((p) => shape(p, 'literal'));
    }
    if (passages.length) used = 'literal';
  }
  // ── meaning (auto: only when no literal hit)
  if (!passages.length && mode !== 'literal' && fused) {
    const near = (await libraryRows(fused, phrase, { rels, auts, ids: named ? kept : [] }, ['phrase', 'hype'], Math.min(cap, 8)))
      .filter((p) => !named || ((p.paragraph_index ?? 0) >= lo && (p.paragraph_index ?? 0) <= hi));
    const shown = language ? await inLanguage(near, language, ctx) : near;
    if (shown.length) used = 'meaning';
    // each link ranges to the sentence that matched, on whichever site publishes it (11-11: the Phelps link carried no range)
    const ranged = await link(shown.map((p) => ({ ...p, quote: bestSentence(p.text, phrase) || undefined })));
    passages = (named ? ranged.sort((a, b) => (a.paragraph_index ?? 0) - (b.paragraph_index ?? 0)) : ranged).map((p) => shape({ ...p, url: p.url ?? null }, 'meaning'));
    total = passages.length;
  }
  return { total, passages, mode_used: used, works: worksOut };
}
// the fused_search runs one filter set per religion (the engine takes one tradition); authors and documents are lists there (any of them)
async function libraryRows(fused, query, { rels, auts, ids = [] }, layers, limit) {
  const sets = (rels.length ? rels : [null]).map((t) => ({ ...(t ? { tradition: t } : {}), ...(auts.length ? { author: auts } : {}), ...(ids.length ? { documentId: ids } : {}) }));
  const lists = await Promise.all(sets.map((filters) => fused({ query, limit: Math.min(limit, 50), layers, ...(Object.keys(filters).length ? { filters } : {}) }).then((r) => r?.passages || []).catch(() => [])));
  const seen = new Set();
  // the author filter holds on every layer: the phrase / HyPE layers returned a May Maxwell obituary and Star of the West issues for
  // "'Abdu'l-Bahá" (11-11)
  const byAuthor = (p) => !auts.length || !p.author || (auts.some((a) => authorKey(p.author).includes(authorKey(a))));
  return lists.flat().filter((p) => { const k = p.id ?? p.text; if (seen.has(k) || !byAuthor(p)) return false; seen.add(k); return true; });
}

/** Meaning matches in the reader's language (11-11: a Persian original was quoted to an English reader while its Tablets of the Divine
 *  Plan translation is linked to it): another-language passage → its linked translation; none linked → dropped while others remain. */
async function inLanguage(rows, language, ctx) {
  const lang = String(language).toLowerCase().slice(0, 2);
  const other = rows.filter((p) => p.language && String(p.language).toLowerCase().slice(0, 2) !== lang);
  if (!other.length) return rows;
  let links = new Map();
  try { links = await (await repo(ctx, 'resolveLinks', '../passage-links.js'))(other.map((p) => p.id), { quotedBy: false }); } catch { links = new Map(); }
  const swap = (p) => {
    if (!other.includes(p)) return p;
    const t = (links.get(Number(p.id))?.translations || []).find((x) => String(x.language || '').toLowerCase().slice(0, 2) === lang);
    return t ? { id: t.id, document_id: t.documentId, paragraph_index: t.paragraphIndex, text: t.text, title: t.document?.title ?? null, author: t.document?.author ?? null,
      religion: t.document?.religion ?? null, language: t.language, url: t.url ?? null, translation_of: p.id } : null;
  };
  const seen = new Set();
  const out = rows.map(swap).filter((p) => p && !seen.has(Number(p.id)) && seen.add(Number(p.id)));
  return out.length ? out : rows;
}

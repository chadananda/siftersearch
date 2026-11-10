// quote_search internals (Chad 11-10: ONE "find quote" tool, filters for religion / author(s) / work(s); in-book find is just works:[id]).
// Literal first (accent/case/curly-quote folded), meaning fallback in 'auto'. Pure search: no wording, no shaping (quote-results shapes it).
// Deps (ctx.deps, else the repos): paragraphTexts, paragraphsByIds, withLinks, getDoc, findTitled; `fused` = the fused_search runner.
import { toPassage } from './tool-kit.js';
import { canonicalTradition } from './tradition-name.js';

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
const asList = (x) => (x == null || x === '' ? [] : Array.isArray(x) ? x : [x]);
const uniq = (l) => [...new Set(l)];
const authorKey = (a) => foldText(a).replace(/'/g, '');

/**
 * { query: phrase, mode = 'auto', religions[], authors[], works[] (ids or titles), from?, to?, limit } → { total, passages, mode_used, works }.
 * Filters AND across kinds, OR inside a list. Passages: toPassage + { doc_id, work, para_id, url, excerpt, found_by }.
 * works given → each work's paragraphs read whole (complete, reading order); none → the library by the literal layer.
 * mode_used: 'literal' | 'meaning' | 'none'. fused(args) = run('fused_search', args) (tools.js passes it).
 */
export async function quoteSearch({ query: phrase, mode = 'auto', religions = [], authors = [], works = [], from = null, to = null, limit } = {}, ctx = {}, fused = null) {
  const lo = from ?? 0, hi = to ?? 1e9;
  const rels = uniq(asList(religions).map((r) => canonicalTradition(r)).filter(Boolean)), auts = uniq(asList(authors).filter(Boolean));
  const link = async (ps) => { try { return await (await repo(ctx, 'withLinks', '../hit-links.js'))(ps); } catch { return ps; } };
  const getDoc = await repo(ctx, 'getDoc', '../docs-repo.js');
  // works → document ids: a number (or digit string) is an id, a title goes through the book finder
  const ids = [];
  for (const w of asList(works)) {
    if (/^\d+$/.test(String(w))) ids.push(Number(w));
    else { const f = await (await repo(ctx, 'findTitled', './works.js'))([String(w)]).catch(() => null); if (f?.doc?.id) ids.push(Number(f.doc.id)); }
  }
  const named = asList(works).length > 0;
  const docs = new Map();
  for (const id of uniq(ids)) docs.set(id, await Promise.resolve(getDoc(id)).catch(() => null));
  // the work's own religion / author must pass the other filters (AND)
  const docOk = (d) => (!rels.length || (d?.religion && rels.includes(canonicalTradition(d.religion)))) && (!auts.length || (d?.author && auts.some((a) => authorKey(d.author).includes(authorKey(a)))));
  const kept = [...docs.entries()].filter(([, d]) => docOk(d)).map(([id]) => id);
  const meta = (id) => ({ id, title: docs.get(id)?.title ?? null, author: docs.get(id)?.author ?? null, cover_url: docs.get(id)?.cover_url ?? null });
  const worksOut = kept.map(meta);
  const cap = Math.max(1, limit ?? (named ? 200 : 20));
  const shape = (p, how, text = p.text) => ({ ...p, doc_id: p.document_id ?? p.doc_id ?? null, work: p.title ?? null, para_id: p.id ?? null, url: p.url ?? p.source_url ?? null,
    excerpt: how === 'literal' ? excerptOf(text, phrase) : String(text || '').replace(/\s+/g, ' ').trim(), found_by: [how === 'literal' ? (named ? 'in_work' : 'literal') : 'meaning'] });
  let used = 'none', total = 0, passages = [];
  if (named && !kept.length) return { total, passages, mode_used: used, works: worksOut };
  // ── literal
  if (mode !== 'meaning') {
    let hits = [];
    if (named) {
      const texts = await repo(ctx, 'paragraphTexts', '../paragraphs-repo.js');
      for (const id of kept) hits.push(...((await texts(id, { from: lo, to: hi })) || []).filter((r) => !isHeading(r) && holdsWords(r.text, phrase)).map((r) => ({ ...r, __doc: id })));
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
    if (near.length) used = 'meaning';
    passages = (named ? near.sort((a, b) => (a.paragraph_index ?? 0) - (b.paragraph_index ?? 0)) : near).map((p) => shape(p, 'meaning'));
    total = passages.length;
  }
  return { total, passages, mode_used: used, works: worksOut };
}
// the fused_search runs one filter set per religion (the engine takes one tradition); authors and documents are lists there (any of them)
async function libraryRows(fused, query, { rels, auts, ids = [] }, layers, limit) {
  const sets = (rels.length ? rels : [null]).map((t) => ({ ...(t ? { tradition: t } : {}), ...(auts.length ? { author: auts } : {}), ...(ids.length ? { documentId: ids } : {}) }));
  const lists = await Promise.all(sets.map((filters) => fused({ query, limit: Math.min(limit, 50), layers, ...(Object.keys(filters).length ? { filters } : {}) }).then((r) => r?.passages || []).catch(() => [])));
  const seen = new Set();
  return lists.flat().filter((p) => { const k = p.id ?? p.text; if (seen.has(k)) return false; seen.add(k); return true; });
}

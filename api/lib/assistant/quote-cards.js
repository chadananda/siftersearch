// Passage cards for a researched reply (Chad 11-10: "quote blocks with tiny book images … handsome links back to key books"): each
// blockquote whose citation is one of the turn's sources → { url, key, work_id, title, author, place, cover_url }; Jev's named work
// cited in the reply → its book card(s). The client swaps the blockquote for the card; without the event the reply is unchanged.
// Deps: quote-blocks.js (shared with the clients), docs-repo listDocs (covers, one read by ids), hit-links workLinks (book urls).
import { quoteBlocks, foldQuote } from '../quote-blocks.js';
import { ANIS_ORIGIN as SITE } from '../anis-links.js';   // Anís output: the Anís host (Chad 11-14), never siftersearch.com
import { sowCoverUrl } from '../sow-links.js';

const abs = (u) => (u ? (/^https?:/.test(u) ? u : `${SITE}${u}`) : null);
const coverOf = (d) => abs(d.cover_url) ?? sowCoverUrl(d);   // a Star of the West issue: its page 1 scan, in place
const base = (u) => String(u || '').replace(/[#?].*$/, '');
const norm = (s) => ({ url: s?.url ?? s?.citation_url ?? s?.source_url ?? null, title: s?.title ?? s?.source_title ?? null, author: s?.author ?? s?.source_author ?? null,
  doc: Number(s?.document_id ?? s?.doc_id) || null, place: s?.place ?? null, text: s?.text ?? '' });

/** The place from the citation label once the work's title is taken off ("*Gleanings*, CXVII" → "CXVII"). Pure. */
export function placeOf(attribution, title) {
  const plain = String(attribution || '').replace(/\[((?:[^[\]]|\[[^\]]*\])*)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
  const t = String(title || '').replace(/[*_]/g, '').trim();
  let rest = null;
  if (t && foldQuote(plain).startsWith(foldQuote(t))) {
    // walk the plain label until its folded prefix covers the folded title
    for (let n = 1; n <= plain.length; n++) if (foldQuote(plain.slice(0, n)) === foldQuote(t)) { rest = plain.slice(n); break; }
  } else if (/,/.test(plain)) rest = plain.slice(plain.lastIndexOf(','));
  rest = String(rest ?? '').replace(/^[\s,;:·—–-]+/, '').trim();
  return rest && rest.length <= 60 ? rest : null;
}

/** blocks × sources → the source each block quotes: same url, else its text holds the quote's opening, else same page. Pure. */
export function matchBlocks(reply, sources) {
  const pool = (sources || []).map(norm).filter((s) => s.doc);
  return quoteBlocks(reply).filter((b) => b.url && b.body.trim()).map((b) => {
    const opening = b.key.split(' ').slice(0, 8).join(' ');
    const s = pool.find((p) => p.url && p.url === b.url) || (opening.split(' ').length >= 5 ? pool.find((p) => foldQuote(p.text).includes(opening)) : null)
      || pool.find((p) => p.url && base(p.url) === base(b.url));
    return s ? { block: b, source: s } : null;
  }).filter(Boolean);
}

const defaultDocs = async (ids) => (await (await import('../docs-repo.js')).listDocs({ ids, fields: ['id', 'title', 'author', 'year', 'cover_url'], count: false, limit: ids.length })).docs || [];
const defaultLinks = async (docs) => (await import('../hit-links.js')).workLinks(docs);

/**
 * → { cards, books }. cards: one per quoted blockquote with a source; books: the docs among the turn's sources whose title is the work
 * Jev named (units.named_work, resolved by code), at most 3. `docs(ids)` → rows with cover_url; `links(docs)` → Map(id → url).
 */
export async function quoteCards(reply, sources, { namedWork = null, docs = defaultDocs, links = defaultLinks } = {}) {
  const matched = matchBlocks(reply, sources);
  const pool = (sources || []).map(norm).filter((s) => s.doc);
  const name = foldQuote(namedWork);
  const named = name.length >= 3 ? [...new Set(pool.filter((s) => s.title && (foldQuote(s.title).includes(name) || name.includes(foldQuote(s.title)))).map((s) => s.doc))].slice(0, 3) : [];
  const ids = [...new Set([...matched.map((m) => m.source.doc), ...named])];
  if (!ids.length) return { cards: [], books: [] };
  const rows = new Map((await docs(ids).catch(() => [])).map((d) => [Number(d.id), d]));
  const cards = matched.map(({ block, source }) => {
    const d = rows.get(source.doc) || {};
    const title = d.title || source.title || null;
    return { url: block.url, key: block.key, work_id: source.doc, title, author: d.author || source.author || null,
      place: source.place || placeOf(block.attribution, title) || placeOf(block.attribution, source.title), cover_url: coverOf(d) };
  }).filter((c) => c.title);
  let books = [];
  // a book a quote card already shows (its cover beside the quote) gets no second card (Chad 11-12)
  const carded = new Set(cards.map((c) => Number(c.work_id)));
  if (named.length) {
    const ds = named.filter((id) => !carded.has(Number(id))).map((id) => rows.get(id)).filter(Boolean);
    const urls = await links(ds).catch(() => null);
    books = ds.map((d) => ({ id: d.id, title: d.title, author: d.author || null, year: d.year ?? null, url: urls?.get?.(d.id) ?? null, cover_url: coverOf(d),
      description: null, sufficient: false })).filter((b) => b.title && b.url);
  }
  return { cards, books };
}

/**
 * Cards for what an agent reply CITES by ref (no blockquote to swap): exactly ONE strategy passage not already carded by a quote block → a
 * `passage` card (the in-work convention: several hits stay a text list); a cited book_card book → its `book` card unless a card already
 * shows that work. → { passage: card|null, books: [book] }. `passages` are shaped like the turn's sources; `books` like titleAnswer's book.
 */
export async function refCards({ reply, passages = [], books = [] }, { docs = defaultDocs } = {}) {
  const blocks = matchBlocks(reply, passages);
  const carded = new Set(blocks.map((m) => m.source.doc)), blockUrls = new Set(blocks.map((m) => m.source.url));
  const open = passages.map((p) => ({ p, s: norm(p) })).filter(({ s }) => s.doc && s.url && !blockUrls.has(s.url));
  let passage = null;
  if (open.length === 1) {
    const { p, s } = open[0];
    const d = (await docs([s.doc]).catch(() => []))[0] || {};
    passage = { work_id: s.doc, title: d.title || s.title, author: d.author || s.author, cover_url: coverOf(d) ?? sowCoverUrl({ title: s.title }), url: s.url, place: s.place,
      excerpt: p.excerpt || String(s.text).replace(/⁅\/?[sp]\d+⁆/g, '').replace(/\s+/g, ' ').trim(), phrase: null };
    carded.add(s.doc);
  }
  return { passage, books: books.filter((b) => !carded.has(Number(b.id))) };
}

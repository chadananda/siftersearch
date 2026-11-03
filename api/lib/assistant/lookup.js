// Lookups fast path (W1, 11-03): a book name, quoted words or a numbered reference ("Gleanings 27") is found by CODE — title
// index, exact-phrase search, pn lookup — in parallel with triage; no planner, no agent, no extra model call. null = not
// (provably) a lookup → today's path. Confirmed by evidence only: a book in the index, the wording in a passage, the number in the book.
// Deps (injectable): work-request findWork, assistant/agent-search, paragraphs-repo paragraphsByPn, hit-links withLinks.
import { detectQuotation, stripMarkup } from '../quote-detect.js';
import { foldVerbatim } from '../search/verbatim.js';
import { findWork, findTitled } from './work-request.js';

const ROMAN = /^(?=[ivxlcdm]+$)m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/i;
const romanToInt = (r) => { const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }; let n = 0, p = 0;
  for (const c of r.toLowerCase().split('').reverse()) { n += v[c] < p ? -v[c] : v[c]; p = Math.max(p, v[c]); } return n; };
// Gleanings-style books number their sections in Roman capitals (pn "XXVII", "XXVII.2"): "Gleanings 27" asks for pn "XXVII" (live 11-03: it missed)
const toRoman = (n) => n > 0 && n < 4000 ? [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  .reduce((o, [v, r]) => { while (n >= v) { o += r; n -= v; } return o; }, '') : null;
const ASKY = /^(?:who|what|why|how|when|where|which|whose|is|are|was|were|does|do|did|can|could|should|would|will|tell|explain|define|describe|list|give|show|compare|summari[sz]e|i|my|me|we|hi|hello|hey|thanks?|thank|please|find|quote|translate)\b/i;

/** "Gleanings 27", "Hidden Words no. 12", "Gleanings section CXXVII" → { title, num } | null. Pure. */
export function parseReference(text) {
  const t = stripMarkup(text).replace(/[?.!]+$/, '').trim();
  const m = /^(?:the\s+)?([\p{L}][\p{L}'’‘ʼ.\- ]{2,60}?)[\s,]+(?:(?:no\.?|number|#|section|sec\.?|§|¶|para(?:graph)?\.?|passage|prayer|verse|tablet)\s*)?(\d{1,4}|[ivxlcdm]{1,8})$/iu.exec(t);
  if (!m || ASKY.test(m[1])) return null;
  const raw = m[2], num = /^\d+$/.test(raw) ? Number(raw) : ROMAN.test(raw) ? romanToInt(raw) : null;
  const title = m[1].replace(/[,\s]+$/, '').trim();
  return num && title.split(/\s+/).length <= 6 ? { title, num } : null;
}

/** Nothing but wording: 4–40 words, one sentence run, not a question or request. Pure. */
export function bareWording(text) {
  const t = stripMarkup(text).replace(/^["“„«]+|["”»]+$/g, '').trim();
  const w = t.split(/\s+/).filter(Boolean);
  if (w.length < 4 || w.length > 40 || /\?\s*$/.test(t) || ASKY.test(t) || /\n/.test(t)) return null;
  return t.replace(/[.!]+$/, '');
}

const ws = (s) => [...new Set(foldVerbatim(s).split(' ').filter(Boolean))];
/** Does the passage hold the wording (exact) or nearly all its words (near)? Pure. */
export function holds(text, phrase) {
  const f = foldVerbatim(text), want = foldVerbatim(phrase);
  if (!want) return { exact: false, near: false };
  const exact = f.includes(want), w = ws(phrase);
  return { exact, near: exact || w.filter((x) => ` ${f} `.includes(` ${x} `)).length >= Math.ceil(w.length * 0.7) };
}

/**
 * @returns {Promise<null | { kind: 'book', work } | { kind: 'quote', phrase, passages } | { kind: 'reference', passages, ref }>}
 */
export async function resolveLookup(messages, deps = {}) {
  const text = String([...messages].reverse().find((m) => m.role === 'user')?.content || '').trim();
  if (!text || text.length > 600) return null;
  const t0 = Date.now(), done = (r) => r && { ...r, ms: Date.now() - t0 };
  const ref = parseReference(text);
  if (ref) {
    const w = await (deps.findTitled || findTitled)([ref.title], { min: 0.9 }).catch(() => null);
    if (w) {
      const { paragraphsByPn } = deps.paragraphsByPn ? { paragraphsByPn: deps.paragraphsByPn } : await import('../paragraphs-repo.js');
      let rows = [];
      for (const pn of [ref.num, toRoman(ref.num)].filter(Boolean)) { rows = await paragraphsByPn(w.doc.id, pn).catch(() => []); if (rows.length) break; }
      if (rows.length === 1 && String(rows[0].text || '').trim()) {
        const r = rows[0], link = deps.withLinks || (await import('../hit-links.js')).withLinks;
        const [h] = await link([{ id: r.id, doc_id: w.doc.id, paragraph_index: r.paragraph_index, text: r.text, title: w.doc.title }]).catch(() => [null]);
        return done({ kind: 'reference', ref, work: w, passages: [{ id: r.id, text: r.text, title: w.doc.title, author: w.doc.author, document_id: w.doc.id,
          paragraph_index: r.paragraph_index, religion: w.doc.religion, collection: w.doc.collection, language: w.doc.language, source_url: h?.url || null }] });
      }
    }
    // a number after a name that is no numbered book ("Hidden Words 2024"?) falls through to the book / quote rules
  }
  const work = await (deps.findWork || findWork)(text).catch(() => null);
  if (work) return done({ kind: 'book', work });
  const q = detectQuotation(text);
  const phrase = q?.phrase || bareWording(text);
  if (!phrase) return null;
  const search = deps.search || (await import('./agent-search.js')).agentSearch();
  const hits = await search(phrase, null, 10).catch(() => []);
  const scored = hits.map((h) => ({ h, ...holds(h.text, phrase) }));
  // quoted / framed wording: nearly all its words in a passage; bare wording: the whole phrase (a topic sentence must not pass as a quotation)
  const ok = scored.filter((x) => (q ? x.near : x.exact));
  if (!ok.length) return null;
  ok.sort((a, b) => Number(b.exact) - Number(a.exact));
  return done({ kind: 'quote', phrase, passages: ok.slice(0, 5).map((x) => x.h) });
}

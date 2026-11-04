// Lookups fast path (W1, 11-03): JEV decides a message is a lookup (book / quote / reference) and this file RESOLVES it by CODE —
// title index, exact-phrase search, pn / heading number; no planner, no agent. Never reads intent from wording. null = not
// (provably) found → today's path. Confirmed by evidence only: a book in the index, the wording in a passage, the number in the book.
// Deps (injectable): work-request findWork, assistant/agent-search, paragraphs-repo paragraphsByPn, hit-links withLinks.
import { detectQuotation, stripMarkup } from '../quote-detect.js';
import { foldVerbatim } from '../search/verbatim.js';
import { findTitled, titleCandidates } from './work-request.js';
import { sectionRange } from './numbering.js';
import { isCoreLiterature } from '../rights/canonical.js';
import { getAuthority } from '../authority.js';

const ROMAN = /^(?=[ivxlcdm]+$)m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/i;
const romanToInt = (r) => { const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }; let n = 0, p = 0;
  for (const c of r.toLowerCase().split('').reverse()) { n += v[c] < p ? -v[c] : v[c]; p = Math.max(p, v[c]); } return n; };
// Gleanings-style books number their sections in Roman capitals (pn "XXVII", "XXVII.2"): "Gleanings 27" asks for pn "XXVII" (live 11-03: it missed)
const toRoman = (n) => n > 0 && n < 4000 ? [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  .reduce((o, [v, r]) => { while (n >= v) { o += r; n -= v; } return o; }, '') : null;
/** "Gleanings 27", "Hidden Words no. 12", "Gleanings section CXXVII" → { title, num } | null. Pure. */
export function parseReference(text) {
  const t = stripMarkup(text).replace(/[?.!]+$/, '').trim();
  const m = /^(?:the\s+)?([\p{L}][\p{L}'’‘ʼ.\- ]{2,60}?)[\s,]+(?:(?:no\.?|number|#|section|sec\.?|§|¶|para(?:graph)?\.?|passage|prayer|verse|tablet)\s*)?(\d{1,4}|[ivxlcdm]{1,8})$/iu.exec(t);
  if (!m) return null;
  const raw = m[2], num = /^\d+$/.test(raw) ? Number(raw) : ROMAN.test(raw) ? romanToInt(raw) : null;
  const title = m[1].replace(/[,\s]+$/, '').trim();
  return num && title.split(/\s+/).length <= 6 ? { title, num } : null;
}

/** The number a heading carries ("Chapter 33", "XXXIII. On ...", "33 — ...", "Verse 183"), or null. Pure. */
export function headingNumber(h) {
  const m = /^\s*(?:(?:chapter|section|part|talk|lesson|verse|prayer|tablet|no\.?|number|#)\s*)?(\d{1,4}|[ivxlcdm]{1,8})(?=$|[\s.:)\-–—,])/i.exec(String(h || ''));
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : ROMAN.test(m[1]) ? romanToInt(m[1]) : null;
}
/** The one heading-start whose heading carries number n (more than one = ambiguous = null). Pure. */
export function byHeadingNumber(starts, n) {
  const hit = starts.filter((r) => headingNumber(r.heading) === n);
  return hit.length === 1 ? hit[0] : null;
}

const ws = (s) => [...new Set(foldVerbatim(s).split(' ').filter(Boolean))];
/** Does the passage hold the wording (exact) or nearly all its words (near)? Pure. */
export function holds(text, phrase) {
  const f = foldVerbatim(text), want = foldVerbatim(phrase);
  if (!want) return { exact: false, near: false };
  const exact = f.includes(want), w = ws(phrase);
  return { exact, near: exact || w.filter((x) => ` ${f} `.includes(` ${x} `)).length >= Math.ceil(w.length * 0.7) };
}

const passageOf = (doc, row, url) => ({ id: row.id, text: row.text, title: doc.title, author: doc.author, document_id: doc.id,
  paragraph_index: row.paragraph_index, religion: doc.religion, collection: doc.collection, language: doc.language, source_url: url || null });
/** Works that number chapters/talks only by order (SAQ, Paris Talks): numbering.js's per-edition table → the chapter's
 *  opening paragraphs (heading rows dropped). The edition must be the work Jev's title matched or one of its other copies. */
async function bySectionTable(w, ref, deps, link) {
  const doc = [w.doc, ...(w.others || [])].find((d) => d && sectionRange(d, ref.num));
  if (!doc) return null;
  const section = sectionRange(doc, ref.num);
  const inRange = deps.paragraphsInRange || (await import('../paragraphs-repo.js')).paragraphsInRange;
  const rows = (await inRange(doc.id, section.from, section.to).catch(() => []))
    .filter((r) => String(r.text || '').trim() && !/^\s*#/.test(r.text) && !(r.heading && r.text.trim() === r.heading.trim())).slice(0, 3);
  if (!rows.length) return null;
  const linked = await link(rows.map((r) => ({ id: r.id, doc_id: doc.id, paragraph_index: r.paragraph_index, text: r.text, title: doc.title }))).catch(() => []);
  return { kind: 'reference', ref, section, work: { ...w, doc }, passages: rows.map((r, i) => passageOf(doc, r, linked[i]?.url)) };
}

const quoteStrip = (t) => stripMarkup(t).replace(/^["“„«'‘\s]+|["”»'’.!?\s]+$/g, '').trim();

/**
 * Resolves what JEV named (intent 'book' | 'quote' | 'reference'; the caller never infers it from wording). The only judgement
 * here is evidence: the title exists, the wording is in a passage, the number is in the book.
 * @returns {Promise<null | { kind: 'book', work } | { kind: 'quote', phrase, passages } | { kind: 'reference', passages, ref }>}
 */
export async function resolveLookup(messages, deps = {}) {
  const intent = deps.intent;
  const text = String([...messages].reverse().find((m) => m.role === 'user')?.content || '').trim();
  if (!text || text.length > 600 || !['book', 'quote', 'reference'].includes(intent)) return null;
  const t0 = Date.now(), done = (r) => r && { ...r, ms: Date.now() - t0 };
  const titled = deps.findTitled || findTitled;
  const bookOf = async (opts) => {
    const cands = [...new Set([quoteStrip(text), ...titleCandidates(text)].filter(Boolean))];
    const w = await titled(cands, opts).catch(() => null);
    return w ? done({ kind: 'book', work: w }) : null;
  };
  if (intent === 'reference') {
    const ref = parseReference(text);
    const w = ref && await titled([ref.title], { min: 0.9 }).catch(() => null);
    if (!w) return null;
    const repo = deps.paragraphsByPn ? {} : await import('../paragraphs-repo.js');
    let row = null;
    for (const pn of [ref.num, toRoman(ref.num)].filter(Boolean)) {
      const rows = await (deps.paragraphsByPn || repo.paragraphsByPn)(w.doc.id, pn).catch(() => []);
      if (rows.length === 1) { row = rows[0]; break; }
    }
    // no display numbers (Dhammapada, Paris Talks, SAQ): the work's own chapter headings carry the number
    if (!row) row = byHeadingNumber(await (deps.headingStarts || repo.headingStarts || (await import('../paragraphs-repo.js')).headingStarts)(w.doc.id).catch(() => []), ref.num);
    const link = deps.withLinks || (await import('../hit-links.js')).withLinks;
    if (!row) return done(await bySectionTable(w, ref, deps, link));
    if (!String(row.text || '').trim()) return null;
    const [h] = await link([{ id: row.id, doc_id: w.doc.id, paragraph_index: row.paragraph_index, text: row.text, title: w.doc.title }]).catch(() => [null]);
    return done({ kind: 'reference', ref, work: w, passages: [{ id: row.id, text: row.text, title: w.doc.title, author: w.doc.author, document_id: w.doc.id,
      paragraph_index: row.paragraph_index, religion: w.doc.religion, collection: w.doc.collection, language: w.doc.language, source_url: h?.url || null }] });
  }
  if (intent === 'book') return bookOf({ min: 0.86 });
  // quote: Jev saw wording to find. Two things can answer it: a work whose TITLE is the wording ("Epistle to the Son of the Wolf")
  // and passages that HOLD the wording ("the earth is but one country" — also a book title; launch gate 11-03 opened the book).
  // Code only gathers the candidates; when both exist Jev chooses with both in view.
  const phrase = detectQuotation(text)?.phrase || quoteStrip(text);
  const search = phrase ? deps.search || (await import('./agent-search.js')).agentSearch() : null;
  const [b, hits] = await Promise.all([
    quoteStrip(text).split(/\s+/).length <= 10 ? bookOf({ min: 0.97, prefix: false }) : null,
    search ? search(phrase, null, 10).catch(() => []) : []]);
  // a title-match that is a stub (a prayer or fragment whose TITLE is its first line, doc 28444 "Be generous in prosperity…") is the wording itself, not a work
  // … and only a CORE work's title competes with the wording (Chad 11-03: Adamson's "The Earth Is But One Country" is commentary
  // and must not stand beside Bahá'u'lláh's line). Work level: the book's author, shelf and authority. An explicit book request
  // (intent 'book' above) still searches every work.
  const book = b && (b.work.doc.paragraph_count ?? 99) >= 20 && coreWork(b.work.doc) ? b : null;
  // only CORE literature makes a quote candidate (Chad 11-03): a line held only by commentary, a talk or a pilgrim note is not
  // a quotation to source here (those books are still cited later in answers; only this candidate step is scoped)
  const ok = hits.filter(isCoreLiterature).map((h) => ({ h, ...holds(h.text, phrase) })).filter((x) => x.near).sort((a, b2) => Number(b2.exact) - Number(a.exact));
  const quote = ok.length ? done({ kind: 'quote', phrase, passages: ok.slice(0, 5).map((x) => x.h) }) : null;
  if (!book || !quote) return book || quote;
  const pick = await (deps.pickQuoteOrBook || pickQuoteOrBook)(messages, { book, quote }, { profile: deps.profile, onJev: deps.onJev,
    fetchImpl: deps.fetchImpl || (await import('../systemone.js')).jevFetch('anis-quote-or-book') });
  const choice = pick?.choice && (pick.confidence ?? 0) >= MIN_JEV ? pick.choice : null;
  // no confident answer: Jev's own lookup call for this turn was 'quote', so the passages stand
  const chosen = choice === 'book' ? book : quote;
  deps.decisions?.record('lookup:quote-or-book', { by: choice ? 'jev' : 'code', saw: { phrase, book: book.work.doc.title, passages: quote.passages.length },
    options: ['quote', 'book'], probabilities: pick?.distribution ?? null, chosen: chosen.kind,
    reason: choice ? null : !pick ? 'no answer (see jev:timeout when it timed out): Jev\'s lookup call (quote) stands' : 'low confidence: Jev\'s lookup call (quote) stands', ms: pick?.ms ?? null });
  return { ...chosen, ms: Date.now() - t0, contested: { book: book.work.doc.id, quote: quote.passages.length, by: choice ? 'jev' : 'lookup intent' } };
}

// a work is core literature by the same rule as a passage (rights/canonical.js isCoreLiterature), its author being the book's
const coreWork = (doc) => { let a = doc.book_authority; if (a == null) { try { a = getAuthority(doc); } catch { a = null; } }
  return isCoreLiterature({ ...doc, book_authority: a }); };
const MIN_JEV = 0.6;
/** Jev's typed choice between the two candidates of a quote lookup: the book whose title is the words, or the passages holding them.
 *  → { choice: 'quote'|'book', confidence, distribution, ms } | null (no key / timeout / failure). */
export async function pickQuoteOrBook(messages, { book, quote }, { profile = {}, fetchImpl, apiKey = process.env.TYPESAFE_API_KEY, onJev = null, ...limits } = {}) {
  if (!apiKey || !fetchImpl) return null;
  const [{ ENDPOINT }, { modelFor }, { stateOf }, { jevCall, JEV_LIMITS }] = await Promise.all([import('../scope-extract.js'), import('../model-roles.js'),
    import('./strategy-choice.js'), import('./jev-call.js')]);
  const d = book.work.doc, p = quote.passages[0] || {};
  const criteria = {
    book: `the reader wants the work titled "${d.title}"${d.author ? ` by ${d.author}` : ''} (${d.paragraph_count ?? '?'} paragraphs) — to open or read the book itself`,
    quote: `the reader wants the passage that says these words ("${String(p.text || '').slice(0, 220)}" — ${p.title || 'a passage'}${p.author ? `, ${p.author}` : ''}): where they come from, the source`,
  };
  const t0 = Date.now();
  const call = await jevCall('lookup', async (signal) => {
    const res = await fetchImpl(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelFor('assistant-triage').model, state: stateOf(messages, { profile }),
        questions: { target: { type: 'choice', instructions: 'The reader\'s words are both a book title in the library and words found in a passage. Which does the reader want, read with the conversation?', criteria } } }),
      signal });
    return res.ok ? (await res.json()).answers?.target ?? null : null;
  }, { ...JEV_LIMITS.lookup, ...limits, onJev });
  const a = call.value;
  return a ? { choice: a.choice ?? a.value ?? null, confidence: a.confidence ?? a.distribution?.[a.choice ?? a.value] ?? null, distribution: a.distribution ?? null, ms: Date.now() - t0 } : null;
}

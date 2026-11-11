// Lookups fast path (W1, 11-03): JEV decides a message is a lookup (book / quote / reference) and this file RESOLVES it by CODE —
// title index, exact-phrase search, pn / heading number; no planner, no agent. Never reads intent from wording. null = not
// (provably) found → today's path. Confirmed by evidence only: a book in the index, the wording in a passage, the number in the book.
// Deps (injectable): work-request findWork, assistant/agent-search, paragraphs-repo paragraphsByPn, hit-links withLinks;
// quote order = source-hunt rankOrigins (the words' author's own work first).
import { detectQuotation, stripMarkup } from '../quote-detect.js';
import { foldVerbatim } from '../search/verbatim.js';
import { findTitled, titleCandidates, coreWork } from './work-request.js';
import { sectionRange, verseWork, versePlace } from './numbering.js';
import { isCoreLiterature } from '../rights/canonical.js';
import { firstPerson } from '../authorship/reader.js';
import { authorAuthority } from '../authority.js';
import { isPeriodical, traceQuote } from './quote-origin.js';
import { render } from './activities/templates.js';

const ROMAN = /^(?=[ivxlcdm]+$)m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/i;
const romanToInt = (r) => { const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }; let n = 0, p = 0;
  for (const c of r.toLowerCase().split('').reverse()) { n += v[c] < p ? -v[c] : v[c]; p = Math.max(p, v[c]); } return n; };
// Gleanings-style books number their sections in Roman capitals (pn "XXVII", "XXVII.2"): "Gleanings 27" asks for pn "XXVII" (live 11-03: it missed)
const toRoman = (n) => n > 0 && n < 4000 ? [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  .reduce((o, [v, r]) => { while (n >= v) { o += r; n -= v; } return o; }, '') : null;
/** "Gleanings 27", "Hidden Words no. 12", "Gleanings section CXXVII" → { title, num } | null. Pure. */
export function parseReference(text) {
  const t = stripMarkup(text).replace(/[?.!]+$/, '').trim();
  // "Gleanings 27", "Dawn-Breakers chapter 25", "Dawn-Breakers - Chapter 25" … and "chapter 25 of The Dawn-Breakers" (11-11: "chapter"
  // was not a unit word, so "Dawn-Breakers chapter" became the title and the turn fell through to an essay)
  const UNIT = "no\\.?|number|#|chapter|ch\\.?|section|sec\\.?|§|¶|para(?:graph)?\\.?|passage|prayer|verse|tablet|talk|letter|lesson|part";
  const m = ((r) => r && [r[0], r[1], r[3], r[2]])(new RegExp(`^(?:the\\s+)?([\\p{L}][\\p{L}'’‘ʼ.\\- ]{2,60}?)[\\s,:\\-–—]+(?:(${UNIT})\\s*)?(\\d{1,4}|[ivxlcdm]{1,8})$`, 'iu').exec(t))
    || ((r) => r && [r[0], r[3], r[2], r[1]])(new RegExp(`^(?:the\\s+)?(${UNIT})\\s*(\\d{1,4}|[ivxlcdm]{1,8})\\s+(?:of|in|from)\\s+(?:the\\s+)?([\\p{L}][\\p{L}'’‘ʼ.\\- ]{2,60})$`, 'iu').exec(t));
  if (!m) return null;
  const raw = m[2], num = /^\d+$/.test(raw) ? Number(raw) : ROMAN.test(raw) ? romanToInt(raw) : null;
  const title = m[1].replace(/[,\s:\-–—]+$/, '').trim();
  // the unit word, when it names a whole division ("chapter 25" is a chapter, never paragraph 25)
  const unit = /^(?:chapter|ch|section|sec|§|part|talk|lesson|letter|tablet)/i.exec(m[3] || '')?.[0].toLowerCase().replace(/^ch$/, 'chapter').replace(/^sec$/, 'section');
  return num && title.split(/\s+/).length <= 6 ? { title, num, ...(unit ? { unit } : {}) } : null;
}

/** The number a heading carries ("Chapter 33", "XXXIII. On ...", "33 — ...", "Verse 183"), or null. Pure. */
export function headingNumber(h) {
  const m = /^\s*(?:\[pg\s*\d+\]\s*)*(?:(?:chapter|section|part|talk|lesson|verse|prayer|tablet|no\.?|number|#)\s*)?(\d{1,4}|[ivxlcdm]{1,8})(?=$|[\s.:)\-–—,])/i.exec(String(h || ''));
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
  paragraph_index: row.paragraph_index, heading: row.heading ?? null, religion: doc.religion, collection: doc.collection, language: doc.language, source_url: url || null });
/** Works that number chapters/talks only by order (SAQ, Paris Talks): numbering.js's per-edition table → the chapter's
 *  opening paragraphs (heading rows dropped). The edition must be the work Jev's title matched or one of its other copies. */
async function bySectionTable(w, ref, deps, link) {
  const doc = [w.doc, ...(w.others || [])].find((d) => d && sectionRange(d, ref.num));
  if (!doc) return null;
  const section = sectionRange(doc, ref.num);
  const inRange = deps.paragraphsInRange || (await import('../paragraphs-repo.js')).paragraphsInRange;
  const rows = (await inRange(doc.id, section.from, section.to).catch(() => [])).filter(isBookText);   // the whole chapter
  if (!rows.length) return null;
  const linked = await link(rows.map((r) => ({ id: r.id, doc_id: doc.id, paragraph_index: r.paragraph_index, text: r.text, title: doc.title }))).catch(() => []);
  return { kind: 'reference', ref, section, exact: true, label: `${doc.title}, ${section.unit} ${ref.num}`, work: { ...w, doc },
    passages: rows.map((r, i) => passageOf(doc, r, linked[i]?.url)) };
}

/** A row that is the book's own text (not empty, not a heading row). Pure. */
const isBookText = (r) => {
  const t = String(r?.text || '').trim();
  return !!t && !/^\s*#/.test(t) && r.blocktype !== 'heading' && !(r.heading && t === String(r.heading).trim());
};
/** block_attrs.pn of a row (JSON string or object), or null. Pure. */
export const pnOf = (r) => {
  let a = r?.block_attrs;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } }
  return a && a.pn != null ? a.pn : null;
};
const RUN_CHUNK = 60, RUN_MAX = 400;
/** The rows from `start` on while keep(row) holds (a section, a chapter), read in chunks through the repo. */
async function runFrom(docId, start, inRange, keep) {
  const out = [];
  for (let from = start; out.length < RUN_MAX; from += RUN_CHUNK) {
    const rows = await inRange(docId, from, from + RUN_CHUNK - 1, { limit: RUN_CHUNK }).catch(() => []);
    if (!rows.length) break;
    for (const r of rows) { if (!keep(r)) return out; out.push(r); }
  }
  return out;
}
const SHORT_VERSE = 10;   // words: a verse this short is shown with its neighbours
/** Works numbered by verse straight through (numbering.js VERSE_WORKS): the edition's chapter headings place chapter c; verse n is
 *  counted inside it. Exact when the chapter has one paragraph per verse; otherwise the nearest rows, marked approximate. */
async function byVerseTable(w, ref, heads, inRange) {
  const t = verseWork(w.doc), place = versePlace(t, ref.num);
  if (!place) return null;
  const startOf = new Map();
  for (const h of heads) {
    const n = headingNumber(h.heading);
    if (n != null && n >= 1 && n <= t.chapters.length && !(startOf.get(n) <= h.paragraph_index)) startOf.set(n, h.paragraph_index);
  }
  if (startOf.size !== t.chapters.length) return null;   // the edition's headings do not carry the chapters: not this layout
  const rows = (await runFrom(w.doc.id, startOf.get(place.chapter), inRange, (r) => headingNumber(r.heading) === place.chapter)).filter(isBookText);
  if (!rows.length) return null;
  const label = `${w.doc.title}, ${t.unit} ${ref.num}`;
  if (rows.length === place.verses) {
    const r = rows[place.offset], short = String(r.text).split(/\s+/).filter(Boolean).length < SHORT_VERSE;
    return { doc: w.doc, rows: short ? rows.slice(Math.max(0, place.offset - 1), place.offset + 2) : [r], extra: { label, exact: true } };
  }
  const i = Math.min(rows.length - 1, Math.round(place.offset * rows.length / place.verses));
  return { doc: w.doc, rows: rows.slice(Math.max(0, i - 1), i + 2),
    extra: { label, exact: false, approx: { unit: t.unit, chapter: place.chapter, verses: place.verses, paragraphs: rows.length } } };
}

const PAGE_MARK = /\[pg\s*\d+\]\s*/gi;
/** The writer's instruction for a numbered reference: the passage itself, verbatim, in one blockquote. Pure. */
export function referenceHow(r) {   // words = template rows (strategy-seed.js); slots filled here
  const label = r?.label || `${r?.work?.doc?.title || 'the work'} ${r?.ref?.num ?? ''}`.trim();
  const approx = r?.exact === false && r.approx ? render('lookup.reference.approx', { unit: r.approx.unit, chapter: r.approx.chapter }) : '';
  return render('lookup.reference.how', { label, approx });
}

/** The reply for a numbered reference, checked: when its blockquotes do not hold every passage whole, code writes it — the
 *  passages verbatim in one blockquote with the linked citation (and the approximate-place line when the edition is unnumbered). */
export function ensureWholeReference(text, r) {
  const ps = (r?.passages || []).filter((p) => String(p.text || '').trim());
  if (!ps.length) return text;
  const quoted = foldVerbatim(String(text || '').split('\n').filter((l) => /^\s*>/.test(l)).map((l) => l.replace(/^\s*>\s?/, '')).join(' ').replace(PAGE_MARK, ''));
  if (ps.every((p) => quoted.includes(foldVerbatim(String(p.text).replace(PAGE_MARK, ''))))) return text;
  const label = r.label || `${ps[0].title} ${r.ref?.num ?? ''}`.trim(), url = ps[0].source_url;
  const lines = [];
  if (r.exact === false && r.approx) lines.push(`This edition does not number its ${r.approx.unit}s, so the place is approximate: counted within chapter ${r.approx.chapter}.`, '');
  ps.forEach((p, i) => {
    if (i) lines.push('>');
    for (const l of String(p.text).replace(PAGE_MARK, '').trim().split(/\n+/)) lines.push(`> ${l.trim()}`);
  });
  lines.push('>', `> — ${url ? `[${label}](${url})` : label}`);
  return lines.join('\n');
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
    // which step resolved the reference (11-11: "Dawn-Breakers - Chapter 25" fell to search and the trace could not say why)
    const step = (via, r) => { deps.decisions?.record('lookup:reference', { by: 'code', saw: { ref, work: w ? `${w.doc.id} ${w.doc.title}` : null },
      options: ['display number', 'verse table', 'chapter heading', 'section table', 'none'], chosen: r ? via : 'none', reason: r ? `${r.passages?.length ?? 0} passages` : via }); return r; };
    if (!w) return step(ref ? 'work not found' : 'no reference pattern', null);
    // a numbered reference answers with the WHOLE numbered unit (Chad 11-04: "Gleanings 27" is all of section XXVII, never one line)
    const repo = deps.paragraphsByPn && deps.paragraphsInRange && deps.headingStarts ? {} : await import('../paragraphs-repo.js');
    const byPn = deps.paragraphsByPn || repo.paragraphsByPn, inRange = deps.paragraphsInRange || repo.paragraphsInRange;
    const starts = deps.headingStarts || repo.headingStarts;
    const link = deps.withLinks || (await import('../hit-links.js')).withLinks;
    const answer = async (doc, rows, extra) => {
      const keep = rows.filter(isBookText);
      if (!keep.length) return null;
      const linked = await link(keep.map((r) => ({ id: r.id, doc_id: doc.id, paragraph_index: r.paragraph_index, text: r.text, title: doc.title }))).catch(() => []);
      return done({ kind: 'reference', ref, work: { ...w, doc }, exact: true, ...extra, passages: keep.map((r, i) => passageOf(doc, r, linked[i]?.url)) });
    };
    // 1. display numbers (pn): the numbered paragraph and the rest of ITS section (Gleanings pn "XXVII" → "XXVII.2" … "XXVII.6");
    //    a work numbered by paragraph (pn "27", next "28") stays that one paragraph
    const byDisplay = async () => {
      for (const pn of [ref.num, toRoman(ref.num)].filter(Boolean)) {
        const rows = await byPn(w.doc.id, pn).catch(() => []);
        if (rows.length !== 1) continue;
        const first = rows[0];
        const section = await runFrom(w.doc.id, first.paragraph_index, inRange, (r) => r.paragraph_index === first.paragraph_index
          || (pnOf(r) != null ? String(pnOf(r)).startsWith(`${pn}.`) : (r.heading || '') === (first.heading || '')));
        return step('display number', await answer(w.doc, section.length ? section : [first], { label: `${w.doc.title}, ${pn}` }));
      }
      return undefined;
    };
    // a named division ("chapter 25") is a chapter first: paragraph 25 answered "Dawn-Breakers - Chapter 25" with one line (11-11)
    if (!ref.unit) { const r = await byDisplay(); if (r !== undefined) return r; }
    const heads = await (starts ? starts(w.doc.id).catch(() => []) : []);
    // 2. works numbered by verse straight through (Dhammapada 183 = verse 183, not chapter 183): counted inside the edition's chapter
    const verse = !ref.unit && await byVerseTable(w, ref, heads, inRange);
    if (verse) return step('verse table', await answer(verse.doc, verse.rows, verse.extra));
    // 3. numbered chapter headings: every row under that heading
    const row = byHeadingNumber(heads, ref.num);
    if (row) {
      const rows = await runFrom(w.doc.id, row.paragraph_index, inRange, (r) => (r.heading || '') === (row.heading || ''));
      return step('chapter heading', await answer(w.doc, rows.length ? rows : [row], { label: `${w.doc.title}, ${ref.num}` }));
    }
    // 4. chapters numbered only by order (numbering.js tables: SAQ, Paris Talks)
    const sec = done(await bySectionTable(w, ref, { ...deps, paragraphsInRange: inRange }, link));
    if (sec) return step('section table', sec);
    if (ref.unit) { const r = await byDisplay(); if (r !== undefined) return r; }
    return step(`no numbered unit ${ref.num} (${heads.length} headings)`, null);
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
  const ok = await quoteCandidates(hits, phrase, search);
  // the ORIGIN among them (quote-origin.js, Chad 11-04): the Guardian's translation of the author's own work first, the Tablet's
  // name, the original-language line, a short "also quoted in"; periodicals never the source. Injected search (tests) → no
  // library metadata reads unless the deps give them.
  const origin = ok.length ? await traceQuote(ok, { phrase, ...(deps.search ? { translatorsOf: deps.translatorsOf || null, originalsOf: deps.originalsOf || null } : {}) })
    .catch((err) => { console.warn('anis quote origin failed', err?.message); return null; }) : null;
  const quote = ok.length ? done({ kind: 'quote', phrase, passages: ok.slice(0, 5), ...(origin ? { origin } : {}) }) : null;
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

/** The core passages that hold the wording, the SOURCE first (Chad's standing rule, 11-03: the work by the author of the words
 *  beats a work that quotes them; then the quoting work's author by standing; the best published edition among equals). The
 *  order is source-hunt's rankOrigins — the one origin ranking — over search hits: the paragraph's writer (`author`) against
 *  the book's (`book_author`). Search order alone put The World Order of Bahá'u'lláh (Shoghi Effendi quoting the line) and a
 *  Bahá'í World volume ahead of Gleanings CXVII / the Tablet of Maqṣúd. When no hit is the writer's OWN work (a line quoted by
 *  many books crowds its source out of the first ten), one more search inside that writer's texts, as source-hunt does. */
export async function quoteCandidates(hits, phrase, search = null) {
  const { rankOrigins, quoteAuthorOf } = await import('../source-hunt.js');
  const canon = (n) => firstPerson(n || '') || n || null;
  const seen = new Set();
  const cands = (list) => list.filter(isCoreLiterature).map((h) => ({ h, ...holds(h.text, phrase) })).filter((x) => x.near).map(({ h, exact }) => {
    const writer = h.author || null, book = h.book_author || writer;
    return { ...h, holds: exact, overlap: exact ? 1 : 0, writer, book_author: book, authority: authorAuthority(writer) ?? 0,
      ownWork: !!writer && canon(writer) === canon(book) && h.blocktype !== 'footnote' && !isPeriodical(h), _hit: h };   // a periodical's excerpt is never the writer's own work
  }).filter((c) => { const k = c.id ?? c._hit; if (seen.has(k)) return false; seen.add(k); return true; });
  const pool = cands(hits);
  const quoteAuthor = pool.length ? quoteAuthorOf(pool) : null;
  if (quoteAuthor && search && !pool.some((c) => c.holds && c.ownWork && canon(c.writer) === quoteAuthor)) {
    pool.push(...cands(await search(phrase, null, 10, { author: quoteAuthor }).catch(() => [])));
  }
  return rankOrigins(pool, quoteAuthor).map((c) => c._hit);
}

const MIN_JEV = 0.6;
/** Jev's typed choice between the two candidates of a quote lookup: the book whose title is the words, or the passages holding them.
 *  → { choice: 'quote'|'book', confidence, distribution, ms } | null (no key / timeout / failure). */
export async function pickQuoteOrBook(messages, { book, quote }, { profile = {}, fetchImpl, apiKey = process.env.TYPESAFE_API_KEY, onJev = null, ...limits } = {}) {
  if (!apiKey || !fetchImpl) return null;
  const [{ ENDPOINT }, { modelFor }, { stateOf }, { jevCall, JEV_LIMITS }] = await Promise.all([import('../scope-extract.js'), import('../model-roles.js'),
    import('./strategy-choice.js'), import('./jev-call.js')]);
  // p = the SOURCE (quoteCandidates puts the words' own author's work first); named by the work's author, the writer only when quoted
  const d = book.work.doc, p = quote.passages[0] || {}, by = p.book_author || p.author;
  const quoting = p.author && by && p.author !== by ? ` (quoting ${p.author})` : '';
  const criteria = {
    book: `the reader wants the work titled "${d.title}"${d.author ? ` by ${d.author}` : ''} (${d.paragraph_count ?? '?'} paragraphs) — to open or read the book itself`,
    quote: `the reader wants the passage that says these words ("${String(p.text || '').slice(0, 220)}" — ${p.title || 'a passage'}${by ? `, ${by}${quoting}` : ''}): where they come from, the source`,
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

// THE BOOK FINDER (Chad 11-10): ONE indexed search over documents AND sub-documents (sections), fuzzy enough that most
// requests need no LLM to name the work. `bookCandidates(message)` scores the WHOLE message against every work's title,
// author/compiler, collection and listed other names (config/work-names.json), and every section title (with its book),
// diacritics and apostrophes folded ("Baha'u'llah" = "Bahá’u’lláh"), IDF-weighted tokens + one-slip spelling, a bonus when
// the whole title stands in the message — "do you have the research department compilation on Deepening" ranks the
// compilation "Deepening" (compiler: Research Department) first with no phrase cutting. Pluggable RETRIEVERS merge by id.
// Index: built once per process from the title index rows (warm-up) + section titles (sections-repo, cached on disk 6 h).
// Deps: dewey/title-index.js, repos/sections-repo.js (lazy), config/work-names.json.
import { readFileSync } from 'fs';
import { readFile, writeFile, mkdir, stat, rename } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── folding and tokens ──
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼʻ`]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// a token's base: plural / possessive s off ("compilations" = "compilation", "talks" = "talk"); words of 4+ letters only
const base = (w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
// words that carry no title (a tokenizer's stop list — never an intent rule)
const STOP = new Set(('the a an of and or in on to for by with from at as is are was be been it its this that these those i me my we our you your he she they them '
  + 'do does did have has had can could would will shall should may might please want wanted looking look find get give show open read tell about any some '
  + 'there here what which who whom where when how no yes not ok okay thanks thank hi hello library book books work works text access copy version').split(' '));
export const tokens = (s) => fold(s).split(' ').filter((w) => w && !STOP.has(w)).map(base);
const titleTokens = (s) => fold(s).split(' ').filter((w) => w && !['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'by', 'with', 'from', 'at'].includes(w)).map(base);

function lev1(a, b) {   // at most one edit apart (insert, delete, substitute)
  if (a === b) return true;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (m > n) i++; else if (n > m) j++; else { i++; j++; }
  }
  return edits + (m - i) + (n - j) <= 1;
}

// ── the index (pure build) ──
/**
 * docs [{ id, title, author, collection, religion, paragraph_count }], sections [{ section_id, doc_id, title, book, author,
 * start_index, end_index, paragraphs, first_para_id }], aliases [{ title, names[] }] → an index. Pure.
 */
export function buildBookIndex(input) {
  const steps = bookIndexSteps(input); let s;
  do s = steps.next(); while (!s.done);
  return s.value;
}
/** The same build, yielding the event loop every 5,000 entries (≈5 s of CPU on tower froze anis after each reload, 11-12). */
export async function buildBookIndexYielding(input) {
  const steps = bookIndexSteps(input);
  for (let s = steps.next(); ; s = steps.next()) { if (s.done) return s.value; await new Promise((ok) => setImmediate(ok)); }
}
function* bookIndexSteps({ docs = [], sections = [], aliases = [] } = {}) {
  const entries = [], post = new Map(), byKey = new Map();
  let n = 0;
  const add = (e, fields) => {
    const i = entries.push(e) - 1;
    for (const [f, toks] of Object.entries(fields)) for (const t of new Set(toks)) { let p = post.get(t); if (!p) post.set(t, p = []); p.push([i, f]); }
  };
  for (const d of docs) {
    if (++n % 5000 === 0) yield;
    const tt = titleTokens(d.title);
    if (!tt.length) continue;
    const e = { kind: 'work', doc: d, title: d.title, tt, phrase: tt.join(' ') };
    add(e, { t: tt, a: tokens(d.author), c: tokens(d.collection) });
    const k = e.phrase; (byKey.get(k) || byKey.set(k, []).get(k)).push(entries.length - 1);
  }
  for (const s of sections) {
    if (++n % 5000 === 0) yield;
    const tt = titleTokens(s.title);
    if (!tt.length) continue;
    add({ kind: 'section', sec: s, title: s.title, tt, phrase: tt.join(' ') }, { t: tt, b: titleTokens(s.book), a: tokens(s.author) });
  }
  // the entries whose title holds a phrase's first word (its candidates; a scan of every entry per listed name was ~1 s)
  const titled = (phrase) => [...new Set((post.get(phrase.split(' ')[0]) || []).filter(([, f]) => f === 't').map(([i]) => i))];
  // another name a work is known by ("Iqan", "Book of Certitude") is a title of every work whose title holds the listed one
  for (const w of aliases) {
    const want = titleTokens(w.title).join(' ');
    if (!w.title || !want) continue;
    const toks = [...new Set((w.names || []).flatMap(titleTokens))];
    for (const i of titled(want)) {
      const e = entries[i];
      if (e.kind !== 'work' || !` ${e.phrase} `.includes(` ${want} `)) continue;
      e.alias = (w.names || []).map((n) => titleTokens(n).join(' ')).filter(Boolean);
      for (const t of toks) { let p = post.get(t); if (!p) post.set(t, p = []); p.push([i, 'l']); }
    }
  }
  // a part of a book known by other names ("the Dispensation" → that letter of The World Order of Bahá'u'lláh): {section, in?, names}
  for (const w of aliases) {
    const want = titleTokens(w.section).join(' '), inBook = titleTokens(w.in).join(' ');
    if (!w.section || !want) continue;
    const toks = [...new Set((w.names || []).flatMap(titleTokens))];
    for (const i of titled(want)) {
      const e = entries[i];
      if (e.kind !== 'section' || !` ${e.phrase} `.includes(` ${want} `)) continue;
      if (inBook && !` ${titleTokens(e.sec.book).join(' ')} `.includes(` ${inBook} `)) continue;
      e.alias = (w.names || []).map((n) => titleTokens(n).join(' ')).filter(Boolean);
      for (const t of toks) { let p = post.get(t); if (!p) post.set(t, p = []); p.push([i, 'l']); }
    }
  }
  const vocab = new Map();   // first two letters → tokens (the one-slip spelling lookup)
  for (const t of post.keys()) if (t.length >= 5) { const k = t.slice(0, 2); (vocab.get(k) || vocab.set(k, []).get(k)).push(t); }
  return { entries, post, vocab, size: entries.length, docs: docs.length, sections: sections.length };
}

const W = { t: 3, l: 3, b: 0.8, a: 1.2, c: 0.6 };   // where a token matched: title, other name, section's book, author/compiler, collection
/**
 * The lexical retriever: the WHOLE message → [{ kind, doc|sec, score }], best first. Pure.
 * score = Σ idf × field weight over matched tokens, × how much of the TITLE the message holds, + a bonus when the whole
 * title (or a listed name) stands in the message, + size as a tie-break (the work over a one-page leaflet of the same title).
 */
export function lexicalSearch(index, message, { limit = 30 } = {}) {
  const q = [...new Set(tokens(message))];
  if (!q.length || !index?.size) return [];
  const N = index.size, idf = (t) => Math.log(1 + N / ((index.post.get(t)?.length || 0) + 1));
  const expand = (t) => {   // the token itself, else words one slip away (≥ 5 letters)
    if (index.post.has(t) || t.length < 5) return [t];
    return (index.vocab.get(t.slice(0, 2)) || []).filter((v) => lev1(t, v)).slice(0, 3);
  };
  const acc = new Map();
  for (const qt of q) for (const t of expand(qt)) {
    const p = index.post.get(t);
    if (!p || p.length > Math.max(200, N * 0.05)) continue;   // a word in one entry of twenty names nothing on its own
    const w = idf(t) * (t === qt ? 1 : 0.8);
    for (const [i, f] of p) {
      let a = acc.get(i); if (!a) acc.set(i, a = { s: 0, tHit: new Set() });
      a.s += w * W[f];
      if (f === 't' || f === 'l') a.tHit.add(t);
    }
  }
  const msg = ` ${tokens(message).join(' ')} `, msgAll = ` ${titleTokens(message).join(' ')} `;
  const out = [];
  for (const [i, a] of acc) {
    const e = index.entries[i];
    if (!a.tHit.size) continue;   // the title (or a listed name) must be named: an author or collection alone is not a request for that book
    const tw = e.tt.reduce((s, t) => s + idf(t), 0) || 1;
    const cover = Math.min(1, e.tt.filter((t) => a.tHit.has(t)).reduce((s, t) => s + idf(t), 0) / tw);
    const whole = msgAll.includes(` ${e.phrase} `) || msg.includes(` ${e.tt.filter((t) => !STOP.has(t)).join(' ')} `) || (e.alias || []).some((n) => msgAll.includes(` ${n} `));
    const size = Math.log10(1 + (e.kind === 'work' ? e.doc.paragraph_count : e.sec.paragraphs) || 1) * 0.3;
    out.push({ i, score: a.s * (0.4 + cover) + (whole ? 4 : 0) + size });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit).map(({ i, score }) => {
    const e = index.entries[i];
    return e.kind === 'work' ? { kind: 'work', doc: e.doc, score: +score.toFixed(3) } : { kind: 'section', sec: e.sec, score: +score.toFixed(3) };
  });
}

// ── the index in memory (one per process), section titles cached on disk ──
const ALIASES = join(dirname(fileURLToPath(import.meta.url)), '../../../config/work-names.json');
const SECTIONS_FILE = () => join(process.env.DEWEY_DIR || '/tank/sifter/dewey', 'section-titles.json');
const MAX_AGE = 6 * 3600e3;
let memo = null, inflight = null;
async function sectionRows(file = SECTIONS_FILE()) {
  try { const st = await stat(file); if (Date.now() - st.mtimeMs < MAX_AGE) return JSON.parse(await readFile(file, 'utf8')); } catch { /* none yet */ }
  const { sectionTitlePage } = await import('../repos/sections-repo.js');
  const rows = [];
  for (let afterId = 0; ;) {
    const page = await sectionTitlePage({ afterId, limit: 5000 });
    rows.push(...page);
    if (page.length < 5000) break;
    afterId = page.at(-1).section_id;
  }
  await mkdir(dirname(file), { recursive: true }).catch(() => {});
  await writeFile(`${file}.${process.pid}`, JSON.stringify(rows)).then(() => rename(`${file}.${process.pid}`, file)).catch(() => {});
  return rows;
}
async function build() {
  const [{ titleIndex }, sections] = await Promise.all([import('../dewey/title-index.js'), sectionRows().catch(() => [])]);
  const ti = await titleIndex();
  let aliases = [];
  try { aliases = JSON.parse(readFileSync(ALIASES, 'utf8')).works || []; } catch { /* no list */ }
  const docs = ti.docs.map(({ key, keys, ...d }) => d);   // eslint-disable-line no-unused-vars
  memo = { at: Date.now(), index: await buildBookIndexYielding({ docs, sections, aliases }) };
  return memo.index;
}
/** The finder's index: memory → (stale: served at once, ONE background rebuild) → built now (single-flight). */
export async function bookIndex() {
  if (memo && Date.now() - memo.at < MAX_AGE) return memo.index;
  if (memo) { inflight ??= build().catch(() => {}).finally(() => { inflight = null; }); return memo.index; }
  return (inflight ??= build().finally(() => { inflight = null; }));
}
/** Warm-up (with the title index, off the boot path): the first request finds the index built. */
export const warmBookFinder = () => bookIndex().catch(() => null);

// ── the retrievers ──
/** The lexical retriever over the in-memory index (`index` injectable for tests). */
export const lexicalRetriever = (index = null) => async (message, { limit }) => lexicalSearch(index || await bookIndex(), message, { limit });
// SEAM (Chad 11-10, not built yet): a SEMANTIC retriever — title + description vectors — answers "the main book of the Hindus"
// without the Haiku fallback. Register it here: same shape, (message, { limit }) → [{ kind, doc|sec, score }]; scores are
// merged by rank (reciprocal), so the two scales never need to agree.
export const RETRIEVERS = [lexicalRetriever()];

const MIN_PARAS = 20, WORKS = 8, SECTIONS = 4;
const idOf = (c) => (c.kind === 'work' ? `w${c.doc.id}` : `s${c.sec.doc_id}:${c.sec.start_index}`);
/**
 * The message (+ any names Jev or a fallback gave) → candidates [{ kind, doc|sec, score }]: works first (one per title, ≥ 20
 * paragraphs), then sections (one per book), ≤ `limit`. Retrievers merged by reciprocal rank. → { cands, ms }
 */
export async function bookCandidates(message, { limit = 12, retrievers = RETRIEVERS, also = [] } = {}) {
  const t0 = Date.now();
  const text = [message, ...also.filter((n) => n && !fold(message).includes(fold(n)))].filter(Boolean).join('\n');
  const lists = await Promise.all(retrievers.map((r) => r(text, { limit: 40 }).catch(() => [])));
  const merged = new Map();
  for (const list of lists) list.forEach((c, r) => { const k = idOf(c); const m = merged.get(k); const add = 1 / (10 + r); if (m) m.rrf += add; else merged.set(k, { ...c, rrf: add }); });
  const ranked = [...merged.values()].sort((a, b) => b.rrf - a.rrf || (b.score ?? 0) - (a.score ?? 0));
  const seenT = new Set(), seenB = new Set(), works = [], secs = [];
  for (const c of ranked) {
    if (c.kind === 'work') {
      const k = `${fold(c.doc.title)}${isMedia(c) ? '|talk' : ''}`;   // a talk sharing a work's title is its own candidate, never the work's stand-in
      if ((c.doc.paragraph_count ?? 0) < MIN_PARAS || seenT.has(k) || works.length >= WORKS) continue;
      seenT.add(k); works.push(c);
    } else {
      // a section that IS a listed work is that work; one section per book (28 "Matthew N" chapters are one choice: the Gospel)
      if (seenB.has(c.sec.doc_id) || secs.length >= SECTIONS || works.some((w) => w.doc.id === c.sec.doc_id && fold(w.doc.title) === fold(c.sec.title))) continue;
      seenB.add(c.sec.doc_id); secs.push(c);
    }
  }
  // interleave by score so a strong section ("The Dispensation of Bahá’u’lláh") is not pushed below eight weak works
  const cands = libraryFirst([...works, ...secs].sort((a, b) => b.rrf - a.rrf)).slice(0, limit);
  return { cands, ms: Date.now() - t0 };
}

const isMedia = (c) => c.kind === 'work' && /^media$/i.test(String(c.doc.collection || '').trim());   // a recorded talk's transcript
// a title without its volume number or parenthetical: "The Revelation of Bahá’u’lláh, Volume 2" and a talk titled "The Revelation of Bahá’u’lláh" tie
export const tieTitle = (c) => fold(String(c.kind === 'section' ? c.sec.title : c.doc.title).replace(/\([^)]*\)/g, ' '))
  .replace(/\s(?:vol(?:ume)?|part|book)\s(?:\d+|[ivx]+)$/, '').replace(/\s\d+$/, '').trim();
/**
 * ORDER, never a filter (11-14: doc 2209613, a Taherzadeh TALK titled "The Revelation of Bahá’u’lláh", led the four volumes): among
 * works whose titles tie, the library's texts come before a talk transcript (collection Media), in the slot the first of them held;
 * every candidate stays. Pure.
 */
export function libraryFirst(cands) {
  const first = new Map();
  cands.forEach((c, i) => { const k = tieTitle(c); if (!first.has(k)) first.set(k, i); });
  return cands.map((c, i) => ({ c, i, g: first.get(tieTitle(c)) }))
    .sort((a, b) => a.g - b.g || isMedia(a.c) - isMedia(b.c) || a.i - b.i).map((x) => x.c);
}

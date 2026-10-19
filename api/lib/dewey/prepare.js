// THE QUALITY GATE before anything enters the library (Chad 10-19: "We don't want to ingest books unless the quality is very
// good. Dewey needs to be responsible for assessing quality and improving it before ingestion … paragraphs unsegmented or
// paragraphs split at page markers or inline footnotes not properly marked out or OCR misspellings that could be easily
// corrected … All these things affect context for concept and history extraction"). Text in → REPAIRED text + verdict.
//   1. footnotes: a page's foot notes whose numbers match reference marks in that page's text become <!-- fn: … --> AT the
//      reference (taken out BEFORE reflow — reflow joins a digit-led line to the paragraph above it)
//   2. clean.js: pages marked, running headers / page numbers out, printed lines reflowed, paragraphs joined across page
//      markers, hyphens closed
//   3. OCR: ligatures; one-letter-shape confusions (rn/m, cl/d, tbe/the, wor1d) corrected only to a word the document itself
//      (or the commonest English) attests
//   4. walls of text split at sentence structure (Latin script; other scripts go to the semantic paragrapher)
//   5. quality.js re-inspects; the gate passes only what is fit for extraction. Pure.
import { cleanText } from './clean.js';
import { inspectDocument } from './quality.js';
import { wordRatio } from './convert.js';
import { splitByStructure, MAX_BLOCK } from '../../services/site-adapters/site2rag.js';
import { readFileSync, existsSync } from 'fs';

// ── 1. footnotes ────────────────────────────────────────────────────────────────────────────────────────────────────
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const FN_START = /^\s*(?:\[\^?(\d{1,3})\]:?|(\d{1,3})[.)]?|([¹²³⁴⁵⁶⁷⁸⁹⁰]{1,3}))\s+(\S.*)$/;
const PAGE_LINE = /^\s*(page\s+)?([\divxlc]{1,6}|-\s*\d+\s*-)\.?\s*$/i;
const PAGE_SPLIT = /(\f|<pb\b[^>]*\/>)/;
/** where the reference mark N sits in the page body: glued after a word or closing punctuation, never "p.12" / "vol.3" */
function refAt(body, n) {
  const re = new RegExp(`(?<=[\\p{L}\\p{M}.,;:!?’”"')\\]])(?:\\[\\^${n}\\]|${n}|${[...String(n)].map((d) => Object.keys(SUP).find((k) => SUP[k] === d)).join('')})(?=[\\s.,;:)]|$)`, 'gu');
  for (let m; (m = re.exec(body));) {
    const before = body.slice(Math.max(0, m.index - 5), m.index);
    if (!/\b(?:pp?|vol|no|ch|art|v)\.$|\d[.,:]?$/i.test(before)) return { index: m.index, len: m[0].length };
  }
  return null;
}

/** → { text with ⟦fn:k⟧ at each reference, notes: [text], unmatched } — one page at a time. */
export function extractFootnotes(text) {
  const notes = [];
  let unmatched = 0;
  const parts = String(text || '').split(PAGE_SPLIT);
  for (let p = 0; p < parts.length; p += 2) {
    const lines = parts[p].split('\n');
    let end = lines.length;
    while (end > 0 && (!lines[end - 1].trim() || PAGE_LINE.test(lines[end - 1]))) end--;
    // the topmost line of the page's foot from which every note start below is matched, numbered in sequence
    let top = -1;
    const starts = [];
    for (let k = end - 1; k >= Math.max(0, end - 60); k--) {
      const m = lines[k].match(FN_START);
      if (!m) continue;
      const n = Number(m[1] ?? m[2] ?? [...(m[3] || '')].map((c) => SUP[c]).join(''));
      const body = lines.slice(0, k).join('\n');
      if (!refAt(body, n)) break;
      if (starts.length && n !== starts[0].n - 1) break;
      starts.unshift({ k, n }); top = k;
    }
    if (top < 0 || top < end * 0.4) {
      // a citation-like numbered line at the page's foot with no mark to hang on: a note left in the text
      unmatched += lines.slice(Math.max(0, end - 6), end).filter((l) => /^\s*\d{1,3}\s+\S.*(?:\bpp?\.\s*\d|\bibid\b|\bop\.\s*cit|\b1[5-9]\d\d\b|\b20\d\d\b)/i.test(l)).length;
      continue;
    }
    let body = lines.slice(0, top).join('\n');
    // longest first, so note 12's mark is not taken for note 1's
    const found = starts.map((s, i) => ({ ...s, text: lines.slice(s.k, (starts[i + 1]?.k ?? end)).join(' ').replace(FN_START, (_, a, b, c, rest) => `${a ?? b ?? [...(c || '')].map((x) => SUP[x]).join('')} ${rest}`).replace(/\s+/g, ' ').trim() }));
    for (const f of [...found].sort((a, b) => String(b.n).length - String(a.n).length)) {
      const at = refAt(body, f.n);
      if (!at) { unmatched++; continue; }
      notes.push(f.text);
      body = `${body.slice(0, at.index)}⟦fn:${notes.length - 1}⟧${body.slice(at.index + at.len)}`;
    }
    parts[p] = [body, ...lines.slice(end)].join('\n');
  }
  return { text: parts.join(''), notes, unmatched };
}
const restoreFootnotes = (text, notes) => text.replace(/⟦fn:(\d+)⟧/g, (_, k) => `<!-- fn: ${String(notes[k]).replace(/--/g, '—')} -->`);

// ── 3. OCR ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// A correction needs a DICTIONARY: without one the first trial (10-19, 300 bahai-library files) "corrected" real words into
// other real words — beard→heard, bad→had, mouth→month, clay→day, bath→hath in the Bible. Only a token that is NOT a
// word is ever touched, never a capitalised one (names: Anah, Gaius, Clara), and only toward a dictionary word the
// document itself uses or the commonest English. No dictionary on the host → ligatures and digit-in-word fixes only.
const LIGATURES = { 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };
const COMMON = new Set(('the of and to in is that for it as was with be by on not he this are or his from at which but have an they ' +
  'were had their one all been has more when there will would who so no its what if out them about into than then only other ' +
  'some could these two may first any time very upon such him our made after also did many before must through those where ' +
  'most should each now over great people like well between under world modern morning name came come being shall whom ' +
  'while without because word words hath doth unto').split(' '));
const SWAPS = [['rn', 'm'], ['m', 'rn'], ['cl', 'd'], ['d', 'cl'], ['li', 'h'], ['vv', 'w'], ['tb', 'th'], ['b', 'h'], ['c', 'e'], ['1', 'l'], ['0', 'o'], ['5', 's'], ['ii', 'u'], ['u', 'n'], ['n', 'u']];
let DICT;
/** the host's word list (/usr/share/dict), lower-cased; null where there is none */
export function systemDictionary() {
  if (DICT !== undefined) return DICT;
  const files = ['/usr/share/dict/american-english', '/usr/share/dict/british-english', '/usr/share/dict/words'].filter((f) => existsSync(f));
  DICT = files.length ? new Set(files.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((w) => w.trim().toLowerCase()).filter(Boolean))) : null;
  return DICT;
}

/** paragraph texts → { texts, fixes: [[from, to, n]] } — Latin script only; counts are the whole document's. */
export function fixOcrAll(texts, { dict = systemDictionary() } = {}) {
  let ts = texts.map((t) => String(t || '').replace(/[ﬁﬂﬀﬃﬄﬅﬆ]/g, (c) => LIGATURES[c]));
  const counts = new Map();
  for (const t of ts) for (const w of t.toLowerCase().match(/\p{L}[\p{L}\p{M}0-9]*/gu) || []) counts.set(w, (counts.get(w) || 0) + 1);
  const isWord = (w) => (dict ? dict.has(w) : false) || COMMON.has(w);
  const fixes = new Map();
  const fixTok = (tok) => {
    const low = tok.toLowerCase();
    const digit = /\d/.test(low);
    if (isWord(low) || (counts.get(low) || 0) > 2) return tok;
    if (!digit && (!dict || /^\p{Lu}/u.test(tok))) return tok;   // names, and no dictionary to tell a word from a misreading
    for (const [a, b] of SWAPS) {
      if (digit !== /\d/.test(a)) continue;
      for (let i = low.indexOf(a); i >= 0; i = low.indexOf(a, i + 1)) {
        const cand = low.slice(0, i) + b + low.slice(i + a.length);
        if (cand === low || /\d/.test(cand)) continue;
        if ((dict ? dict.has(cand) : true) && (COMMON.has(cand) || (counts.get(cand) || 0) >= 3)) {
          const out = /^\p{Lu}/u.test(tok) ? cand[0].toUpperCase() + cand.slice(1) : cand;
          const k = `${tok}→${out}`; fixes.set(k, (fixes.get(k) || 0) + 1);
          return out;
        }
      }
    }
    return tok;
  };
  // per PARAGRAPH: a French or Latin passage inside an English book (Browne's materials: peu→pen, donc→done) gets no
  // dictionary — only digit-in-word fixes
  const TOK = /(?<![\p{L}\p{M}\d'’])\p{L}[\p{L}\p{M}0-9]{2,}(?![\p{L}\p{M}\d])/gu;
  ts = ts.map((t) => {
    const foreign = dict && (t.match(/\p{L}+/gu) || []).length >= 6 && englishShare(t) < 0.12;
    return t.replace(TOK, (tok) => (foreign && !/\d/.test(tok) ? tok : fixTok(tok)));
  });
  return { texts: ts, fixes: [...fixes].map(([k, n]) => [...k.split('→'), n]) };
}
export const fixOcr = (text, opts) => { const r = fixOcrAll([text], opts); return { text: r.texts[0], fixes: r.fixes }; };

// ── markup left in the text (10-19 trial: 725 of 1,397 bahai-library pages stored "[K121](https://…aqdas.html#K121)" and
//    whole <table><tr><td> rows as paragraph text — URLs and tags in the search index and in extraction context) ──────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
/** Markdown/HTML → the words a reader sees. Pure. */
export function stripMarkup(t) {
  return String(t || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')                          // images
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')         // [text](url) → text
    .replace(/<br\s*\/?>/gi, ' ').replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' · ').replace(/<\/(?:tr|p|li|div|h\d)>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')                              // other tags
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m))
    .replace(/<?https?:\/\/[^\s<>)\]]+>?/g, ' ')                      // bare URLs (image links, logos)
    .replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/(^|[\s(“"‘])[_*](?=\S)([^_*\n]+?)(?<=\S)[_*](?=[\s.,;:!?)”"’]|$)/g, '$1$2').replace(/\\([[\]()*_#.!\\-])/g, '$1')
    .replace(/(?:\s*·\s*){2,}/g, ' · ').replace(/^\s*·\s*|\s*·\s*$/g, '')
    .replace(/\s+/g, ' ').trim();
}
const EN_STOP = new Set('the of and to in is that for it as was with be by on not he this are or his from at which but have an they were had their'.split(' '));
/** share of word tokens that are English function words — ~0.35–0.5 in English prose, under 0.05 in French or Spanish */
export const englishShare = (t) => { const w = String(t).toLowerCase().match(/\p{L}+/gu) || []; return w.length ? w.filter((x) => EN_STOP.has(x)).length / w.length : 0; };

/** "Propa- ganda" → "Propaganda" (the joined form is a word); "loving- kindness" → "loving-kindness" (both halves are);
 *  anything else is left — "asistirle- han" is a Spanish dash, not a broken word. Needs the dictionary. */
export function closeHyphens(t, dict) {
  let n = 0;
  const out = String(t).replace(/(\p{L}{2,})- (\p{Ll}{2,})/gu, (m, a, b) => {
    const A = a.toLowerCase();
    if (dict.has(A + b)) { n++; return a + b; }
    if (dict.has(A) && dict.has(b)) { n++; return `${a}-${b}`; }
    return m;
  });
  return { text: out, n };
}

// ── 4–5. paragraphs: footnotes, page-split joins, OCR, walls; then the verdict ──────────────────────────────────────
const TERMINAL = /[.!?:;"”’)\]…]$/;
const headingLike = (t) => { const w = t.split(/\s+/); return w.length <= 12 && w.filter((x) => /^\p{Lu}/u.test(x)).length / w.length >= 0.6; };
/** share of letters that are Latin — a Russian Íqán with Latin navigation links is not a Latin text */
export const latinShare = (t) => { const all = (String(t).match(/\p{L}/gu) || []).length; return all ? (String(t).match(/[A-Za-zÀ-ɏ]/g) || []).length / all : 0; };

/**
 * Site paragraphs [{ text, pdf_page, block_attrs, … }] → repaired paragraphs + report. The adapter starts a paragraph at
 * every page marker; a paragraph that runs over the page is joined again (the break kept in block_attrs.pb, as the main
 * ingester records it), a page's foot notes move into block_attrs.footnotes of the paragraph that marks them. Pure.
 */
export function repairParagraphs(paras, { language = null, dict } = {}) {
  let markup = 0;
  let ps = paras.map((p) => {
    const raw = String(p.text || '').trim(), text = stripMarkup(raw);
    if (text !== raw.replace(/\s+/g, ' ')) markup++;
    return { ...p, text, block_attrs: p.block_attrs ? { ...p.block_attrs } : undefined };
  }).filter((p) => p.text);
  const all = ps.map((p) => p.text).join(' ');
  const latin = language ? /^(en|fr|de|es|it|pt|nl|la|eo|sv|da|no|fi|pl|cs|hu|ro|tr|id|ms|vi)/i.test(language) && latinShare(all) > 0.6 : latinShare(all) > 0.6;
  // footnotes: per page, the trailing run of numbered paragraphs whose numbers are marked in that page's text
  let notes = 0;
  const byPage = new Map();
  ps.forEach((p, i) => { if (p.pdf_page != null) { if (!byPage.has(p.pdf_page)) byPage.set(p.pdf_page, []); byPage.get(p.pdf_page).push(i); } });
  const drop = new Set();
  for (const idx of byPage.values()) {
    const run = [];
    for (let j = idx.length - 1; j > 0; j--) {
      const m = ps[idx[j]].text.match(FN_START);
      if (!m) break;
      const n = Number(m[1] ?? m[2] ?? [...(m[3] || '')].map((c) => SUP[c]).join(''));
      if (run.length && n !== run[0].n - 1) break;
      run.unshift({ i: idx[j], n });
    }
    const first = run[0]?.i;
    // longest numbers first, so note 12's mark is not taken for note 1's; the host is the page's body paragraph that marks it
    for (const f of [...run].sort((a, b) => String(b.n).length - String(a.n).length)) {
      const hostIdx = idx.find((i) => i < first && refAt(ps[i].text, f.n));
      if (hostIdx == null) continue;
      const at = refAt(ps[hostIdx].text, f.n);
      ps[hostIdx].text = ps[hostIdx].text.slice(0, at.index) + ps[hostIdx].text.slice(at.index + at.len);
      ps[hostIdx].block_attrs = { ...(ps[hostIdx].block_attrs || {}), footnotes: [...(ps[hostIdx].block_attrs?.footnotes || []), { n: f.n, at: at.index, text: ps[f.i].text.replace(FN_START, '$4') }] };
      drop.add(f.i); notes++;
    }
  }
  ps = ps.filter((_, i) => !drop.has(i));
  // a paragraph broken by the page: it does not end a sentence and the next page's first paragraph continues it
  let joins = 0;
  const out = [];
  for (const p of ps) {
    const prev = out.at(-1);
    const words = prev ? prev.text.split(/\s+/).length : 0;
    // across a page change; or, where the source kept no page numbers, any break inside a sentence (a lower-case start —
    // "…prudence on ‖ the one hand", 10-19 trial)
    const newPage = p.pdf_page != null && prev?.pdf_page != null && p.pdf_page !== prev.pdf_page;
    const noPages = p.pdf_page == null && prev?.pdf_page == null;
    if (prev && (newPage || noPages) && !TERMINAL.test(prev.text) && words >= (newPage ? 4 : 8)
      && !headingLike(prev.text) && (newPage ? /^[\p{Ll}\d(“"‘'—–-]/u : /^\p{Ll}/u).test(p.text) && !/^\d+[.)]\s/.test(p.text)) {
      const hyphen = /\p{L}-$/u.test(prev.text) && /^\p{Ll}/u.test(p.text);
      const offset = hyphen ? prev.text.length - 1 : prev.text.length + 1;
      prev.text = hyphen ? prev.text.slice(0, -1) + p.text : `${prev.text} ${p.text}`;
      const fns = (p.block_attrs?.footnotes || []).map((f) => ({ ...f, at: f.at + offset }));
      prev.block_attrs = { ...(prev.block_attrs || {}), ...(newPage ? { pb: [...(prev.block_attrs?.pb || []), [offset, null, p.pdf_page]] } : {}), ...(fns.length ? { footnotes: [...(prev.block_attrs?.footnotes || []), ...fns] } : {}) };
      if (prev.block_attrs && !Object.keys(prev.block_attrs).length) delete prev.block_attrs;
      joins++; continue;
    }
    out.push(p);
  }
  ps = out;
  // dictionary corrections only where the text READS as English (carne→came, donc→done, peu→pen in the trial)
  const english = englishShare(ps.map((p) => p.text).join(' ').slice(0, 200000)) > 0.2;
  const ocr = latin ? fixOcrAll(ps.map((p) => p.text), { dict: english ? dict : null }) : { texts: ps.map((p) => p.text), fixes: [] };
  ps = ps.map((p, i) => ({ ...p, text: ocr.texts[i] }));
  let hyphens = 0;
  const words = english ? (dict ?? systemDictionary()) : null;
  if (words) ps = ps.map((p) => { const h = closeHyphens(p.text, words); hyphens += h.n; return { ...p, text: h.text }; });
  let walls = 0;
  ps = ps.flatMap((p) => {
    if (p.text.length <= MAX_BLOCK || !latin) return [p];
    walls++; return splitByStructure(p.text).map((text, k) => ({ ...p, text, block_attrs: k ? undefined : p.block_attrs }));
  }).map((p, i) => ({ ...p, paragraph_index: i }));
  return { paragraphs: ps, latin, repairs: { markup_stripped: markup, footnotes: notes, page_joins: joins, hyphens_closed: hyphens, ocr_fixes: ocr.fixes.reduce((s, f) => s + f[2], 0), ocr_examples: ocr.fixes.slice(0, 8), walls_split: walls, paragraphs_before: paras.length, paragraphs_after: ps.length } };
}

const LIMITS = { splitRate: 0.01, pageNumRate: 0.01, wordRatio: 0.88, unmatchedNotes: 2 };
/** The verdict on paragraph texts: fit for extraction, or the reasons it is not. Pure. */
export function judge(texts, { latin = latinShare(texts.join(' ')) > 0.6, unmatchedNotes = 0, item = {} } = {}) {
  const paras = texts.filter(Boolean);
  const after = inspectDocument(paras.map((x) => ({ text: x })), item);
  const n = (code) => after.findings.find((f) => f.code === code)?.n || 0;
  const per = Math.max(1, paras.length);
  const why = [];
  const giant = paras.filter((p) => p.length > 8000).length;
  if (giant || (latin && n('walls'))) why.push(`${giant || n('walls')} paragraph(s) still a wall of text — needs semantic segmentation`);
  if (n('split-sentences') > Math.max(2, per * LIMITS.splitRate)) why.push(`${n('split-sentences')} sentences split across paragraphs (e.g. “${after.findings.find((f) => f.code === 'split-sentences').example}”)`);
  if (n('page-numbers') > Math.max(2, per * LIMITS.pageNumRate)) why.push(`${n('page-numbers')} printed page numbers left in the text`);
  // no hyphen criterion: an English broken word is closed by the dictionary (closeHyphens); what is left is a dash or a
  // compound in another language (the trial's 277 "failures" were "loving- kindness" and Spanish "asistirle- han")
  const ratio = latin ? wordRatio(paras.join(' ')) : null;
  if (ratio != null && ratio < LIMITS.wordRatio) why.push(`OCR noise: only ${Math.round(ratio * 100)}% of words read cleanly`);
  if (unmatchedNotes > LIMITS.unmatchedNotes) why.push(`${unmatchedNotes} footnotes whose reference mark could not be found`);
  if (!paras.length) why.push('no text');
  return { pass: !why.length, why, score: after.score, findings: after.findings.map((f) => [f.code, f.n]), word_ratio: ratio == null ? null : +ratio.toFixed(2) };
}

const blocksOf = (t) => t.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
const plain = (b) => b.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<pb\b[^>]*\/>/g, ' ').replace(/\s+/g, ' ').trim();

/** Dewey's own texts (PDF / Word / OCR) → { text, pass, why: [], repairs, before, after } */
export function prepareForIngest(text, { language = null, item = {}, dict } = {}) {
  const raw = String(text || '');
  const latin = latinShare(raw.slice(0, 20000)) > 0.6 && (!language || /^(en|fr|de|es|it|pt|nl|la|eo|sv|da|no|fi|pl|cs|hu|ro|tr|id|ms|vi)/i.test(language));
  const before = judge(blocksOf(raw).map(plain), { latin, item });
  const fn = extractFootnotes(raw);
  let t = cleanText(fn.text);
  const ocr = latin ? fixOcr(t, { dict: englishShare(t.slice(0, 200000)) > 0.2 ? dict : null }) : { text: t, fixes: [] };
  t = ocr.text;
  let walls = 0;
  t = blocksOf(t).flatMap((b) => {
    if (plain(b).length <= MAX_BLOCK || /^#/.test(b) || !latin) return [b];
    walls++; return splitByStructure(b);
  }).join('\n\n');
  t = restoreFootnotes(t, fn.notes);
  const paras = blocksOf(t).map(plain).filter(Boolean);
  const after = judge(paras, { latin, unmatchedNotes: fn.unmatched, item });
  return {
    text: t, pass: after.pass, why: after.why,
    repairs: { footnotes: fn.notes.length, ocr_fixes: ocr.fixes.reduce((s, f) => s + f[2], 0), ocr_examples: ocr.fixes.slice(0, 8), walls_split: walls, paragraphs_before: blocksOf(raw).length, paragraphs_after: paras.length },
    before: { score: before.score, findings: before.findings }, after,
  };
}

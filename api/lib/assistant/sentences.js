// ONE sentence segmenter for every reply transform (Chad 11-14: the tz4 "1281 A.H." cut "suggests a much broader problem in parsing sentences
// according to overly simplistic rules"). segment(text) → [{text,start,end}], joined = the input byte for byte. Never splits inside a link,
// [[ref]], {{template}}, `code`, a fence, an open quotation, a blockquote/table/heading line; never after an initial (J. E.), a dotted abbreviation
// (A.H., e.g.), a title or reference word (Mr., vol., p.), a list number, or before a lowercase word or a verse number (Gen. 1.2).
// keepsWords: the word-preservation rule (a transform removes whole segments only, or the parts it declares). Pure; no deps.

const MASKS = [/```[\s\S]*?(?:```|$)/g, /\{\{[\s\S]*?\}\}/g, /`[^`\n]*`/g, /!?\[[^\]\n]*\]\([^)\s]*\)/g, /\[\[[^\]\n]*\]\]/g, /\[[^\]\n]*\]/g];
// same length as the input (offsets hold); the span's first character stays, so a link or marker still opens a sentence
const mask = (s) => MASKS.reduce((m, re) => m.replace(re, (x) => x[0] + 'x'.repeat(x.length - 1)), s);
const END = /[.!?…؟۔]+["”’'»)\]*_]*[ \t]+(?=\S)/gu;
const WHOLE_LINE = /^[ \t]*(?:>|\||#|`)/;
const NO_END = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'prof', 'rev', 'sr', 'jr', 'cf', 'viz', 'vs', 'vol', 'vols', 'ch', 'chap', 'no', 'nos', 'p', 'pp',
  'ed', 'eds', 'trans', 'comp', 'fig', 'ff', 'pt', 'bk', 'sec', 'para', 'art', 'n', 'nn', 'ca', 'c', 'approx']);
const open = (s) => (s.match(/“/g) || []).length > (s.match(/”/g) || []).length || (s.match(/"/g) || []).length % 2 === 1;

/** Is the end at m (an END match on the masked text) a sentence end? */
function ends(m, at, run, lineStart) {
  const next = m[at + run.length], before = m.slice(lineStart, at), mark = run.trimEnd();
  if (/\p{Ll}/u.test(next) || open(before + mark)) return false;
  if (!/^\.(?!\.)/.test(mark)) return true;   // ! ? … ...
  const word = before.match(/([\p{L}\p{N}.'’ʼ-]*)$/u)[1];
  if (/^\p{Lu}$/u.test(word) || /^\p{L}(?:\.\p{L})+$/u.test(word) || NO_END.has(word.toLowerCase())) return false;   // J. · A.H. · e.g. · Mr. · vol.
  if (/^\d+$/.test(word) && /^[ \t]*(?:[-*+][ \t]+)?\d+$/.test(before)) return false;   // "1. " a list number
  return !(/\d/.test(next) && /^\p{L}{1,5}$/u.test(word));   // Gen. 1.2 · Matt. 5 · ch. 4
}

/** text → its sentences [{ text, start, end }]; each carries its trailing space and line breaks. */
export function segment(text) {
  const s = String(text ?? '');
  if (!s) return [];
  const m = mask(s), cuts = [];
  let lineStart = 0;
  for (const line of m.split('\n')) {
    if (!WHOLE_LINE.test(line)) {
      for (const e of line.matchAll(END)) {
        const at = lineStart + e.index;
        if (ends(m, at, e[0], lineStart)) cuts.push(at + e[0].length);
      }
    }
    lineStart += line.length + 1;
    if (lineStart <= s.length) { let j = lineStart; while (j < s.length && /\s/.test(s[j]) && m[j] !== 'x') j++; if (j < s.length) cuts.push(j); }
  }
  // a masked span holding a line break (a {{marker}} or a fence) is never cut inside
  const masked = [...m.matchAll(/[^x]x+/g)].map((x) => [x.index, x.index + x[0].length]);
  const keep = [...new Set(cuts)].filter((c) => c > 0 && c < s.length && !masked.some(([a, b]) => c > a && c < b)).sort((a, b) => a - b);
  const out = [];
  let start = 0;
  for (const c of [...keep, s.length]) { if (c > start) out.push({ text: s.slice(start, c), start, end: c }); start = c; }
  return out;
}

/** The sentences of a line (or text), each with its trailing space; joined they give it back. */
export const sentencesOf = (line) => { const x = segment(line).map((p) => p.text); return x.length ? x : [String(line ?? '')]; };

// ---- the word-preservation rule ----
const WORD = /[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu;
// markup is not words: link targets, bare URLs, [[refs]], list numbers (blanked to equal length, so offsets hold)
const blank = (x) => ' '.repeat(x.length);
const unmark = (s) => String(s ?? '').replace(/\]\([^)\s]*\)/g, blank).replace(/https?:\/\/\S+/g, blank).replace(/\[\[[^\]\n]*\]\]/g, blank)
  .replace(/^([ \t]*)(?:[-*+]|\d{1,3}[.)])(?=[ \t])/gm, (x) => blank(x));
const wordsAt = (s) => [...unmark(s).matchAll(WORD)].map((m) => ({ w: m[0].normalize('NFC').toLowerCase(), i: m.index, e: m.index + m[0].length }));
/** A text's words, lower-cased, markup left out. */
export const wordsOf = (s) => wordsAt(s).map((x) => x.w);
const at = (hay, j, w) => w.every((x, k) => hay[j + k] === x);
const CLAUSE = /[,;:—–]|\s[-–]\s/;
const CONJ = /^(?:and|but|so|yet|though|although|while|whereas)$/;
/** → { ok, removed }: `after` is `before` with whole sentences taken out, or a leading/trailing clause of one cut at its own , ; : or dash,
 *  or the `declared` pieces a transform names (a clause it cut, "…, and I can set those out."). removed = what was taken out.
 *  A changed, added or moved word — or a cut inside a sentence at anything else ("1281 A.|H.") — → ok false. */
export function keepsWords(before, after, declared = []) {
  const src = String(before ?? ''), aw = wordsOf(after);
  let units = segment(src).map((p) => ({ start: p.start, ws: wordsAt(p.text).map((x) => ({ ...x, i: x.i + p.start, e: x.e + p.start })) })).filter((u) => u.ws.length);
  for (const d of declared) {
    const dw = wordsOf(d);
    if (!dw.length) continue;
    const find = (u) => u.ws.findIndex((_, k) => at(u.ws.map((x) => x.w), k, dw));
    const i = units.findIndex((u) => find(u) >= 0);
    if (i < 0) continue;
    const u = units[i];
    let j = find(u), n = dw.length;
    if (/^(?:and|but|so)$/.test(u.ws[j - 1]?.w)) { j--; n++; }   // "…, and I can set those out." → the clause takes its "and"
    units.splice(i, 1, ...[{ ws: u.ws.slice(0, j) }, { ws: u.ws.slice(j, j + n), whole: true }, { ws: u.ws.slice(j + n) }].filter((x) => x.ws.length));
  }
  const text = (ws) => (ws.length ? src.slice(ws[0].i, ws.at(-1).e) : '');
  // each unit: kept, dropped, or (not a declared piece) split at a clause mark — its head or its tail dropped
  const ways = (u) => {
    const out = [{ keep: u.ws, drop: [] }, { keep: [], drop: u.ws }];
    if (!u.whole) for (let k = 1; k < u.ws.length; k++) {
      if (!CLAUSE.test(src.slice(u.ws[k - 1].e, u.ws[k].i))) continue;
      out.push({ keep: u.ws.slice(0, k), drop: u.ws.slice(k) }, { keep: u.ws.slice(k), drop: u.ws.slice(0, k) });
      if (CONJ.test(u.ws[k].w) && k + 1 < u.ws.length) out.push({ keep: u.ws.slice(k + 1), drop: u.ws.slice(0, k + 1) });   // "…, though X" → "X"
    }
    return out;
  };
  let reach = new Map([[0, []]]);
  for (const u of units) {
    const next = new Map();
    for (const [j, gone] of reach) for (const { keep, drop } of ways(u)) {
      const kw = keep.map((x) => x.w), to = j + kw.length;
      if (at(aw, j, kw) && !next.has(to)) next.set(to, drop.length ? [...gone, text(drop)] : gone);
    }
    reach = next;
  }
  const path = reach.get(aw.length);
  return path ? { ok: true, removed: path } : { ok: false, removed: [] };
}

/** The sentence-removing transforms, each held to keepsWords: a violation → its input back and the rule in form.unsafe; what it took out →
 *  form.drops [{ rule, removed }] (telemetry, capped; never the reader's — the raw draft is not otherwise kept). Same call shapes. */
export function wordSafe(form, fns) {
  form.unsafe ??= []; form.drops ??= [];
  return Object.fromEntries(Object.entries(fns).map(([rule, fn]) => [rule, (text, ...a) => {
    const r = fn(text, ...a), out = typeof r === 'string' ? r : r?.text;
    if (typeof text !== 'string' || typeof out !== 'string' || out === text) return r;
    const k = keepsWords(text, out, [...(r?.offers || []), ...(r?.cuts || [])]);   // cuts: a clause a transform names (lint.js butKeeps)
    if (!k.ok) {
      if (form.unsafe.length < 20) form.unsafe.push(rule);
      if (typeof r === 'string') return text;
      const back = { ...r, text };
      if ('dropped' in r) back.dropped = 0;
      if ('offers' in r) back.offers = [];
      if ('heads' in r) back.heads = [];
      return back;
    }
    for (const x of k.removed) if (form.drops.length < 30) form.drops.push({ rule, removed: x.slice(0, 160) });
    return r;
  }]));
}

/** Does a sentence end at `at` (the start of the next word) in a line still arriving? For the streaming gate: a link, {{marker}} or code
 *  span still open before `at` is not an end yet (its mask needs the close), and the word after decides "1281 A.H. (1865)". */
export function cutsAt(line, at) {
  const head = String(line).slice(0, at), n = (re) => (head.match(re) || []).length;
  if (n(/\[/g) > n(/\]/g) || n(/\(/g) > n(/\)/g) && /\]\([^)]*$/.test(head) || n(/\{\{/g) > n(/\}\}/g) || n(/`/g) % 2) return false;
  return segment(line).some((s) => s.end === at && at < line.length);
}

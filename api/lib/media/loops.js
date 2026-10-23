// ASR REPETITION LOOPS (QA 10-22: 18 in 10 talks — "Karend" ×49, "Bahá'áááá…", "his teachings spread to our land" ×6). Whisper
// sometimes repeats a word, a phrase or one character until the window ends. Found on the word list; repaired by HIDING the
// repeats (the first saying stays, every word keeps its time) and collapsing a character run; the publish gate refuses a
// transcript that still has one, or a lossy decode (U+FFFD) or mojibake. Pure.
import { hasMojibake } from './text-repair.js';
import { CORE_TERMS } from './vocab.js';

const norm = (w) => String(w?.w ?? w ?? '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '');
const CHAR_RUN = /(\p{L})\1{4,}/u;   // one letter five or more times ("Bahá'ááááá", "Nabiíííí")
const MAX_N = 8;

/** Loops in a word list: [{ i0, i1, n, k, kind: 'ngram'|'char', text }] (i1 exclusive). A single word repeated 5+ times, a
 *  2-word phrase 4+ times or a 3–8 word phrase 3+ times, back to back; or a letter run in one word. Hidden words are skipped. */
export function findLoops(words = []) {
  const vis = words.map((w, i) => ({ i, t: norm(w), raw: String(w?.w ?? '') })).filter((x, j) => !words[j]?.hide && x.t);
  const out = [];
  for (const x of vis) if (CHAR_RUN.test(x.raw)) out.push({ i0: x.i, i1: x.i + 1, n: 1, k: 1, kind: 'char', text: x.raw.slice(0, 40) });
  for (let a = 0; a < vis.length;) {
    let best = null;
    for (let n = 1; n <= MAX_N && a + 2 * n <= vis.length; n++) {
      let k = 1;
      while (a + (k + 1) * n <= vis.length && vis.slice(a + k * n, a + (k + 1) * n).every((y, j) => y.t === vis[a + j].t)) k++;
      // speech repeats too ('Thank you. Thank you. Thank you.', 'Yes, yes, yes, yes'): a loop is longer than that
      if (k >= (n === 1 ? 5 : n === 2 ? 4 : 3) && (!best || k * n > best.k * best.n)) best = { n, k };
    }
    if (best) {
      const end = vis[a + best.k * best.n - 1];
      out.push({ i0: vis[a].i, i1: end.i + 1, n: best.n, k: best.k, kind: 'ngram', text: vis.slice(a, a + best.n).map((y) => y.raw).join(' ').slice(0, 80),
        hide: vis.slice(a + best.n, a + best.k * best.n).map((y) => y.i) });
      a += best.k * best.n;
    } else a++;
  }
  return out.sort((p, q) => p.i0 - q.i0);
}

const fk = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const TERMS = (Array.isArray(CORE_TERMS) ? CORE_TERMS : String(CORE_TERMS).split('|')).map((t) => String(t).trim().replace(/^the\s+/i, '')).filter((t) => fk(t).length >= 3);
/** A word whose letter run was collapsed ("Bahaí", "Bá", "Abdu'l-Bá") → the shortest core term it begins (Bahá’í, Báb,
 *  ‘Abdu’l-Bahá), its edge punctuation kept; else the collapsed word. */
export function completeTerm(word) {
  const lead = (String(word).match(/^[^\p{L}]*/u) || [''])[0], trail = (String(word).match(/[^\p{L}]*$/u) || [''])[0];
  const core = String(word).slice(lead.length, String(word).length - trail.length);
  const k = fk(core);
  if (k.length < 2) return word;
  const hit = TERMS.filter((t) => fk(t).startsWith(k)).sort((a, b) => fk(a).length - fk(b).length)[0];
  return hit ? `${lead.replace(/['’‘]$/, '')}${hit}${trail}` : word;
}

/** Repair: repeats hidden (the first saying kept), letter runs collapsed and completed to the core term they begin
 *  ("Bahaíííí…" → Bahá’í, "Báááá…" → Báb). → { words, repaired: [loops] } */
export function repairLoops(words = []) {
  const loops = findLoops(words);
  if (!loops.length) return { words, repaired: [] };
  const ws = words.map((w) => ({ ...w }));
  for (const l of loops) {
    if (l.kind === 'char') ws[l.i0].w = completeTerm(String(ws[l.i0].w).replace(/(\p{L})\1{4,}/gu, '$1'));
    else for (const i of l.hide) ws[i].hide = true;
  }
  return { words: ws, repaired: loops.map(({ hide, ...l }) => l) };
}

/** Paragraphs → every loop repaired; → { paragraphs, repaired: [{ p, ...loop }] } */
export function repairParagraphLoops(paragraphs = []) {
  const repaired = [];
  const out = paragraphs.map((p) => {
    const r = repairLoops(p.words || []);
    for (const l of r.repaired) repaired.push({ p: p.n, at: p.words[l.i0]?.s ?? null, ...l });
    return r.repaired.length ? { ...p, words: r.words } : p;
  });
  return { paragraphs: out, repaired };
}

/** The PUBLISH GATE: what would make this transcript unfit to publish. → [{ p, kind, text }] (empty = fit) */
export function publishProblems(paragraphs = []) {
  const out = [];
  for (const p of paragraphs) {
    const vis = (p.words || []).filter((w) => !w.hide);
    for (const l of findLoops(vis)) out.push({ p: p.n, kind: `loop-${l.kind}`, text: l.text });
    const text = vis.map((w) => w.w).join(' ');
    if (text.includes('�')) out.push({ p: p.n, kind: 'lossy-decode', text: text.slice(Math.max(0, text.indexOf('�') - 30), text.indexOf('�') + 30) });
    else if (hasMojibake(text)) out.push({ p: p.n, kind: 'mojibake', text: text.slice(0, 80) });
  }
  return out;
}

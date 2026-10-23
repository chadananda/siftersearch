// Aligned transcript → words with times → sentences → paragraphs. A paragraph breaks at a sentence end on a change of
// speaker, a pause (≥ gap s) once it has some length, a length cap, or a chapter start. Words keep their times (click a
// word to play from it); sentences are word-index ranges (the highlighted line). Pure.

const ABBR = /^(?:dr|mr|mrs|ms|st|mt|prof|rev|jr|sr|vs|etc|e\.g|i\.e|no|vol|ch|p|pp)\.$/i;
const ENDS = /[.!?؟۔]["'”’)\]]*$/;
export const endsSentence = (w) => ENDS.test(w) && !ABBR.test(w.replace(/["'”’)\]]+$/, ''));

/** Every word of the transcript, in order, each with s/e (seconds): missing times are filled between their neighbours. */
import { fixMojibake } from './text-repair.js';

export function flattenWords(segments = []) {
  const out = [];
  for (const sg of segments) {
    let ws = (sg.words || []).filter((w) => String(w.w ?? w.word ?? '').trim());
    if (!ws.length) {   // no word alignment (unsupported language): the segment's words spread over its time
      const toks = String(sg.text || '').split(/\s+/).filter(Boolean);
      const d = (Number(sg.e) - Number(sg.s)) / Math.max(1, toks.length);
      ws = toks.map((w, i) => ({ w, s: sg.s + i * d, e: sg.s + (i + 1) * d, spk: sg.spk }));
    }
    // a LOSSY word (U+FFFD: a multi-byte letter split between two tokens in the word timestamps — Persian, 10-22) takes its
    // text from the segment's own text, which was decoded whole, when the two split into the same number of words
    if (ws.some((w) => String(w.w ?? w.word ?? '').includes('\uFFFD')) && sg.text && !String(sg.text).includes('\uFFFD')) {
      const toks = String(sg.text).trim().split(/\s+/).filter(Boolean);
      if (toks.length === ws.length) ws = ws.map((w, i) => ({ ...w, w: toks[i], word: toks[i] }));
    }
    // what is still lossy has no recoverable letters: a lone U+FFFD is dropped, one inside a word removed (10-23: '�' tokens
    // in hallucinated non-English bits blocked publication)
    ws = ws.map((w) => { const t = String(w.w ?? w.word ?? ''); return t.includes('\uFFFD') ? { ...w, w: t.replace(/\uFFFD+/g, ''), word: undefined } : w; })
      .filter((w) => String(w.w ?? w.word ?? '').trim());
    const base = out.length;
    // Whisper's own mojibake ("ìWhy … book?î") is repaired here, where ASR words enter the pipeline (text-repair.js)
    for (const w of ws) out.push({ w: fixMojibake(String(w.w ?? w.word).trim()), s: w.s ?? null, e: w.e ?? null, p: w.p ?? null, spk: w.spk ?? sg.spk ?? null, ...(sg.lang ? { lang: sg.lang } : {}) });
    // fill gaps inside this segment: between the known neighbours, else the segment's own bounds
    for (let i = base; i < out.length; i++) {
      if (out[i].s != null && out[i].e != null) continue;
      let j = i; while (j < out.length && (out[j].s == null || out[j].e == null)) j++;
      const from = i > base ? out[i - 1].e : sg.s, to = j < out.length ? out[j].s : sg.e;
      const step = (Number(to) - Number(from)) / (j - i);
      for (let k = i; k < j; k++) { out[k].s = round(from + (k - i) * step); out[k].e = round(from + (k - i + 1) * step); }
      i = j - 1;
    }
  }
  return out;
}

const round = (x) => Math.round(Number(x) * 1000) / 1000;
const majority = (arr) => { const c = new Map(); for (const v of arr) if (v) c.set(v, (c.get(v) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };

/** Words → sentences: [{ i0, i1 (exclusive), spk }]. An unpunctuated run is cut at a pause after maxRun words. */
export function sentencesOf(words, { maxRun = 60 } = {}) {
  const out = [];
  let i0 = 0;
  for (let i = 0; i < words.length; i++) {
    const n = i - i0 + 1;
    const pause = i + 1 < words.length ? words[i + 1].s - words[i].e : 0;
    // a change of language (an interpreter's turn) ends the sentence too
    const langNext = i + 1 < words.length && words[i].lang && words[i + 1].lang && words[i].lang !== words[i + 1].lang;
    if (endsSentence(words[i].w) || i === words.length - 1 || langNext || (n >= maxRun && pause >= 0.4) || n >= maxRun * 2) {
      out.push({ i0, i1: i + 1, spk: majority(words.slice(i0, i + 1).map((w) => w.spk)) });
      i0 = i + 1;
    }
  }
  return out;
}

/**
 * segments → paragraphs [{ n, t0, t1, spk, words, sentences: [[i0, i1], …] (indices into the paragraph's words) }].
 * opts: gap (s), minWords, maxWords, chapters ([seconds] where a new section starts).
 */
export function toParagraphs(segments, { gap = 1.8, minWords = 40, maxWords = 170, chapters = [] } = {}) {
  const words = flattenWords(segments);
  const sents = sentencesOf(words);
  const cuts = [...chapters].map(Number).filter((x) => x > 0).sort((a, b) => a - b);
  const paras = [];
  let cur = null;
  const close = () => { if (cur?.sents.length) paras.push(cur); cur = null; };
  for (let k = 0; k < sents.length; k++) {
    const st = sents[k];
    const t0 = words[st.i0].s;
    if (cur) {
      const n = cur.sents.reduce((a, x) => a + x.i1 - x.i0, 0);
      const prevEnd = words[cur.sents[cur.sents.length - 1].i1 - 1].e;
      const crossesChapter = cuts.some((c) => c > cur.t0 + 0.5 && c <= t0 + 0.5);
      // an INTERPRETED talk: a change of language is a new paragraph (QA 10-22: Romanian inside English paragraphs)
      const lang = words[st.i0].lang || null;
      const langChange = lang && cur.lang && lang !== cur.lang;
      if ((st.spk && cur.spk && st.spk !== cur.spk) || langChange || crossesChapter || (t0 - prevEnd >= gap && n >= minWords) || n >= maxWords) close();
    }
    if (!cur) cur = { t0, spk: st.spk, lang: words[st.i0].lang || null, sents: [] };
    cur.sents.push(st);
  }
  close();
  return paras.map((p, n) => {
    const i0 = p.sents[0].i0, i1 = p.sents[p.sents.length - 1].i1;
    const ws = words.slice(i0, i1).map(({ w, s, e }) => ({ w, s, e }));
    return { n: n + 1, t0: ws[0].s, t1: ws[ws.length - 1].e, spk: p.spk, ...(p.lang ? { lang: p.lang } : {}), words: ws, sentences: p.sents.map((x) => [x.i0 - i0, x.i1 - i0]) };
  });
}

export const paragraphText = (p) => p.words.map((w) => w.w).join(' ');
export const sentenceText = (p, [i0, i1]) => p.words.slice(i0, i1).map((w) => w.w).join(' ');

/** Speaker turns ([{ start, end, speaker }], from diarization run beside the ASR) → each segment and word gets the voice that
 *  overlaps it most. Returns new segments. Pure. */
export function assignSpeakers(segments = [], turns = []) {
  if (!turns.length) return segments;
  const ts = [...turns].sort((a, b) => a.start - b.start);
  const at = (s, e) => {
    let best = null, bo = 0;
    for (const t of ts) { if (t.start > e) break; const o = Math.min(e, t.end) - Math.max(s, t.start); if (o > bo) { bo = o; best = t.speaker; } }
    return best;
  };
  return segments.map((sg) => ({ ...sg, spk: at(sg.s, sg.e), words: (sg.words || []).map((w) => (w.s != null && w.e != null ? { ...w, spk: at(w.s, w.e) } : w)) }));
}

/** Diarization FRAGMENTS folded away: a voice with under `minShare` of the talk time and under `minSeconds` is relabelled
 *  as the voice of the turn before it (else after) — the pilot's 46-minute lecture came back as 94 "speakers". Pure. */
export function smoothTurns(turns = [], { minSeconds = 20, minShare = 0.015 } = {}) {
  const ts = [...turns].sort((a, b) => a.start - b.start);
  const talk = new Map();
  for (const t of ts) talk.set(t.speaker, (talk.get(t.speaker) || 0) + (t.end - t.start));
  const total = [...talk.values()].reduce((a, b) => a + b, 0) || 1;
  const keep = new Set([...talk].filter(([, s]) => s >= minSeconds || s / total >= minShare).map(([k]) => k));
  if (!keep.size) return ts;
  return ts.map((t, i) => {
    if (keep.has(t.speaker)) return t;
    const near = ts.slice(0, i).reverse().find((x) => keep.has(x.speaker)) || ts.slice(i + 1).find((x) => keep.has(x.speaker));
    return { ...t, speaker: near ? near.speaker : t.speaker };
  });
}

// THE COPY-EDIT PASS (Chad 10-22: "the LLM pass must clean SPELLING and ASR artifacts too, not only names"): per chunk of
// paragraphs the model (role media-clean) proposes small edits, each with a KIND and a confidence; a guard accepts only
// edits whose kind it can verify — a filler or stutter dropped, a looped repeat or a subtitle hallucination removed, a
// misspelling or homophone fixed (sounds alike), a capital or a sentence boundary changed (same letters), a broken word
// joined — and never a paraphrase. Dropped words are HIDDEN, not deleted (each keeps its time, so click-to-play and the
// highlight stay aligned); replaced words share their span's time. Every change is logged; low-confidence ones are only
// flagged for review. The verbatim words are kept beside the clean ones. Pure, except cleanParagraphs (model call injected).
import { keyOf, levenshtein, findSpan, applyEdits } from './vocab.js';
import { sentencesOf } from './paragraphs.js';

export const FILLERS = new Set(['um', 'uh', 'umm', 'uhm', 'er', 'erm', 'ah', 'hmm', 'mm', 'mhm', 'eh']);
export const HALLUCINATION = /thanks? (?:you )?for watching|please subscribe|like and subscribe|subtitles? by|captions? by|transcri(?:bed|ption) by|amara\.org|translated by|www\.[a-z]+\.(?:com|org)|copyright ©/i;
export const KINDS = ['filler', 'stutter', 'repeat', 'hallucination', 'spelling', 'homophone', 'capitalisation', 'punctuation', 'broken'];
const DROPS = new Set(['filler', 'stutter', 'repeat', 'hallucination']);

const tokens = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const keys = (s) => tokens(s).map(keyOf).filter(Boolean);
const letters = (s) => keyOf(String(s || '').replace(/\s+/g, ''));

/** A crude English sound key: vowels after the first letter dropped, common digraphs folded ("their" ~ "there", "two" ~ "too"). */
export function soundKey(w) {
  const k = keyOf(w).replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/gh/g, '').replace(/wh/g, 'w').replace(/kn/g, 'n').replace(/wr/g, 'r').replace(/(.)\1+/g, '$1');
  return k ? k[0] + k.slice(1).replace(/[aeiouy]/g, '') : '';
}

/**
 * Judge one proposed edit against the paragraph's words. → { ok: { i0, i1, to, kind, hide? } } or { refused: why } or
 * { flagged: why } (plausible but not certain: left for a person).
 */
export function judgeEdit(words, e, { minConfidence = 0.7 } = {}) {
  const kind = String(e?.kind || '').toLowerCase().replace('capitalization', 'capitalisation');
  const from = String(e?.from || '').trim(), to = String(e?.to ?? '').trim();
  if (!KINDS.includes(kind)) return { refused: `unknown kind "${e?.kind}"` };
  if (!from) return { refused: 'empty' };
  const fw = tokens(from), tw = tokens(to);
  const drop = DROPS.has(kind);
  if (fw.length > (drop ? 40 : 4)) return { refused: 'span too long' };
  const i0 = findSpan(words, from);
  if (i0 < 0) return { refused: 'not in the text' };
  const i1 = i0 + fw.length;
  const fk = keys(from), tk = keys(to);
  if (Number(e.confidence ?? 1) < minConfidence) return { flagged: `low confidence (${e.confidence})`, i0, i1, from, to, kind };

  if (kind === 'filler') {
    if (fk.length && fk.every((k) => FILLERS.has(k)) && !tk.length) return { ok: { i0, i1, kind, hide: true } };
    return { refused: 'not a filler' };
  }
  if (kind === 'hallucination') return HALLUCINATION.test(from) && !tk.length ? { ok: { i0, i1, kind, hide: true } } : { refused: 'not a known hallucination' };
  if (kind === 'stutter' || kind === 'repeat') {
    // what stays must be the end of the span (the last saying), and everything dropped must repeat it or start it
    if (!tk.length || tk.length >= fk.length) return { refused: 'nothing dropped' };
    const tail = fk.slice(fk.length - tk.length);
    if (tail.join(' ') !== tk.join(' ')) return { refused: 'the kept words are not the last saying' };
    const dropped = fk.slice(0, fk.length - tk.length);
    const repeats = dropped.every((k, i) => tk.includes(k) || tk.some((t) => t.startsWith(k) && k.length >= 1) || k === dropped[i - 1]);
    if (!repeats) return { refused: 'dropped words are not a repeat' };
    return { ok: { i0, i1: i0 + dropped.length, kind, hide: true } };
  }
  if (kind === 'capitalisation') return fk.join(' ') === tk.join(' ') && fw.length === tw.length ? { ok: { i0, i1, kind, to } } : { refused: 'not only the case' };
  if (kind === 'punctuation') return fk.join('') === tk.join('') && fw.length === tw.length ? { ok: { i0, i1, kind, to } } : { refused: 'letters changed' };
  if (kind === 'broken') return letters(from) === letters(to) && tw.length < fw.length ? { ok: { i0, i1, kind, to } } : { refused: 'not a broken word' };
  if (kind === 'spelling' || kind === 'homophone') {
    if (fw.length !== tw.length || fw.length > 2) return { refused: 'a spelling fix keeps the word count' };
    for (let i = 0; i < fk.length; i++) {
      const a = fk[i], b = tk[i];
      const close = levenshtein(a, b, 9) <= Math.max(2, Math.ceil(Math.max(a.length, b.length) * 0.34));
      const sound = soundKey(a) && soundKey(a) === soundKey(b);
      if (!(kind === 'spelling' ? close : (sound || close))) return { refused: 'does not sound alike' };
    }
    return { ok: { i0, i1, kind, to } };
  }
  return { refused: 'unhandled' };
}

/** Apply judged edits to a paragraph's words → new words. Hidden words keep text and time with hide: true; replacements
 *  keep a token-for-token time when the count matches, else share the span's time (applyEdits). */
export function applyClean(words, oks) {
  let ws = words.map((w) => ({ ...w }));
  const replace = [];
  for (const e of oks) {
    if (e.hide) { for (let k = e.i0; k < e.i1; k++) ws[k] = { ...ws[k], hide: true }; continue; }
    const tw = tokens(e.to);
    if (tw.length === e.i1 - e.i0) tw.forEach((t, j) => { if (ws[e.i0 + j].w !== t) ws[e.i0 + j] = { ...ws[e.i0 + j], w: t, v: ws[e.i0 + j].v ?? ws[e.i0 + j].w }; });
    else replace.push({ i0: e.i0, i1: e.i1, to: e.to });
  }
  if (replace.length) ws = applyEdits(ws, replace);
  return ws;
}

/** Judge a paragraph's proposals: non-overlapping accepted edits, refusals and flags. */
export function judgeAll(words, proposals, opts) {
  const ok = [], refused = [], flagged = [], used = new Set();
  for (const e of proposals || []) {
    const j = judgeEdit(words, e, opts);
    if (j.refused) { refused.push({ from: e?.from, to: e?.to, kind: e?.kind, why: j.refused }); continue; }
    if (j.flagged) { flagged.push({ from: e.from, to: e.to, kind: e.kind, why: j.flagged }); continue; }
    const span = [...Array(j.ok.i1 - j.ok.i0).keys()].map((k) => j.ok.i0 + k);
    if (span.some((k) => used.has(k))) { refused.push({ from: e.from, to: e.to, kind: e.kind, why: 'overlaps another edit' }); continue; }
    span.forEach((k) => used.add(k));
    ok.push({ ...j.ok, from: words.slice(j.ok.i0, j.ok.i1).map((w) => w.w).join(' ') });
  }
  return { ok: ok.sort((a, b) => b.i0 - a.i0), refused, flagged };
}

const displayText = (p) => p.words.filter((w) => !w.hide).map((w) => w.w).join(' ');

/** The pass over a transcript. ask(prompt) → parsed JSON { edits: [...] } (the media-clean role). → { paragraphs, log, stats } */
export async function cleanParagraphs(paragraphs, ask, { chunkWords = 1200 } = {}) {
  const byN = new Map(paragraphs.map((p) => [p.n, { ...p, words: p.words.map((w) => ({ ...w })) }]));
  const chunks = [];
  let cur = [], n = 0;
  for (const p of paragraphs) { cur.push(p.n); n += p.words.length; if (n >= chunkWords) { chunks.push(cur); cur = []; n = 0; } }
  if (cur.length) chunks.push(cur);
  const log = [], stats = { applied: 0, hidden_words: 0, refused: 0, flagged: 0, by_kind: {} };
  for (const ch of chunks) {
    const text = ch.map((pn) => `[${pn}] ${displayText(byN.get(pn))}`).join('\n');
    const out = await ask(`You copy-edit a speech-recognition transcript of a recorded talk. Keep it VERBATIM-FAITHFUL: never paraphrase, summarise, reorder, add words or improve the speaker's wording; quotations stay exactly as spoken. Propose only these small edits, each with its kind:
- filler: drop "um", "uh", "er", "ah", "hmm" (to = "")
- stutter: a false start or stammer ("the the", "I- I think") → keep only the last saying (to = the kept words)
- repeat: an ASR loop (the same phrase repeated by mistake) → keep one (to = one copy)
- hallucination: an invented line in a silence ("Thank you for watching", subtitle credits) → to = ""
- spelling: a misspelled word → its spelling (same number of words)
- homophone: a mis-heard word that sounds alike, clear from context ("their" for "there") → the right word
- capitalisation: wrong capitals only (same letters)
- punctuation: a run-on or a wrong sentence boundary → the same words with corrected punctuation and capitals
- broken: one word split apart ("Bah ai") → joined
Each edit: "from" = the exact words from the text (as few as possible), "to" = the replacement, "kind", "confidence" 0-1 (below 0.7 when unsure — those are only flagged for a person). Do not touch names and religious terms (already corrected).
${text}
Return JSON {"edits":[{"p": paragraph number, "from": "…", "to": "…", "kind": "…", "confidence": 0.0}]} — {"edits":[]} when nothing needs fixing.`);
    const byP = new Map();
    for (const e of out?.edits || []) { const pn = Number(e?.p); if (!byP.has(pn)) byP.set(pn, []); byP.get(pn).push(e); }
    for (const [pn, edits] of byP) {
      const p = byN.get(pn);
      if (!p) continue;
      const j = judgeAll(p.words, edits);
      for (const e of j.ok) {
        log.push({ p: pn, at: p.words[e.i0]?.s ?? null, kind: e.kind, from: e.from, to: e.hide ? '' : e.to });
        stats.applied++; stats.by_kind[e.kind] = (stats.by_kind[e.kind] || 0) + 1;
        if (e.hide) stats.hidden_words += e.i1 - e.i0;
      }
      stats.refused += j.refused.length; stats.flagged += j.flagged.length;
      for (const f of j.flagged) log.push({ p: pn, flagged: true, kind: f.kind, from: f.from, to: f.to, why: f.why });
      p.words = applyClean(p.words, j.ok);
    }
  }
  // the paragraph's sentences are word ranges: applyEdits may change the count (a broken word joined) — rebuild them
  const fixed = paragraphs.map((p0) => {
    const p = byN.get(p0.n);
    if (p.words.length === p0.words.length) return p;
    return { ...p, sentences: sentencesOf(p.words).map((x) => [x.i0, x.i1]) };
  });
  return { paragraphs: fixed, log, stats };
}

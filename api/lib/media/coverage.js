// TRANSCRIPT COVERAGE (Chad 10-29): speech the audio holds that no word accounts for. Whisper can skip a stretch whole; the aligner then
// squeezes the next sentence into the gap, so the transcript reads fine and is wrong (includes-martha-root-1932: 24 s missing at 2:44).
// Deterministic: an energy VAD over the listening copy, minus the union of the word intervals. Holes are re-transcribed alone and spliced
// in; what stays a hole blocks publishing. Pure maths (speechSpans / findHoles / rateOutliers) + one orchestrator with injected tools.
// WORKER-ONLY (tower placement): coverageCheck decodes and transcribes, so it runs inside the worker image (whole-recording.mjs sets
// MEDIA_TOWER_HEAVY=1) and refuses anywhere else. tests/api/tower-placement-ratchet.test.js holds it to that.
import { spliceWindow } from './paragraphs.js';

export const HOP = 0.05;                 // seconds per energy frame
export const MIN_HOLE_S = 3;             // an uncovered stretch of speech this long is a hole
export const TOL_S = 0.4;                // a word covers this much audio either side of itself
export const MAX_FAST_WPS = 6.5;         // words per second above which a sentence was squeezed
export const GAP_NOTE_S = 15;            // a stretch this long without words is noted on the checklist (a measurement; nothing blocks publishing — Chad 10-31 night)

/** Streams mono PCM into per-frame dB levels. push(Float32Array) → dbs(). */
export function makeFramer(sr = 16000, hop = HOP) {
  const n = Math.round(sr * hop), dbs = [];
  let sum = 0, cnt = 0;
  return {
    push(f) { for (let i = 0; i < f.length; i++) { sum += f[i] * f[i]; if (++cnt === n) { dbs.push(20 * Math.log10(Math.sqrt(sum / n) + 1e-6)); sum = 0; cnt = 0; } } },
    dbs: () => dbs,
  };
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

/** Frame dB levels → [{ s, e }] spans of sound well above the recording's own floor (gaps < 0.5 s closed, blips < 0.25 s dropped). */
export function speechSpans(dbs, hop = HOP) {
  if (!dbs.length) return [];
  const floor = pct(dbs, 0.1), top = pct(dbs, 0.95), thr = floor + Math.max(8, 0.3 * (top - floor));
  const spans = [];
  let s = null;
  dbs.forEach((v, i) => { if (v >= thr) { if (s == null) s = i; } else if (s != null) { spans.push({ s: s * hop, e: i * hop }); s = null; } });
  if (s != null) spans.push({ s: s * hop, e: dbs.length * hop });
  const merged = [];
  for (const sp of spans) { const l = merged[merged.length - 1]; if (l && sp.s - l.e < 0.5) l.e = sp.e; else merged.push({ ...sp }); }
  return merged.filter((sp) => sp.e - sp.s >= 0.25);
}

const union = (iv) => { const out = []; for (const x of [...iv].sort((a, b) => a.s - b.s)) { const l = out[out.length - 1]; if (l && x.s <= l.e) l.e = Math.max(l.e, x.e); else out.push({ ...x }); } return out; };
const subtract = (spans, cover) => {
  const out = [];
  for (const sp of spans) {
    let cur = sp.s;
    for (const c of cover) { if (c.e <= cur) continue; if (c.s >= sp.e) break; if (c.s > cur) out.push({ s: cur, e: c.s }); cur = Math.max(cur, c.e); }
    if (cur < sp.e) out.push({ s: cur, e: sp.e });
  }
  return out;
};

/** The words' [s, e] intervals from segments (or paragraphs): anything with times. */
export function wordIntervals(segments = []) {
  const out = [];
  for (const sg of segments) for (const w of sg.words || []) { if (w.s != null && w.e != null && !w.hide) out.push({ s: w.s, e: w.e }); }
  return out;
}

/** Speech not covered by any word (± tol), as holes ≥ minHole seconds. `ignore` = spans already confirmed to hold no speech. */
export function findHoles({ words, speech, ignore = [], minHole = MIN_HOLE_S, tol = TOL_S }) {
  const cover = union([...words.map((w) => ({ s: w.s - tol, e: w.e + tol })), ...ignore]);
  const raw = subtract(speech, cover);
  const uncovered_s = raw.reduce((a, x) => a + (x.e - x.s), 0);
  return { holes: raw.filter((x) => x.e - x.s >= minHole).map((x) => ({ s: Math.round(x.s * 100) / 100, e: Math.round(x.e * 100) / 100 })), uncovered_s: Math.round(uncovered_s * 10) / 10 };
}

/** Sentences squeezed into too little time: segments of ≥ 8 words faster than MAX_FAST_WPS. */
export function rateOutliers(segments = [], maxWps = MAX_FAST_WPS) {
  const out = [];
  for (const sg of segments) {
    const ws = (sg.words || []).filter((w) => w.s != null && w.e != null);
    if (ws.length < 8) continue;
    const dur = ws.at(-1).e - ws[0].s;
    if (dur > 0 && ws.length / dur > maxWps) out.push({ s: ws[0].s, e: ws.at(-1).e, wps: Math.round((ws.length / dur) * 10) / 10 });
  }
  return out;
}

/** The whole measurement for one transcript against its speech spans. Pure. */
export function measureCoverage(segments, speech, { ignore = [] } = {}) {
  const speech_s = Math.round(speech.reduce((a, x) => a + (x.e - x.s), 0) * 10) / 10;
  const { holes, uncovered_s } = findHoles({ words: wordIntervals(segments), speech, ignore });
  return { speech_s, holes, uncovered_s, uncovered_pct: speech_s ? Math.round((uncovered_s / speech_s) * 1000) / 10 : 0, fast: rateOutliers(segments) };
}

/** Speech spans of a media file (16 kHz mono through tools.pcmStream). */
export async function speechOf(file, tools) {
  const fr = makeFramer();
  await tools.pcmStream(file, 16000, fr.push);
  return speechSpans(fr.dbs());
}

/** Find the holes in `segments`, re-transcribe each (1.5 s of context either side; all windows in one model load), splice what comes back and
 *  re-measure. A hole whose window yields no words is recorded as non-speech (music, noise) and not counted again.
 *  tools: { pcmStream, ffmpeg, asr }, io: { readJson, writeJson, unlink, tmp } — injected. Returns { segments, coverage }. */
/** Which holes to re-transcribe: the longest first (the ones that would block publishing), at most max, returned latest first so earlier
 *  indexes stay valid while splicing. (10-31: it took the first 12 by time; 49 of 57 blocked talks had > 12 holes and the blocking one was never tried.) */
export const holesToRetry = (holes, max) => [...holes].sort((a, b) => (b.e - b.s) - (a.e - a.s)).slice(0, max).sort((a, b) => b.s - a.s);
export const WORKER_ONLY = true;
export const onWorker = () => process.env.MEDIA_TOWER_HEAVY === '1';
// EVERY hole is retried (Chad: no caps). 10-31: talk 1947's whole-file ASR left 259 holes (94 % of its speech without words); 12 were tried, the
//  transcript kept 221 words for 58 min, the word guard compared the remaster against it (21 % "differ") and render blocked on the speech gaps.
export async function coverageCheck({ file, segments, tools, asrOpts = {}, lang = '', stop, io, maxWindows = Infinity }) {
  if (!onWorker()) throw Error('coverageCheck runs only inside the worker image (tower placement)');
  const speech = await speechOf(file, tools);
  const before = measureCoverage(segments, speech);
  let segs = segments;
  const nonspeech = [];
  // ONE pass (Chad 10-31 night: "retry at most once per hole; don't loop"): every hole's window in one --windows call, words found are spliced
  // in, a window with none is non-speech. What is left stays on the record as a measurement; it never blocks publishing (tape flips, applause,
  // music and walk-ups are normal in these recordings — 2161: a 24 s tape flip).
  const r = before.holes.length ? await retryWindows({ file, segs, holes: holesToRetry(before.holes, maxWindows), tools, asrOpts, lang, stop, io, round: 1 })
    : { segs, repaired: 0, errors: 0, nonspeech: [] };
  segs = r.segs; nonspeech.push(...r.nonspeech);
  const { repaired, errors } = r, rounds = before.holes.length ? 1 : 0;
  const after = measureCoverage(segs, speech, { ignore: nonspeech });
  return {
    segments: segs,
    coverage: { speech_s: before.speech_s, holes_before: before.holes.length, uncovered_before_s: before.uncovered_s, repaired, nonspeech: nonspeech.length, errors, rounds,
      holes_after: after.holes, uncovered_after_s: after.uncovered_s, uncovered_after_pct: after.uncovered_pct, fast: after.fast.slice(0, 20) },
  };
}

/** One round: cut every hole's window, transcribe ALL in ONE media_tool call (--windows: Whisper and the align model load once — 10-31 aorus:
 *  a fresh process per hole held a 26-min talk 2 h in transcribe), splice latest first. → { segs, repaired, errors, nonspeech }. */
async function retryWindows({ file, segs, holes, tools, asrOpts, lang, stop, io, round }) {
  const nonspeech = [];
  let repaired = 0, errors = 0;
  const wins = holes.map((h) => { const wav = io.tmp(`cov-${round}-${Math.round(h.s)}.wav`); return { h, start: Math.max(0, h.s - 1.5), wav, wout: `${wav}.json` }; });
  const manifest = io.tmp(`cov-windows-${round}.json`);
  try {
    const cut = [];
    for (const w of wins) {
      try { await tools.ffmpeg(['-ss', String(w.start), '-t', String(w.h.e - w.start + 1.5), '-i', file, '-ac', '1', '-ar', '16000', w.wav], { stop }); cut.push(w); }
      catch (err) { if (err.code === 'DRAIN') throw err; errors++; }
    }
    let ran = !cut.length;
    if (cut.length) {
      try {
        await io.writeJson(manifest, cut.map((w) => ({ input: w.wav, output: w.wout })));
        await tools.asr('transcribe', cut[0].wav, { ...asrOpts, lang: lang === 'multi' ? '' : lang, windows: manifest, batch: 8 }, { stop });
        ran = true;
      } catch (err) { if (err.code === 'DRAIN') throw err; errors += cut.length; }
    }
    for (const w of ran ? cut : []) {   // latest first (holesToRetry's order): earlier indexes stay valid while splicing
      const got = await io.readJson(w.wout, null).catch(() => null);
      if (!got) { errors++; continue; }   // that clip failed inside the batch
      const fresh = got.segments || [], h = w.h;
      let i = segs.findIndex((sg) => sg.s >= h.s); if (i < 0) i = segs.length;
      const next = spliceWindow(segs, { i0: i, i1: i, s: h.s - TOL_S, e: h.e + TOL_S, lang: lang === 'multi' ? null : lang }, fresh, w.start);
      if (wordIntervals(next).length > wordIntervals(segs).length) { segs = next; repaired++; } else nonspeech.push(h);
    }
  } finally {
    for (const w of wins) { await io.unlink(w.wav).catch(() => {}); await io.unlink(w.wout).catch(() => {}); }
    await io.unlink(manifest).catch(() => {});
  }
  return { segs, repaired, errors, nonspeech };
}

/** Is the LISTENING copy silent through a hole? wave = trim.js peaksOf(waveform.json) (the web copy, original time). Every peak zero
 *  between the hole's edges (± TOL_S) = nothing a listener hears there, so no words are missing from what is published. The coverage
 *  is measured on the ASR input (the original) with an energy VAD, which counts applause as speech; the remaster and the quiet pass
 *  remove it (10-31 talk 1999: "let us welcome Mr. Sahba…" — 15.25 s of applause — "Thank you very much"; the web copy is 0 throughout). */
export const silentIn = (wave) => (h) => {
  const peaks = wave?.peaks || [], a = Math.ceil((h.s + TOL_S) * (wave?.pps || 0)), b = Math.floor((h.e - TOL_S) * (wave?.pps || 0));
  if (!peaks.length || b <= a || b > peaks.length) return false;
  for (let i = a; i < b; i++) if (peaks[i] > 0) return false;
  return true;
};

/** What the transcript still lacks, from a stored coverage record: MEASUREMENTS for the checklist, never a publish blocker (Chad 10-31 night:
 *  "a speech gap must NEVER block publish" — 2161's 24 s gap is a tape flip). Holes under minS and holes the listening copy is silent
 *  through (silent, above) are left out; an unmeasured transcript is recorded as such. → [{ kind, text, s?, e? }] */
export function coverageGaps(cov, minS = GAP_NOTE_S, { silent = () => false } = {}) {
  if (!cov) return [];
  if (cov.unmeasured) return [{ kind: 'coverage-unmeasured', text: cov.why || 'the transcript was never measured against the speech' }];
  return (cov.holes_after || []).filter((x) => x.e - x.s >= minS && !silent(x)).map((h) => ({ kind: 'speech-gap', s: h.s, e: h.e, text: `${h.s}–${h.e} s of speech has no words` }));
}

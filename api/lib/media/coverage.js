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

/** Find the holes in `segments`, re-transcribe each on its own (1.5 s of context either side), splice what comes back and
 *  re-measure. A hole whose window yields no words is recorded as non-speech (music, noise) and not counted again.
 *  tools: { pcmStream, ffmpeg, asr }, io: { readJson, unlink, tmp } — injected. Returns { segments, coverage }. */
export const WORKER_ONLY = true;
export const onWorker = () => process.env.MEDIA_TOWER_HEAVY === '1';
export async function coverageCheck({ file, segments, tools, asrOpts = {}, lang = '', stop, io, maxWindows = 12 }) {
  if (!onWorker()) throw Error('coverageCheck runs only inside the worker image (tower placement)');
  const speech = await speechOf(file, tools);
  const before = measureCoverage(segments, speech);
  let segs = segments;
  const nonspeech = [];
  let repaired = 0, errors = 0;
  for (const h of [...before.holes].slice(0, maxWindows).reverse()) {   // from the end, so earlier indexes stay valid
    const start = Math.max(0, h.s - 1.5), wav = io.tmp(`cov-${Math.round(h.s)}.wav`), wout = `${wav}.json`;
    try {
      await tools.ffmpeg(['-ss', String(start), '-t', String(h.e - start + 1.5), '-i', file, '-ac', '1', '-ar', '16000', wav], { stop });
      await tools.asr('transcribe', wav, { ...asrOpts, lang: lang === 'multi' ? '' : lang, output: wout, batch: 8 }, { stop });
      const fresh = (await io.readJson(wout, { segments: [] })).segments || [];
      let i = segs.findIndex((sg) => sg.s >= h.s); if (i < 0) i = segs.length;
      const next = spliceWindow(segs, { i0: i, i1: i, s: h.s - TOL_S, e: h.e + TOL_S, lang: lang === 'multi' ? null : lang }, fresh, start);
      if (wordIntervals(next).length > wordIntervals(segs).length) { segs = next; repaired++; } else nonspeech.push(h);
    } catch (err) { if (err.code === 'DRAIN') throw err; errors++; }
    finally { await io.unlink(wav).catch(() => {}); await io.unlink(wout).catch(() => {}); }
  }
  const after = measureCoverage(segs, speech, { ignore: nonspeech });
  return {
    segments: segs,
    coverage: { speech_s: before.speech_s, holes_before: before.holes.length, uncovered_before_s: before.uncovered_s, repaired, nonspeech: nonspeech.length, errors,
      holes_after: after.holes, uncovered_after_s: after.uncovered_s, uncovered_after_pct: after.uncovered_pct, fast: after.fast.slice(0, 20) },
  };
}

/** Publish-gate problems from a stored coverage record (none recorded = not yet measured = no problem; the scan fills those in). */
export function coverageProblems(cov) {
  if (!cov) return [];
  const out = [];
  for (const h of cov.holes_after || []) out.push({ p: 0, kind: 'speech-gap', text: `${h.s}–${h.e} s of speech has no words` });
  return out;
}

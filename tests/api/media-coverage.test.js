// Transcript coverage: speech with no words is found, repaired by re-transcribing the window, and blocks publishing when it stays.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { holesToRetry, speechSpans, findHoles, rateOutliers, measureCoverage, coverageCheck, coverageProblems, makeFramer } from '../../api/lib/media/coverage.js';

const dbsOf = (spans, total, hop = 0.05) => Array.from({ length: Math.round(total / hop) }, (_, i) => { const t = i * hop; return spans.some(([s, e]) => t >= s && t < e) ? -20 : -60; });
const words = (from, to, step = 0.4) => { const out = []; for (let t = from; t + 0.3 <= to; t += step) out.push({ w: 'x', s: t, e: t + 0.3 }); return out; };

describe('speechSpans', () => {
  it('finds sound above the floor and closes short pauses', () => {
    const sp = speechSpans(dbsOf([[1, 4], [4.3, 8]], 10));
    expect(sp).toHaveLength(1);
    expect(sp[0].s).toBeCloseTo(1, 1); expect(sp[0].e).toBeCloseTo(8, 1);
  });
});

describe('findHoles', () => {
  const speech = [{ s: 0, e: 40 }];
  it('is empty when words cover the speech', () => expect(findHoles({ words: words(0, 40), speech }).holes).toEqual([]));
  it('finds a 24 s hole (the Martha Root case)', () => {
    const r = findHoles({ words: [...words(0, 16), ...words(40 - 0.3 - 0, 40)], speech: [{ s: 0, e: 40 }] });
    expect(r.holes).toHaveLength(1);
    expect(r.holes[0].e - r.holes[0].s).toBeGreaterThan(20);
  });
  it('ignores a pause shorter than the hole minimum', () => expect(findHoles({ words: [...words(0, 10), ...words(12, 20)], speech: [{ s: 0, e: 20 }] }).holes).toEqual([]));
  it('does not count spans already confirmed as non-speech', () => {
    expect(findHoles({ words: words(0, 5), speech: [{ s: 0, e: 20 }], ignore: [{ s: 5, e: 20 }] }).holes).toEqual([]);
  });
});

describe('rateOutliers', () => {
  it('flags a sentence squeezed into too little time', () => {
    const ws = Array.from({ length: 26 }, (_, i) => ({ w: 'x', s: i * 0.12, e: i * 0.12 + 0.1 }));
    expect(rateOutliers([{ words: ws }])).toHaveLength(1);
    expect(rateOutliers([{ words: words(0, 6) }])).toEqual([]);
  });
});

describe('coverageCheck', () => {
  beforeAll(() => { process.env.MEDIA_TOWER_HEAVY = '1'; });   // as inside the worker image
  afterAll(() => { delete process.env.MEDIA_TOWER_HEAVY; });
  const frames = dbsOf([[0, 40]], 40);
  const mk = (asrWords) => ({
    tools: {
      pcmStream: async (_f, _sr, on) => { const fr = makeFramer(); void fr; const a = new Float32Array(16000 * 40); a.fill(0.1, 0, 16000 * 34); on(a); },
      ffmpeg: async () => {},
      asr: async () => {},
    },
    io: { tmp: (n) => `/tmp/${n}`, writeJson: async () => {}, unlink: async () => {}, readJson: async () => ({ segments: asrWords.length ? [{ s: 0, e: 20, words: asrWords }] : [] }) },
  });
  const base = [{ s: 0, e: 16, words: words(0, 16) }, { s: 33, e: 34, words: words(33, 34) }];
  void frames;
  it('splices the re-transcribed window and clears the hole', async () => {
    const { tools, io } = mk(words(1.5, 20));   // window starts at ~14.5 s → words land 16–34
    const r = await coverageCheck({ file: 'a.m4a', segments: base, tools, io, lang: 'en' });
    expect(r.coverage.holes_before).toBe(1);
    expect(r.coverage.repaired).toBe(1);
    expect(r.coverage.holes_after).toEqual([]);
    expect(r.segments.length).toBeGreaterThan(base.length);
  });
  it('records a window that yields no words as non-speech, not as a failure', async () => {
    const { tools, io } = mk([]);
    const r = await coverageCheck({ file: 'a.m4a', segments: base, tools, io, lang: 'en' });
    expect(r.coverage.nonspeech).toBe(1);
    expect(r.coverage.holes_after).toEqual([]);
  });
  it('retries EVERY hole, not the first 12 (Chad: no caps; 10-31 talk 1947: 259 holes, 12 tried, 94 % of its speech left without words)', async () => {
    let asrCalls = 0, manifest = null;
    const tools = { pcmStream: async (_f, _sr, on) => { const a = new Float32Array(16000 * 140); a.fill(0.1, 0, 16000 * 70); on(a); }, ffmpeg: async () => {}, asr: async (_s, _i, o) => { asrCalls++; expect(o.windows).toBe('/tmp/cov-windows.json'); } };
    const io = { tmp: (n) => `/tmp/${n}`, writeJson: async (p, v) => { manifest = v; }, unlink: async () => {}, readJson: async () => ({ segments: [] }) };
    const lone = []; for (let t = 0; t < 70; t += 5) lone.push({ s: t, e: t + 0.3, words: [{ w: 'x', s: t, e: t + 0.3 }] });
    const r = await coverageCheck({ file: 'a.m4a', segments: lone, tools, io, lang: 'en' });
    expect(r.coverage.holes_before).toBeGreaterThan(12);
    expect(manifest.length).toBe(r.coverage.holes_before);   // every hole is in the batch
    expect(r.coverage.nonspeech).toBe(r.coverage.holes_before);
    // ONE model load for all of them (10-31 aorus: a process per hole kept a 26-min talk 2 h in transcribe)
    expect(asrCalls).toBe(1);
  });
  it('a clip that failed inside the batch (no output) counts as an error, not as non-speech; a failed batch counts every clip', async () => {
    const pcm = async (_f, _sr, on) => { const a = new Float32Array(16000 * 40); a.fill(0.1, 0, 16000 * 34); on(a); };
    const io = { tmp: (n) => `/tmp/${n}`, writeJson: async () => {}, unlink: async () => {}, readJson: async () => null };
    const r = await coverageCheck({ file: 'a.m4a', segments: base, tools: { pcmStream: pcm, ffmpeg: async () => {}, asr: async () => {} }, io, lang: 'en' });
    expect([r.coverage.errors, r.coverage.nonspeech, r.coverage.holes_after.length]).toEqual([1, 0, 1]);
    const f = await coverageCheck({ file: 'a.m4a', segments: base, tools: { pcmStream: pcm, ffmpeg: async () => {}, asr: async () => { throw new Error('cuda'); } }, io, lang: 'en' });
    expect(f.coverage.errors).toBe(1);
  });
  it('leaves the hole on the record when the re-transcription finds nothing usable and it cannot tell (the gate blocks it once it is long)', async () => {
    const { tools, io } = mk(words(1.5, 3));
    const r = await coverageCheck({ file: 'a.m4a', segments: base, tools, io, lang: 'en' });
    expect(r.coverage.holes_after.length).toBeGreaterThan(0);
    expect(coverageProblems(r.coverage, 0).length).toBeGreaterThan(0);
  });
});

describe('holesToRetry', () => {
  it('tries the longest holes first, then splices from the end (10-31: the blocking 17 s hole was hole 13+ and never tried)', () => {
    const holes = [...Array(14)].map((_, i) => ({ s: i * 100, e: i * 100 + 4 })).concat([{ s: 4125.95, e: 4143.28 }]);
    const r = holesToRetry(holes, 12);
    expect(r).toHaveLength(12);
    expect(r[0]).toEqual({ s: 4125.95, e: 4143.28 });
    expect(r.map((h) => h.s)).toEqual([...r.map((h) => h.s)].sort((a, b) => b - a));
  });
});

describe('coverageProblems', () => {
  it('is empty when nothing was measured or nothing remains', () => { expect(coverageProblems(null)).toEqual([]); expect(coverageProblems({ holes_after: [] })).toEqual([]); });
  it('reports each remaining hole', () => expect(coverageProblems({ holes_after: [{ s: 164.5, e: 188.8 }] })[0].kind).toBe('speech-gap'));
  it('a few seconds without words is normal and never blocks; a skipped passage does (Chad 10-31)', () =>
    expect(coverageProblems({ holes_after: [{ s: 137.83, e: 142.8 }, { s: 164.5, e: 188.8 }] }).map((x) => x.text)).toEqual(['164.5–188.8 s of speech has no words']));
  it('a NEW transcript made outside the worker (coverage unmeasured) blocks publishing (10-31: 1947 published 221 words of 58 min)', () =>
    expect(coverageProblems({ unmeasured: true, why: 'transcribed outside the worker image' })[0].kind).toBe('coverage-unmeasured'));
});
void measureCoverage;

describe('silentIn: a hole the listening copy is silent through does not block (10-31 talk 1999)', () => {
  // 1999: "let us welcome Mr. Sahba … himself." 2951.9 s, then 15.25 s of applause (energy VAD = speech), "Thank you very much" 2969.7 s;
  // the remaster + quiet pass left the web copy at 0 from 2953 to 2968 s
  const pps = 20, peaks = new Array(3000 * pps).fill(0.3);
  for (let i = 2953 * pps; i < 2969 * pps; i++) peaks[i] = 0;
  const cov = { holes_after: [{ s: 2954.15, e: 2969.4 }] };
  it('blocks without a waveform, passes when the listening copy is silent through the hole', async () => {
    const { silentIn } = await import('../../api/lib/media/coverage.js');
    expect(coverageProblems(cov).length).toBe(1);
    expect(coverageProblems(cov, undefined, { silent: silentIn(null) }).length).toBe(1);
    expect(coverageProblems(cov, undefined, { silent: silentIn({ peaks, pps }) })).toEqual([]);
  });
  it('still blocks when any sound is heard inside the hole', async () => {
    const { silentIn } = await import('../../api/lib/media/coverage.js');
    const heard = [...peaks]; heard[2960 * pps] = 0.01;
    expect(coverageProblems(cov, undefined, { silent: silentIn({ peaks: heard, pps }) }).length).toBe(1);
    expect(coverageProblems({ holes_after: [{ s: 2954.15, e: 3100 }] }, undefined, { silent: silentIn({ peaks, pps }) }).length).toBe(1);   // past the waveform's end
  });
});

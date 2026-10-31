// Transcript coverage: speech with no words is found, re-transcribed once per hole; what stays is a checklist measurement and never blocks publishing (Chad 10-31 night).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { holesToRetry, speechSpans, findHoles, rateOutliers, measureCoverage, coverageCheck, coverageGaps, makeFramer } from '../../api/lib/media/coverage.js';

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
    const tools = { pcmStream: async (_f, _sr, on) => { const a = new Float32Array(16000 * 140); a.fill(0.1, 0, 16000 * 70); on(a); }, ffmpeg: async () => {}, asr: async (_s, _i, o) => { asrCalls++; expect(o.windows).toBe('/tmp/cov-windows-1.json'); } };
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
  it('ONE retry per hole, no rounds (Chad 10-31 night: retry at most once per hole; don\'t loop): a partly recovered window keeps its leftover as a measurement', async () => {
    const calls = [];
    const tools = { pcmStream: mk([]).tools.pcmStream, ffmpeg: async () => {}, asr: async (_s, _i, o) => { calls.push(o.windows); } };
    const io = { tmp: (n) => `/tmp/${n}`, writeJson: async () => {}, unlink: async () => {}, readJson: async () => ({ segments: [{ s: 1.5, e: 3, words: words(1.5, 3) }] }) };
    const r = await coverageCheck({ file: 'a.m4a', segments: base, tools, io, lang: 'en' });
    expect(calls).toEqual(['/tmp/cov-windows-1.json']);
    expect(r.coverage).toMatchObject({ rounds: 1, repaired: 1 });
    expect(r.coverage.holes_after.length).toBe(1);
    expect(coverageGaps(r.coverage, 0)[0].kind).toBe('speech-gap');
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

describe('coverageGaps: a measurement, never a blocker', () => {
  it('is empty when nothing was measured or nothing remains', () => { expect(coverageGaps(null)).toEqual([]); expect(coverageGaps({ holes_after: [] })).toEqual([]); });
  it('records each remaining hole with no p (priority) — it is not a problem', () => {
    const g = coverageGaps({ holes_after: [{ s: 164.5, e: 188.8 }] });
    expect(g[0].kind).toBe('speech-gap'); expect(g[0].p).toBeUndefined();
  });
  it('a few seconds without words is not even noted', () =>
    expect(coverageGaps({ holes_after: [{ s: 137.83, e: 142.8 }, { s: 164.5, e: 188.8 }] }).map((x) => x.text)).toEqual(['164.5–188.8 s of speech has no words']));
  it('an unmeasured transcript is recorded as such', () =>
    expect(coverageGaps({ unmeasured: true, why: 'transcribed outside the worker image' })[0].kind).toBe('coverage-unmeasured'));
});

describe('the render gate never blocks on a speech gap (Chad 10-31 night, talk 2161: a 24 s tape flip at 40.7–64.31 s)', () => {
  it('2161 shape: the gap is recorded on meta.coverage_gaps and the publish problems come from the text alone', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../api/lib/media/item.js', import.meta.url), 'utf8');
    const gate = src.slice(src.indexOf('the PUBLISH GATE'), src.indexOf('the PUBLISH GATE') + 1200);
    expect(gate).toMatch(/const problems = publishProblems\(work\.paragraphs \|\| \[\]\);/);
    expect(gate).toMatch(/meta\.coverage_gaps = /);
    expect(src).not.toMatch(/coverageProblems/);
    const g = coverageGaps({ holes_before: 1, repaired: 0, nonspeech: 0, rounds: 1, holes_after: [{ s: 40.7, e: 64.31 }] });
    expect(g).toHaveLength(1); expect(g[0].p).toBeUndefined();
  });
});
void measureCoverage;

describe('silentIn: a hole the listening copy is silent through is not even noted (10-31 talk 1999)', () => {
  // 1999: "let us welcome Mr. Sahba … himself." 2951.9 s, then 15.25 s of applause (energy VAD = speech), "Thank you very much" 2969.7 s;
  // the remaster + quiet pass left the web copy at 0 from 2953 to 2968 s
  const pps = 20, peaks = new Array(3000 * pps).fill(0.3);
  for (let i = 2953 * pps; i < 2969 * pps; i++) peaks[i] = 0;
  const cov = { holes_after: [{ s: 2954.15, e: 2969.4 }] };
  it('noted without a waveform, not noted when the listening copy is silent through the hole', async () => {
    const { silentIn } = await import('../../api/lib/media/coverage.js');
    expect(coverageGaps(cov).length).toBe(1);
    expect(coverageGaps(cov, undefined, { silent: silentIn(null) }).length).toBe(1);
    expect(coverageGaps(cov, undefined, { silent: silentIn({ peaks, pps }) })).toEqual([]);
  });
  it('still noted when any sound is heard inside the hole', async () => {
    const { silentIn } = await import('../../api/lib/media/coverage.js');
    const heard = [...peaks]; heard[2960 * pps] = 0.01;
    expect(coverageGaps(cov, undefined, { silent: silentIn({ peaks: heard, pps }) }).length).toBe(1);
    expect(coverageGaps({ holes_after: [{ s: 2954.15, e: 3100 }] }, undefined, { silent: silentIn({ peaks, pps }) }).length).toBe(1);   // past the waveform's end
  });
});

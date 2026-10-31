// Transcript coverage: speech with no words is found, repaired by re-transcribing the window, and blocks publishing when it stays.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { speechSpans, findHoles, rateOutliers, measureCoverage, coverageCheck, coverageProblems, makeFramer } from '../../api/lib/media/coverage.js';

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
    io: { tmp: (n) => `/tmp/${n}`, unlink: async () => {}, readJson: async () => ({ segments: asrWords.length ? [{ s: 0, e: 20, words: asrWords }] : [] }) },
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
  it('leaves the hole on the record when the re-transcription finds nothing usable and it cannot tell (the gate blocks it once it is long)', async () => {
    const { tools, io } = mk(words(1.5, 3));
    const r = await coverageCheck({ file: 'a.m4a', segments: base, tools, io, lang: 'en' });
    expect(r.coverage.holes_after.length).toBeGreaterThan(0);
    expect(coverageProblems(r.coverage, 0).length).toBeGreaterThan(0);
  });
});

describe('coverageProblems', () => {
  it('is empty when nothing was measured or nothing remains', () => { expect(coverageProblems(null)).toEqual([]); expect(coverageProblems({ holes_after: [] })).toEqual([]); });
  it('reports each remaining hole', () => expect(coverageProblems({ holes_after: [{ s: 164.5, e: 188.8 }] })[0].kind).toBe('speech-gap'));
  it('a few seconds without words is normal and never blocks; a skipped passage does (Chad 10-31)', () =>
    expect(coverageProblems({ holes_after: [{ s: 137.83, e: 142.8 }, { s: 164.5, e: 188.8 }] }).map((x) => x.text)).toEqual(['164.5–188.8 s of speech has no words']));
});
void measureCoverage;

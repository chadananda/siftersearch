// Content map (Chad 11-14, rules §8): model marks → word-snapped cuts, the content-only transcript, the dividers. Fixture = real dr97 excerpts (tests/fixtures/media/content-dr97.json).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseSegments, planCuts, contentRecord, contentParagraphs, cutDividers, cutLabel, MARGIN_S } from '../../api/lib/media/content-map.js';

const fx = JSON.parse(readFileSync(new URL('../fixtures/media/content-dr97.json', import.meta.url), 'utf8'));
const paras = (list) => list.map((p) => ({ ...p, words: p.words.map(([w, s, e]) => ({ w, s, e })) }));
const seg = (from_n, to_n, kind, why = '') => ({ from_n, to_n, kind, why });
const firstS = (p) => p.words[0].s, lastE = (p) => p.words.at(-1).e;

describe('planCuts on the real excerpts', () => {
  it('opening: introduction before the first talk word is cut up to MARGIN_S before it, from 0 s', () => {
    const ps = paras(fx.opening), dur = lastE(ps.at(-1)) + 1;
    const { cuts, review } = planCuts({ segments: [seg(8, 10, 'introduction'), seg(11, 13, 'content')], paragraphs: ps, duration: dur });
    expect(review).toBeNull();
    const c = cuts.find((x) => x.kind === 'introduction');
    expect(c.from).toBe(0);
    expect(c.to).toBeCloseTo(firstS(ps.find((p) => p.n === 11)) - MARGIN_S, 1);
  });
  it('middle: reading + introduction between two talks = three adjacent cuts of their own kinds, never inside a word', () => {
    const ps = paras(fx.middle), dur = 2784;
    const { cuts } = planCuts({ segments: [seg(39, 40, 'content'), seg(41, 41, 'mc'), seg(42, 42, 'reading'), seg(43, 44, 'introduction'), seg(45, 46, 'content')], paragraphs: ps, duration: dur });
    const kinds = cuts.filter((c) => c.kind !== 'gap').map((c) => c.kind);
    expect(kinds).toEqual(['mc', 'reading', 'introduction']);
    const last40 = lastE(ps.find((p) => p.n === 40)), first45 = firstS(ps.find((p) => p.n === 45));
    const real = cuts.filter((c) => c.kind !== 'gap');
    expect(real[0].from).toBeCloseTo(last40 + MARGIN_S, 1);
    expect(real.at(-1).to).toBeCloseTo(first45 - MARGIN_S, 1);
    expect(real[0].to).toBeCloseTo(real[1].from, 1);   // joined at the midpoint of the silence
    const words = ps.flatMap((p) => p.words).filter((w) => [39, 40, 45, 46].some((n) => ps.find((p) => p.n === n).words.includes(w)));
    for (const w of words) for (const c of real) expect(w.e <= c.from + 1e-6 || w.s >= c.to - 1e-6).toBe(true);
  });
  it('closing: thanks then the chant run to the end of the recording', () => {
    const ps = paras(fx.closing);
    const { cuts, kept_s } = planCuts({ segments: [seg(58, 59, 'content'), seg(60, 65, 'thanks'), seg(66, 66, 'music')], paragraphs: ps, duration: 2784 });
    const real = cuts.filter((c) => c.kind !== 'gap');
    expect(real.map((c) => c.kind)).toEqual(['thanks', 'music']);
    expect(real.at(-1).to).toBe(2784);
    expect(kept_s).toBeGreaterThan(0);
  });
  it('dead gaps over 3 s inside content shrink to 1.2 s (the middle is cut)', () => {
    const ps = [{ n: 1, t0: 0, t1: 20, words: [{ w: 'a', s: 0, e: 1 }, { w: 'b', s: 11, e: 12 }] }];
    const { cuts, kept_s } = planCuts({ segments: [seg(1, 1, 'content')], paragraphs: ps, duration: 12 });
    expect(cuts).toHaveLength(1);
    expect(cuts[0].kind).toBe('gap');
    expect(cuts[0].to - cuts[0].from).toBeCloseTo(10 - 1.2, 1);
    expect(kept_s).toBeCloseTo(12 - 8.8, 1);
  });
});

describe('safety fallbacks record a review reason and cut only the obvious', () => {
  const ps = paras(fx.opening);
  it('no content segment → only leading/trailing music', () => {
    const r = planCuts({ segments: [seg(8, 13, 'mc')], paragraphs: ps, duration: 700 });
    expect(r.review).toMatch(/no content/);
    expect(r.cuts.filter((c) => c.kind !== 'gap')).toEqual([]);
  });
  it('more than 60 % of the words would go → review, leading music only', () => {
    const r = planCuts({ segments: [seg(8, 8, 'music'), seg(9, 12, 'mc'), seg(13, 13, 'content')], paragraphs: ps, duration: 700 });
    expect(r.review).toMatch(/% of the words/);
    expect(r.cuts.filter((c) => c.kind === 'mc')).toEqual([]);
    expect(r.cuts.some((c) => c.kind === 'music' && c.from === 0)).toBe(true);
  });
});

describe('parseSegments / contentRecord', () => {
  const ps = paras(fx.opening);
  it('unknown kinds become other, uncovered paragraphs stay content, bad numbers are ignored', () => {
    const s = parseSegments({ segments: [{ from_n: 8, to_n: 9, kind: 'banter', why: 'x' }, { from_n: 99, to_n: 100, kind: 'music' }] }, ps);
    expect(s[0]).toMatchObject({ from_n: 8, to_n: 9, kind: 'other' });
    expect(s.at(-1)).toMatchObject({ kind: 'content', why: 'not marked' });
  });
  it('the record carries v, segments, cuts, kept_s, at', () => {
    const r = contentRecord({ raw: { segments: [seg(8, 10, 'introduction'), seg(11, 13, 'content')] }, paragraphs: ps, duration: 700, at: 'T' });
    expect(r).toMatchObject({ v: 1, at: 'T' });
    expect(r.cuts.length).toBeGreaterThan(0);
    expect(r.kept_s).toBeLessThan(700);
  });
});

describe('the content-only transcript', () => {
  const ps = paras(fx.opening);
  // the real plan: paragraph 9/10 words overlap paragraph 11's start in the ASR times (577.5 vs 577.05), so the cut carries the paragraphs it removes
  const cuts = planCuts({ segments: [seg(8, 10, 'introduction'), seg(11, 13, 'content')], paragraphs: ps, duration: 700 }).cuts;
  it('words in a cut go, an emptied paragraph disappears, times stay recording time, the input is untouched', () => {
    const before = JSON.stringify(ps), out = contentParagraphs(ps, cuts);
    expect(out.map((p) => p.n)).toEqual([11, 12, 13]);
    expect(out[0].t0).toBe(ps.find((p) => p.n === 11).t0);
    expect(JSON.stringify(ps)).toBe(before);
  });
  it('no cuts → the same paragraphs', () => expect(contentParagraphs(ps, [])).toBe(ps));
  it('a divider per cut, before the first kept paragraph after it, named by kind', () => {
    const kept = contentParagraphs(ps, cuts), d = cutDividers(kept, [...cuts, { from: 600, to: 601, kind: 'gap' }], 2784);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ before_n: 11, label: 'Opening introduction skipped' });
  });
  it('labels', () => {
    expect(cutLabel({ kind: 'music', from: 0, to: 100 }, 2784)).toBe('Opening song skipped');
    expect(cutLabel({ kind: 'thanks', from: 2400, to: 2784 }, 2784)).toBe('Closing closing remarks skipped');
    expect(cutLabel({ kind: 'prayer', from: 900, to: 950 }, 2784)).toBe('Prayer skipped');
  });
});

// QA 10-22 fixtures: every repetition loop is found and repaired; mojibake repaired; the publish gate refuses what is left.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { findLoops, repairLoops, repairParagraphLoops, publishProblems } from '../../api/lib/media/loops.js';
import { fixMojibake, hasMojibake } from '../../api/lib/media/text-repair.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`../fixtures/media-qa/${n}.json`, import.meta.url), 'utf8'));
const W = (t) => String(t).split(/\s+/).filter(Boolean).map((w, i) => ({ w, s: i, e: i + 1 }));
const vis = (ws) => ws.filter((w) => !w.hide).map((w) => w.w).join(' ');

describe('repetition loops (fixtures)', () => {
  const cases = fx('repetition-loops').cases.filter((c) => !/interpreter/.test(c.kind));
  it.each(cases.map((c) => [c.slug, c.para, c]))('%s p%s is flagged and repaired', (_s, _p, c) => {
    // "\"da\" x9" in the summary when the excerpt was cut before the loop
    const m = /"(.+)" x(\d+)/.exec(c.summary || '');
    const text = m ? `and then ${Array(Number(m[2])).fill(m[1]).join(' ')} we went` : (c.clean_excerpt || c.summary.replace(/^clean p\d+: …?/, ''));
    const words = W(text);
    expect(findLoops(words).length).toBeGreaterThan(0);
    const r = repairLoops(words);
    expect(findLoops(r.words.filter((w) => !w.hide))).toEqual([]);
    expect(publishProblems([{ n: 1, words: r.words }]).filter((p) => p.kind.startsWith('loop'))).toEqual([]);
  });
  it('keeps the first saying and every word time; ordinary speech untouched', () => {
    const r = repairLoops(W('I became sick in Kermanshah. Karend, Karend, Karend, Karend, Karend, village and then'));
    expect(vis(r.words)).toBe('I became sick in Kermanshah. Karend, village and then');
    expect(r.words).toHaveLength(13);
    expect(findLoops(W('holy, holy, holy is the Lord; very very good; the the'))).toEqual([]);
    expect(repairLoops(W("where Bahá'áááááááá said")).words[1].w).toBe("Bahá'á");
  });
  it('per paragraph, with where it was', () => {
    const r = repairParagraphLoops([{ n: 7, words: W('come and say come and say come and say it') }]);
    expect(r.repaired).toMatchObject([{ p: 7, kind: 'ngram', n: 3, k: 3 }]);
    expect(vis(r.paragraphs[0].words)).toBe('come and say it');
  });
});

describe('mojibake (fixtures)', () => {
  const m = fx('mojibake');
  it.each(m.cases.map((c) => [c.slug, c.para, c]))('%s p%s is repaired', (_s, _p, c) => {
    const text = c.clean_excerpt || c.excerpt || c.summary || '';
    const fixed = W(text).map((w) => fixMojibake(w.w)).join(' ');
    expect(hasMojibake(fixed)).toBe(false);
    expect(fixed).not.toMatch(/(^|\s)ì\p{L}|\p{L}î(\s|$)/u);
  });
  it('real letters are never touched', () => {
    for (const s of m.must_not_flag) expect(fixMojibake(s)).toBe(s);
  });
  it('the gate refuses a lossy decode and leftover mojibake', () => {
    expect(publishProblems([{ n: 1, words: W('the Guardian�s letter') }])[0].kind).toBe('lossy-decode');
    expect(publishProblems([{ n: 2, words: W('he said ìWhy') }])[0].kind).toBe('mojibake');
    expect(publishProblems([{ n: 3, words: W("Bahá'u'lláh and ‘Abdu'l-Bahá in Shíráz") }])).toEqual([]);
  });
});

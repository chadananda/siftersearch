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
    expect(findLoops(W('holy, holy, holy is the Lord; very very good; the the; Thank you. Thank you. Thank you. Yes, yes, yes, yes'))).toEqual([]);
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

describe('citation gate (QA fixtures: slug titles, contents)', async () => {
  const { passageGate } = await import('../../api/lib/media/quotes.js');
  const cases = fx('citation-slug-and-toc').cases;
  it.each(cases.map((c, i) => [i, c.slug, c]))('#%s %s is refused', (_i, _s, c) => {
    const title = /'title': '([^']*)'/.exec(c.source)?.[1], author = /'author': '([^']*)'/.exec(c.source)?.[1];
    expect(passageGate({ text: c.excerpt, title, author, blocktype: 'paragraph' })).not.toBeNull();
  });
  it('a properly catalogued passage passes', () => {
    expect(passageGate({ title: 'The World Order of Bahá’u’lláh', author: 'Shoghi Effendi', blocktype: 'paragraph',
      text: '“Centuries, nay ages, must pass away,” He affirms in one of His earliest Tablets, “ere the Day-Star of Truth shineth again in its mid-summer splendour.”' })).toBeNull();
  });
});

describe('lossy words (U+FFFD) take the segment text', async () => {
  const { flattenWords } = await import('../../api/lib/media/paragraphs.js');
  it('a Persian word split between tokens is restored from the whole-decoded segment text', () => {
    const sg = { s: 0, e: 3, text: 'از قبل عبدالبها', words: [{ w: 'از', s: 0, e: 1 }, { w: 'قب��', s: 1, e: 2 }, { w: 'عبدالبها', s: 2, e: 3 }] };
    expect(flattenWords([sg]).map((w) => w.w)).toEqual(['از', 'قبل', 'عبدالبها']);
  });
  it('left alone when the counts differ (the gate then refuses it)', () => {
    const sg = { s: 0, e: 2, text: 'از قبل عبدالبها', words: [{ w: 'از', s: 0, e: 1 }, { w: 'قب�', s: 1, e: 2 }] };
    expect(flattenWords([sg])[1].w).toContain('�');
  });
});

describe('work links are the work itself (QA fixtures: 45 wrong work links)', async () => {
  const { resolveWork } = await import('../../api/lib/media/links.js');
  const cases = fx('wrong-work-links').cases.filter((c) => c.slug !== 'jones-01-thursday' || !/[ăâîșț]/.test(c.text));
  const docOf = (c) => {
    const path = /siftersearch\.com\/library\/(.+)$/.exec(c.url)?.[1] || '';
    return { id: 1, title: c.linked_title, source_url: c.url, slug: path, collection: path.split('/')[1] || '', language: /_ar$|arabic/i.test(c.url) ? 'ar' : null };
  };
  it.each(cases.map((c, i) => [i, c.text, c]))('#%s "%s" is not linked to the wrong copy', async (_i, _t, c) => {
    const r = await resolveWork({ text: c.text, canonical: c.text.replace(/[,.?]+$/, '') }, { find: async () => [docOf(c)] });
    expect(r.doc).toBeUndefined();
  });
  it('the canonical OceanLibrary copy is linked', async () => {
    const find = async () => [{ id: 2, title: 'The Hidden Words: Transcript of a talk by A. Q. Faizí', collection: 'bahai-talks' },
      { id: 3, title: 'The Hidden Words', source_site: 'oceanlibrary.com', language: 'en' }, { id: 4, title: 'Seven Valleys: Faculty notes' }];
    expect((await resolveWork({ text: 'Hidden Words', canonical: 'The Hidden Words' }, { find })).doc.id).toBe(3);
    expect((await resolveWork({ text: 'The Bahá’í World', canonical: 'The Bahá’í World' }, { find: async () => [{ id: 5, title: "The Baha'i World: Volume XIII", language: 'en' }] })).doc).toBeUndefined();
  });
});

describe('letter runs are completed to the term they begin (watchdog 23:49)', async () => {
  const { repairLoops: rl } = await import('../../api/lib/media/loops.js');
  it.each([['Bahaííííííí', 'Bahá’í'], ['Bááááááá', 'Báb'], ["Abdu'l-Báááááá,", '‘Abdu’l-Bahá,'], ['Néhéééééé', 'Néhé']])('%s → %s', (w, want) => {
    expect(rl([{ w, s: 0, e: 1 }]).words[0].w).toBe(want);
  });
  it('"No, no." and "no, no, no, no" are speech, not loops', () => {
    expect(findLoops(W('No, no. I said no, no, no, no and then'))).toEqual([]);
  });
});

describe('quote hunts run two at a time, results in order (10-23 quotes latency)', async () => {
  const { linkQuotes } = await import('../../api/lib/media/quotes.js');
  it('peak concurrency 2; rejected order kept', async () => {
    let live = 0, peak = 0;
    const sourceHunt = async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 15)); live--; return { error: 'none' }; };
    const ps = [{ n: 1, words: W('one two three four five six seven eight nine ten eleven twelve') }];
    const cands = [1, 2, 3, 4].map((i) => ({ p: 1, text: 'one two three four five six seven', i }));
    const r = await linkQuotes(ps, cands, { sourceHunt }, { pauseMs: 0 });
    expect(peak).toBe(2);
    expect(r.rejected.map((x) => x.i)).toEqual([1, 2, 3, 4]);
  });
});

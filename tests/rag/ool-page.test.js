// Reading a whole work from an oceanoflights PAGE — the pairing anchors, and the chrome that must not
// become scripture.
import { describe, it, expect } from 'vitest';
import { splitVerseNumber, declaredRole, pairByVerse, isPageFooter }
  from '../../api/lib/rag/concepts/ool-page.js';

describe('splitVerseNumber — the source states its own correspondence', () => {
  it('reads an Arabic-Indic verse number and strips it without touching the script', () => {
    const { n, text } = splitVerseNumber('١ انّ اوّل ما کتب الله علی العباد');
    expect(n).toBe(1);
    expect(text).toBe('انّ اوّل ما کتب الله علی العباد');   // still Arabic script, not transliterated digits
  });

  it('reads Persian digits too', () => {
    expect(splitVerseNumber('۱۰۵ انّ الّذی يأوّل').n).toBe(105);
  });

  it('reports null rather than guessing when the paragraph states no number', () => {
    expect(splitVerseNumber('The first duty prescribed by God').n).toBe(null);
  });
});

describe('declaredRole — ask the page, do not prefer a language', () => {
  // Arabic-first would have filed oceanoflights' ARABIC TRANSLATION of the (Persian) Secret of Divine
  // Civilization as its original — undetectable afterwards.
  it('believes a page that calls itself the original', () => {
    expect(declaredRole('<h2>نسخه اصل فارسی</h2>')).toBe('original');
    expect(declaredRole('<h2>النسخة العربية الأصلية</h2>')).toBe('original');
  });

  it('believes a page that calls itself a translation', () => {
    expect(declaredRole('<h2>ترجمه شده</h2>')).toBe('translation');
  });

  it('says unknown rather than defaulting', () => {
    expect(declaredRole('<h2>Seven Valleys</h2>')).toBe('unknown');
  });
});

describe('the page footer that looks like scripture', () => {
  // "6100 words الحمد لله الذی اظهر الوجود…" closes EVERY oceanoflights work page, in the SAME form on the
  // English page and the original page. Identical on both sides means no cross-language check can catch it:
  // on the Seven Valleys it was the last item of both the 125-item English list and the 52-item Persian
  // list, so it would have aligned to itself and been stored as some paragraph's original.
  it('is recognised by its word-count opening', () => {
    expect(isPageFooter('6100 words الحمد لله الذی اظهر الوجود من العدم')).toBe(true);
    expect(isPageFooter('12 words something')).toBe(true);
  });

  it('leaves alone a passage that merely opens with a number', () => {
    expect(isPageFooter('105 Whoso interpreteth what hath been sent down')).toBe(false);
    expect(isPageFooter('1844 was the year of the Declaration')).toBe(false);
  });
});

describe('pairByVerse — prefer the source’s own claim over our assumption', () => {
  it('pairs by verse number when both sides carry one', () => {
    const r = pairByVerse([{ n: 1, text: 'first' }, { n: 2, text: 'second' }],
      [{ n: 2, text: 'ثانی' }, { n: 1, text: 'اول' }]);
    expect(r.basis).toBe('verse-number');
    expect(r.rows.find((x) => x.n === 1)).toMatchObject({ en: 'first', source: 'اول' });
  });

  it('reads the English by ORDINAL when only the original is numbered', () => {
    // Index 0 is the unnumbered preamble, so verse N sits at index N.
    const en = [{ n: null, text: 'preamble' }, { n: null, text: 'verse one' }, { n: null, text: 'verse two' }];
    const r = pairByVerse(en, [{ n: 1, text: 'اول' }, { n: 2, text: 'ثانی' }]);
    expect(r.basis).toBe('source-numbered-english-ordinal');
    expect(r.rows).toEqual([{ n: 1, en: 'verse one', source: 'اول' }, { n: 2, en: 'verse two', source: 'ثانی' }]);
  });

  it('SKIPS a verse whose ordinal falls outside the English list rather than clamping', () => {
    const r = pairByVerse([{ n: null, text: 'preamble' }, { n: null, text: 'verse one' }],
      [{ n: 1, text: 'اول' }, { n: 99, text: 'تسعه' }]);
    expect(r.rows).toHaveLength(1);
  });

  it('refuses position when the counts disagree — a missing paragraph must not shift the book', () => {
    const r = pairByVerse([{ n: null, text: 'a' }, { n: null, text: 'b' }], [{ n: null, text: 'ا' }]);
    expect(r.basis).toBe('none');
    expect(r.reason).toMatch(/lengths differ/);
  });
});

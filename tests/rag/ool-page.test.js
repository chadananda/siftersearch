// Reading a whole work from an oceanoflights PAGE — the pairing anchors, and the chrome that must not
// become scripture.
import { describe, it, expect } from 'vitest';
import { splitVerseNumber, declaredRole, pairByVerse, isPageFooter }
  from '../../api/lib/rag/concepts/ool-page.js';
import { NOT_THE_ORIGINAL, STUB_ONLY, targetFor } from '../../api/lib/rag/concepts/originals-targets.js';

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

describe('NOT_THE_ORIGINAL is keyed by PAGE, not by work', () => {
  // I recorded the Tablets of the Divine Plan as having no original online because its whole-book Arabic
  // page says مترجم and its whole-book Persian page 404s. The site publishes that work BY CHAPTER, and all
  // fourteen chapter pages declare a Persian original. A missing whole-book page is a fact about one URL.
  it('bars the whole-book rendering without barring the work', () => {
    expect(NOT_THE_ORIGINAL['abdul-baha-bkw02']).toBeTruthy();
    expect(NOT_THE_ORIGINAL['abdul-baha-bkw02-1-01']).toBeUndefined();
    expect(targetFor(20914).stems).toContain('abdul-baha-bkw02-1-01');
    expect(targetFor(20914).lang).toBe('fa');
  });

  it('bars the Arabic rendering of the Persian Secret of Divine Civilization', () => {
    expect(NOT_THE_ORIGINAL['abdul-baha-bkw19-ar']).toBeTruthy();
    expect(targetFor(20919).stems).toEqual(['abdul-baha-bkw19']);
  });
});

describe('a stem may name TWO pages', () => {
  // The site keeps single tablets (`st`) apart from published volumes (`pub`), and they do not always both
  // carry both languages: the Súriy-i-Haykal's English is bahaullah-st-121-en while its Arabic is
  // bahaullah-pub06-090-ar, and each 404s in the other's language.
  it('carries the Haykal as an english/source pair, not a single stem', () => {
    const haykal = targetFor(20806).stems.find((x) => typeof x === 'object');
    expect(haykal).toMatchObject({ en: 'bahaullah-st-121', src: 'bahaullah-pub06-090', lang: 'ar' });
  });

  it('keeps the common case a plain string — only the odd one out needs a pair', () => {
    const stems = targetFor(20806).stems;
    expect(stems.filter((x) => typeof x === 'object')).toHaveLength(1);
    expect(stems.filter((x) => typeof x === 'string').length).toBeGreaterThan(1);
  });

  it('puts the nested king-tablets BEFORE the Haykal, so the tighter source wins a collision', () => {
    // pub06-090 is 7,419 Arabic words against ~36,000 English: the Haykal proper, not the tablets printed
    // inside it. Each nested tablet has its own page and its own tight range.
    const stems = targetFor(20806).stems;
    const haykal = stems.findIndex((x) => typeof x === 'object');
    for (const king of ['bahaullah-st-065', 'bahaullah-st-062', 'bahaullah-st-054', 'bahaullah-st-053', 'bahaullah-st-018']) {
      expect(stems.indexOf(king)).toBeGreaterThanOrEqual(0);
      expect(stems.indexOf(king)).toBeLessThan(haykal);
    }
  });

  it('records the superseded stub as superseded rather than deleting the reasoning', () => {
    // Controls proved a PAGE was empty; they could not prove the WORK was unpublished, because the
    // hypothesis space was only ever one series of the site.
    expect(STUB_ONLY['bahaullah-st-121']).toBeUndefined();
    expect(STUB_ONLY['bahaullah-st-121__page-only'].supersededBy).toBe('bahaullah-pub06-090');
  });
});

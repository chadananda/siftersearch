// Phrase units: api/lib/phrases.js must reproduce the measured Python splitter (tests/quality/crosslingual/phrases.py)
// on real paragraphs, return offsets into the marker-stripped text, and never cut by length.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { segment, unitTexts, anchored, cleanText, SEG_VERSION } from '../../api/lib/phrases.js';
import { faShare } from '../../api/lib/arabic-script.js';

const golden = JSON.parse(readFileSync(new URL('../fixtures/phrases-golden.json', import.meta.url), 'utf8')).cases;
// eslint-disable-next-line no-control-regex -- the test mirrors Python's str.split() whitespace set (\x1c-\x1f, \x85)
const norm = (s) => s.replace(/<!--.*?-->|<pb[^>]*\/>/g, ' ').split(/[\s\x1c-\x1f\x85]+/).filter(Boolean).join(' ');

describe('segment — parity with the measured Python splitter', () => {
  for (const [i, c] of golden.entries()) {
    it(`${c.lang} #${i}`, () => {
      expect(unitTexts(c.text, c.lang).map(norm)).toEqual(c.units.map(norm));
    });
  }
});

describe('segment — offsets', () => {
  it('spans index the marker-stripped text and cover every word in order', () => {
    const raw = '⁅s1⁆قل يا قوم اتّقوا الله ⁅/s1⁆⁅s2⁆و لا تتّبعوا الهوى فانّه يضلّكم عن السّبيل⁅/s2⁆';
    const clean = cleanText(raw);
    expect(clean).not.toMatch(/⁅/);
    const spans = segment(raw, 'ar');
    expect(spans.length).toBeGreaterThan(0);
    for (const [k, s] of spans.entries()) {
      expect(s.start).toBeLessThan(s.end);
      if (k) expect(s.start).toBeGreaterThanOrEqual(spans[k - 1].end);
    }
    expect(norm(spans.map((s) => clean.slice(s.start, s.end)).join(' '))).toBe(norm(clean));
  });

  it('never cuts by length: an unpunctuated run with no clause marker stays one unit', () => {
    const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    expect(segment(long, 'en')).toEqual([{ start: 0, end: long.length }]);
  });

  it('empty text gives no units', () => {
    expect(segment('', 'fa')).toEqual([]);
  });

  it('exports a version stamp', () => {
    expect(SEG_VERSION).toMatch(/^phr-/);
  });
});

describe('segment — Arabic and Persian mixed (one rule set, local evidence)', () => {
  it('a Persian verb ending closes a Persian clause whatever the label says', () => {
    const t = 'و این مطلب در کتاب ایقان مذکور است و هر نفس مقبلی از اهل بها که طالب حق باشد از آن محروم نماند';
    expect(unitTexts(t, 'ar')).toEqual(unitTexts(t, 'fa'));
    expect(unitTexts(t, 'ar')[0]).toBe('و این مطلب در کتاب ایقان مذکور است');
  });
  it('inside an Arabic quotation a word ending like a Persian verb does not split it', () => {
    // «سعید» / «شدید» end in ید / ید but there is no Persian in the clause, so no Persian verb rule
    const t = 'قل یا قوم ان ربکم لهو العزیز الشدید الذی خلق الخلق بامره فی یوم سعید عظیم الشان';
    expect(unitTexts(t, 'fa').some((u) => u.endsWith('الشدید') || u.endsWith('سعید'))).toBe(false);
  });
});

describe('segment — Chinese (no spaces; its own sentence punctuation)', () => {
  it('splits after 。！？； and keeps the punctuation with its clause', () => {
    const t = '學而時習之，不亦說乎？有朋自遠方來，不亦樂乎！人不知而不慍，不亦君子乎。';
    expect(unitTexts(t, 'zh')).toEqual(['學而時習之，不亦說乎？', '有朋自遠方來，不亦樂乎！', '人不知而不慍，不亦君子乎。']);
  });

  it('joins a fragment shorter than 4 characters to its neighbour', () => {
    expect(unitTexts('子曰：學而時習之，不亦說乎？', 'zh')).toEqual(['子曰：學而時習之，不亦說乎？']);
  });

  it('a run without sentence punctuation stays one unit', () => {
    expect(segment('道可道非常道名可名非常名', 'zh')).toEqual([{ start: 0, end: 12 }]);
  });
});

describe('anchored — embedding text with neighbouring phrases', () => {
  it('adds neighbours until ~30 words, alternating right then left', () => {
    const units = ['a b c d e', 'f g h i j', 'k l m n o', 'p q r s t', 'u v w x y', 'z1 z2 z3 z4 z5', 'z6 z7 z8 z9 z10', 'z11 z12'];
    expect(anchored(units, 3)).toBe(units.slice(1, 7).join(' '));
  });

  it('a phrase already ≥ 30 words is embedded alone', () => {
    const big = Array.from({ length: 35 }, (_, i) => `w${i}`).join(' ');
    expect(anchored(['x y', big, 'z'], 1)).toBe(big);
  });
});

describe('faShare — Persian as a measure, not a label', () => {
  it('0 for Arabic, 1 for Persian, in between for mixed, null without evidence', () => {
    expect(faShare('قل یا قوم ان الذی کان فی هذا الامر قد ظهر')).toBe(0);
    expect(faShare('این است که از آن بیان معلوم شد')).toBe(1);
    const mixed = faShare('این است که می‌فرمایند قل الذی کان فی هذا الامر');
    expect(mixed).toBeGreaterThan(0); expect(mixed).toBeLessThan(1);
    expect(faShare('بسم الله')).toBeNull();
  });
});

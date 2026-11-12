import { describe, it, expect } from 'vitest';
import { markdownDefects, safeLinkText } from '../../api/lib/assistant/md-valid.js';

describe('markdownDefects (deterministic formatting validity)', () => {
  it('flags the 11-04 toil reply: a link nested inside a link', () => {
    const t = 'He writes that [**"It is incumbent upon each one of you"* ([The Most Holy Book](https://b/aqdas))*](https://o/aqdas#p40).';
    expect(markdownDefects(t).map((d) => d.id)).toEqual(['nested-link']);
  });
  it('flags unbalanced bold and italic', () => {
    expect(markdownDefects('This is **bold without an end.').map((d) => d.id)).toEqual(['unbalanced-emphasis']);
    expect(markdownDefects('An *italic without an end.').map((d) => d.id)).toEqual(['unbalanced-emphasis']);
  });
  it('flags broken link syntax', () => {
    expect(markdownDefects('See [Gleanings](https://o/g has no close').map((d) => d.id)).toContain('broken-link');
  });
  it('passes valid replies: styled linked quotes, bullets, blockquotes', () => {
    const t = [
      'Bahá’u’lláh writes [*"Disencumber yourselves of all attachment"*](https://o/g#p1) in **Gleanings**.',
      '* a bullet with *italic*\n* another',
      '> Whole passage text.\n>\n> — [*Gleanings*, XXVII](https://o/g?paraId=para_177&s=a.0~a.631)',
    ].join('\n\n');
    expect(markdownDefects(t)).toEqual([]);
  });
  it('a URL with balanced parens (Ocean of Lights range links "#(start)(end)") is a valid link, not a broken one', () => {
    expect(markdownDefects('In [*Lawḥ-i-Burhán*](https://oceanoflights.org/bahaullah-pub05-031-ar/#(%D9%8A)(%D9%87)), He writes')).toEqual([]);
    expect(markdownDefects('See [*Tablet*](https://oceanoflights.org/x/#(a)(b)(c) unclosed').map((d) => d.id)).toContain('broken-link');
  });
});

// writer residuals 11-05: a work whose title carries brackets ("Book of Common Prayer [King's Chapel]") broke its link — fresh titles
describe('safeLinkText — brackets inside a link\'s text become parens', () => {
  it('a bracketed edition note in an italic title, inline and as a parenthetical citation', () => {
    const t = 'See [*Hymns Ancient and Modern [Standard Edition]*](https://oceanlibrary.com/hymns/?paraId=para_12) and ([Psalter [Coverdale, 1535]](https://oceanlibrary.com/psalter/?paraId=para_3)).';
    const out = safeLinkText(t);
    expect(out).toBe('See [*Hymns Ancient and Modern (Standard Edition)*](https://oceanlibrary.com/hymns/?paraId=para_12) and ([Psalter (Coverdale, 1535)](https://oceanlibrary.com/psalter/?paraId=para_3)).');
    expect(markdownDefects(t).map((d) => d.id)).toContain('broken-link');
    expect(markdownDefects(out)).toEqual([]);
  });
  it('a list of titles, one per line, each repaired on its own line; a bracket outside any link is left as written', () => {
    const t = '- [Selections [vol. 2]](https://o/s2)\n- [note] see [Prayers [Arabic]](https://o/pa)';
    expect(safeLinkText(t)).toBe('- [Selections (vol. 2)](https://o/s2)\n- [note] see [Prayers (Arabic)](https://o/pa)');
  });
  it('never touches URLs, plain links, or a nested link (its own defect)', () => {
    const ool = 'In [*Lawḥ-i-Burhán*](https://oceanoflights.org/x/#(%D9%8A)(%D9%87)), He writes';
    expect(safeLinkText(ool)).toBe(ool);
    const nested = 'He writes [*"Quote"* ([The Book](https://b/x))*](https://o/x#p4).';
    expect(safeLinkText(nested)).toBe(nested);
    expect(safeLinkText('No links here [just brackets].')).toBe('No links here [just brackets].');
  });
});
describe('markdownDefects: a space-flanked star is text, not emphasis (11-12 ahmad-sbs)', () => {
  it('the Arabic verse separator " * " in a table cell is valid; an unclosed *word still is not', () => {
    expect(markdownDefects('| هَذِهِ وَرْقَةُ ٱلْفِرْدَوْسِ * بِأَلْحَانِ قُدْسٍ * | Lo, the *Nightingale* |')).toEqual([]);
    expect(markdownDefects('an *open emphasis never closed').map((d) => d.id)).toEqual(['unbalanced-emphasis']);
  });
});

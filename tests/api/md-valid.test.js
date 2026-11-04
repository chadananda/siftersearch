import { describe, it, expect } from 'vitest';
import { markdownDefects } from '../../api/lib/assistant/md-valid.js';

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
});

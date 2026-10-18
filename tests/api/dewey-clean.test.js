// The text cleaner: the source's false paragraph marks repaired, headers/page numbers out, hyphens closed, markup dropped.
import { describe, it, expect } from 'vitest';
import { cleanText } from '../../api/lib/dewey/clean.js';

const lines = (n) => Array.from({ length: n }, (_, i) => `this is printed line number ${i} of a long wrapped paragraph that runs on`);
describe('cleanText', () => {
  it('a hard paragraph mark on every printed line → one paragraph per real paragraph', () => {
    const src = [...lines(6), 'and it ends here.', ...lines(5), 'and the second ends.'].join('\n\n');
    const out = cleanText(src).split(/\n{2,}/);
    expect(out).toHaveLength(2);
    expect(out[0].endsWith('and it ends here.')).toBe(true);
  });
  it('a refrain repeated through the text is NOT a running header (the Hidden Words)', () => {
    const hw = Array.from({ length: 6 }, (_, k) => `### O SON OF MAN!\n\nThis is the counsel number ${k}, complete and whole in itself.`).join('\n\n');
    expect((cleanText(hw).match(/O SON OF MAN!/g) || []).length).toBe(6);
  });
  it('real paragraphs (longer than a line) are not merged', () => {
    const para = (k) => `${'A whole paragraph of running text with many words in it. '.repeat(4)}Number ${k} ends here.`;
    expect(cleanText([para(1), para(2), para(3)].join('\n\n')).split(/\n{2,}/)).toHaveLength(3);
  });
  it('running headers, page numbers, form-feed pages, hyphens and emphasis', () => {
    const w = ['first', 'second', 'third', 'fourth'];
    const page = (n) => `THE BOOK TITLE\n${n}\nThe ${w[n - 1]} story contin-\nues on its own page and the ${w[n - 1]} sentence goes\non across the ${w[n - 1]} line.`;
    const out = cleanText([1, 2, 3, 4].map(page).join('\f'));
    expect(out).not.toMatch(/THE BOOK TITLE/);
    expect(out).not.toMatch(/^\d+$/m);
    expect(out).toMatch(/<pb n="2"\/>/);
    expect(out).toMatch(/The first story continues on its own page and the first sentence goes on across the first line\./);
    expect(cleanText('the *ancien r**é**gime* and **bold** text.')).toBe('the ancien régime and bold text.');
    expect(cleanText('###### A Sole Western Pilgrim')).toBe('### A Sole Western Pilgrim');
    expect(cleanText('the Iran- ian people and pre- and post-war years.')).toBe('the Iranian people and pre- and post-war years.');
  });
});

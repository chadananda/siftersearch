// Only a WHOLE copy is offered (Chad 10-19: "please do not propose books that are incomplete. That is a trap").
import { describe, it, expect } from 'vitest';
import { wholeWork, estimatedWords } from '../../api/lib/dewey/whole.js';

describe('wholeWork', () => {
  it('a contents / index / excerpt file is not the work', () => {
    expect(wholeWork({ url: 'https://bahai-library.com/pdf/z/zarqani_masumian_abdul-baha_europe_contents.pdf', kind: 'book', words: 4435 }).whole).toBe(false);
    expect(wholeWork({ name: 'smith_babi_index.pdf' }).whole).toBe(false);
    expect(wholeWork({ name: 'Gleanings excerpt.txt' }).whole).toBe(false);
  });
  it('a preview, a tiny "book", a PDF far shorter than its edition are not whole', () => {
    expect(wholeWork({ text: 'Pages 23 to 180 are not shown in this preview.' }).whole).toBe(false);
    expect(wholeWork({ kind: 'book', words: 1295 }).whole).toBe(false);
    expect(wholeWork({ kind: 'book', words: 9000, pdfPages: 40, published: 320 }).whole).toBe(false);
  });
  it('a whole book, a short letter, a pilgrim note are whole', () => {
    expect(wholeWork({ name: 'resurrection_and_renewal.pdf', kind: 'book', words: 236000, pdfPages: 480, published: 460 }).whole).toBe(true);
    expect(wholeWork({ name: 'sears_letter_1960.pdf', kind: 'letter', words: 538 }).whole).toBe(true);
    expect(wholeWork({ name: 'haney_heavenly_feast.pdf', kind: 'pilgrim notes', words: 6700 }).whole).toBe(true);
    expect(wholeWork({ name: 'The Index of Prohibited Books.pdf', kind: 'book', words: 90000 }).whole).toBe(false);   // a cautious miss, accepted
  });
  it('estimates the whole text from sampled pages', () => {
    expect(estimatedWords({ identified: { _text: 'w '.repeat(3000), sample: { of: 300, sampled: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } } })).toBe(90000);
  });
});
describe('truncation evidence makes a copy incomplete', () => {
  it('contents pointing far past the PDF', () => {
    const w = wholeWork({ name: 'europe.pdf', kind: 'book', words: 90000, toc: { suspect: true, evidence: ['contents point to page 681', 'index cites page 690', 'the PDF has only 19 pages'] } });
    expect(w.whole).toBe(false);
    expect(w.why.join()).toMatch(/contents point to page 681.*only 19 pages/);
  });
});

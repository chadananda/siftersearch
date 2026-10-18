// Dewey's full-text comparison: copies match despite OCR noise and reflow; a passage inside a compilation is "inside"; a
// library excerpt of our fuller text is "partial"; shared quotations out of order are "quotes"; unrelated texts on the same
// subject share almost nothing. Real-pair calibration (planning/dewey-holdings-comparison.md): copies 82–100%, unrelated ≤2%.
import { describe, it, expect } from 'vitest';
import { compareWords, compareTexts, probes } from '../../api/lib/dewey/compare.js';

// a deterministic "book": distinct sentences from a seeded generator
const VOCAB = 'guardian pilgrim haifa shrine garden evening table spoke friends faith world order unity cause teachings believers assembly prayer spirit history future nations peace justice station terraces mountain carmel tablet letter message hope'.split(' ');
function book(seed, sentences) {
  let x = seed; const r = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: sentences }, () => { const n = 12 + Math.floor(r() * 14); const w = Array.from({ length: n }, () => VOCAB[Math.floor(r() * VOCAB.length)]); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return w.join(' ') + '.'; }).join(' ');
}
const ocr = (t) => t.split(' ').map((w, i) => (i % 23 === 0 ? w.replace(/e/g, 'c') : i % 31 === 0 ? w + '-\n' : w)).join(' ').replace(/-\n /g, '-\n');
const W = compareWords;

describe('compareTexts', () => {
  const A = book(1, 200), B = book(2, 200);
  it('an OCR\'d, reflowed copy is the same text', () => {
    const r = compareTexts(W(A), W(ocr(A).replace(/\. /g, '.\n')));
    expect(r.relation).toBe('same');
    expect(r.ours_in_theirs).toBeGreaterThan(0.6);
  });
  it('page markers, running headers and Markdown do not count against a copy', () => {
    const paged = A.split('. ').map((s, i) => (i % 20 === 0 ? `\n[page ${i / 20 + 1}]\nPILGRIM NOTES\n## ${s}` : s)).join('. ');
    expect(compareTexts(W(A), W(paged)).ours_in_theirs).toBeGreaterThan(0.95);
  });
  it('our short document inside a long compilation is "inside"', () => {
    const part = A.split('. ').slice(50, 90).join('. ');
    expect(compareTexts(W(part), W(B + ' ' + A + ' ' + book(3, 200))).relation).toBe('inside');
  });
  it('the library holding only an excerpt of our fuller text is "partial"', () => {
    expect(compareTexts(W(A), W(A.split('. ').slice(0, 40).join('. '))).relation).toBe('partial');
  });
  it('shared quotations out of order are "quotes", not a copy', () => {
    const s = A.split('. ');
    const quoting = [B, s[150], book(4, 30), s[10], book(5, 30), s[90], s[30]].join('. ');
    const r = compareTexts(W(A), W(quoting));
    expect(['quotes', 'unrelated']).toContain(r.relation);
    expect(r.relation).not.toBe('same');
  });
  it('two different texts on the same subject are unrelated', () => {
    expect(compareTexts(W(A), W(B)).relation).toBe('unrelated');
  });
});

describe('a scan read by preliminary OCR is compared as a SAMPLE', () => {
  const A = book(1, 400);
  const pages = A.split('. ');
  const sampled = [pages.slice(20, 40), pages.slice(180, 200), pages.slice(340, 360)].map((p) => p.join('. ')).join('\n[page 9]\n');
  it('sampled pages of a held work: same, judged on the estimated whole length', () => {
    const our = W(ocr(sampled));
    const r = compareTexts(our, W(A), { sample: true, ourLength: our.length * (400 / 60) });
    expect(r).toMatchObject({ relation: 'same', sample: true });
  });
  it('sampled pages found inside a much longer library work: inside', () => {
    const our = W(sampled);
    expect(compareTexts(our, W(book(9, 800) + ' ' + A + ' ' + book(8, 800)), { sample: true, ourLength: our.length * (400 / 60) }).relation).toBe('inside');
  });
  it('OCR\'d pages sharing a long in-order run (≥35%) with a copy are the same text (Roy Wilhelm 10-17)', async () => {
    const { relationOf } = await import('../../api/lib/dewey/compare.js');
    expect(relationOf({ ours_in_theirs: 0.41, theirs_in_ours: 0.2, in_order: 0.93, length_ratio: 1.1, sample: true })).toBe('same');
    expect(relationOf({ ours_in_theirs: 0.41, theirs_in_ours: 0.2, in_order: 0.5, length_ratio: 1.1, sample: true })).not.toBe('same');
    expect(relationOf({ ours_in_theirs: 0.41, theirs_in_ours: 0.41, in_order: 0.93, length_ratio: 1.1 })).not.toBe('same');   // clean text keeps the 45% bar
  });
  it('a sample is not called "partial" just because the library text is not all in our few pages', () => {
    const our = W(sampled);
    expect(compareTexts(our, W(A), { sample: true, ourLength: our.length * (400 / 60) }).relation).not.toBe('partial');
  });
});

describe('probes', () => {
  it('spreads ~n sentences of 12–40 words through the whole document', () => {
    const ps = probes(book(7, 300), 30);
    expect(ps).toHaveLength(30);
    for (const p of ps) { const n = p.split(' ').length; expect(n).toBeGreaterThanOrEqual(12); expect(n).toBeLessThanOrEqual(40); }
  });
});

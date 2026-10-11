import { describe, it, expect } from 'vitest';
import { headedToPn, leadingToPn, declareParagraphs } from '../../api/lib/library/verse-files.js';

describe('verse numbers into source files', () => {
  it('headed (Tanzil): the reference heading becomes the verse pn; surah headings stay; idempotent', () => {
    const src = '## Surah 1\n\n\n### 1:1\nبِسۡمِ ٱللَّهِ\n\n\n### 1:2\nٱلۡحَمۡدُ لِلَّهِ\n';
    const r = headedToPn(src);
    expect(r.verses).toBe(2);
    expect(r.text).toBe('## Surah 1\n\n\nبِسۡمِ ٱللَّهِ\n{pn="1:1"}\n\n\nٱلۡحَمۡدُ لِلَّهِ\n{pn="1:2"}\n');
    expect(headedToPn(r.text).text).toBe(r.text);
  });
  it('leading (Douay-Rheims): pn names the book, number leaves the text, wraps joined, notes untouched', () => {
    const src = 'Genesis Chapter 2\r\n\r\nGod rests the seventh day.\r\n\r\n2:10. And a river went out\r\nof the place of pleasure.\r\n\r\nThe tree of life... So called.\r\n';
    const r = leadingToPn(src);
    expect(r).toMatchObject({ verses: 1, mismatched: 0 });
    expect(r.text).toBe('## Genesis Chapter 2\n\nGod rests the seventh day.\n\nAnd a river went out of the place of pleasure.\n{pn="Genesis 2:10"}\n\nThe tree of life... So called.\n');
  });
  it('several blank lines are one separator; book titles and chapter-line variants', () => {
    const src = 'THE BOOK OF GENESIS\n\nIntro.\n\n\nGenesis Chapter 1\n\n\n1:1. In the beginning.\n\nJob Chapter 39 The wonders of God.\n\n39:1. Knowest thou.\n\n1 Machabees Chapter 2.\n\n2:1. In those days.';
    const r = leadingToPn(src);
    expect(r).toMatchObject({ verses: 3, mismatched: 0 });
    expect(r.text).toContain('# THE BOOK OF GENESIS');
    expect(r.text).toContain('## Genesis Chapter 1\n\n\nIn the beginning.\n{pn="Genesis 1:1"}');
    expect(r.text).toContain('## Job Chapter 39\n\nThe wonders of God.');
    expect(r.text).toContain('{pn="1 Machabees 2:1"}');
  });
  it('declares paragraphs once', () => {
    expect(declareParagraphs('---\ntitle: x\n---\nbody')).toBe('---\ntitle: x\nneeds_segmentation: false\n---\nbody');
    expect(declareParagraphs('---\nneeds_segmentation: false\n---\nb')).toBe('---\nneeds_segmentation: false\n---\nb');
  });
});

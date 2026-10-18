// Import quality: each finding is measured on the stored paragraphs and names its cause.
import { describe, it, expect } from 'vitest';
import { inspectDocument } from '../../api/lib/dewey/quality.js';

const P = (...t) => t.map((text) => ({ text }));
describe('inspectDocument', () => {
  it('finds split sentences, running headers, page numbers, broken hyphens', () => {
    const r = inspectDocument(P('There were probably fewer than', 'six thousand believers in the country.', 'PILGRIM NOTES', 'A full sentence here.', 'PILGRIM NOTES', '12', 'PILGRIM NOTES', 'A para- graph was broken.'), { title: 'Notes', author: 'X' });
    const codes = Object.fromEntries(r.findings.map((f) => [f.code, f.n]));
    expect(codes).toMatchObject({ 'split-sentences': 1, 'running-headers': 3, 'page-numbers': 1, 'broken-hyphens': 1 });
  });
  it('a clean document has no findings', () => {
    const r = inspectDocument(P('The first paragraph is complete.', 'The second one is too.'), { title: 'A Book', author: 'Someone' });
    expect(r.findings).toEqual([]);
  });
  it('a weak title and a missing author are catalogue findings', () => {
    const codes = inspectDocument(P('Text here.'), { title: 'Untitled document (uploaded as “x.pdf”)', identified: { appraisal: { kind: 'book' } } }).findings.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['weak-title', 'no-author']));
  });
});

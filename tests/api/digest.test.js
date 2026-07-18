// Grounding progress digest — build from finished books + plan state, render nice HTML, send only when non-empty.
import { describe, it, expect } from 'vitest';
import { buildDigest, renderDigestHtml, renderDigestText, sendDigest } from '../../api/lib/pipeline/digest.js';

const deps = (overrides = {}) => ({
  queryAll: async () => [{ doc_id: 5, finished_at: 1000 }],   // one book finished in the window
  queryOne: async () => ({ title: 'The Dawn-Breakers', author: 'Nabíl', description: 'An early history.', paragraph_count: 1200 }),
  getProgress: async () => ({
    phases: [{ label: 'Foundation', books: [{ id: 5, title: 'The Dawn-Breakers', author: 'Nabíl', size: 1200, persons: 42, newInSequence: 10, done: true }] }],
    doneBooks: 30, totalBooks: 253, totalParas: 100000, cumulativeUnique: 5000,
  }),
  ...overrides,
});

describe('buildDigest', () => {
  it('collects finished books with people counts + plan percentages (docs and size)', async () => {
    const d = await buildDigest(500, deps());
    expect(d.books).toHaveLength(1);
    expect(d.books[0]).toMatchObject({ title: 'The Dawn-Breakers', author: 'Nabíl', people: 42, newPeople: 10, paras: 1200 });
    expect(d.plan).toMatchObject({ docsDone: 30, docsTotal: 253, docsPct: 11.9, parasDone: 1200, parasTotal: 100000, parasPct: 1.2 });
  });
  it('is empty when nothing finished in the window', async () => {
    const d = await buildDigest(500, deps({ queryAll: async () => [] }));
    expect(d.books).toHaveLength(0);
  });
});

describe('render', () => {
  it('HTML + text include the book, author, counts and progress', async () => {
    const d = await buildDigest(500, deps());
    const html = renderDigestHtml(d);
    expect(html).toContain('The Dawn-Breakers');
    expect(html).toContain('42');
    expect(html).toContain('11.9%');
    expect(html).not.toContain('<script');
    expect(renderDigestText(d)).toContain('The Dawn-Breakers — Nabíl');
  });
  it('escapes HTML in titles (no injection)', async () => {
    const d = await buildDigest(500, deps({
      getProgress: async () => ({ phases: [{ label: 'F', books: [{ id: 5, title: '<b>x</b>', author: 'a', size: 1, persons: 0, newInSequence: 0, done: true }] }], doneBooks: 1, totalBooks: 1, totalParas: 1, cumulativeUnique: 0 }),
    }));
    expect(renderDigestHtml(d)).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('sendDigest', () => {
  it('sends nothing when no book finished', async () => {
    const sent = [];
    const r = await sendDigest(500, deps({ queryAll: async () => [], sendEmail: async (m) => sent.push(m), to: 'a@b.c' }));
    expect(r).toEqual({ count: 0, sentTo: null });
    expect(sent).toHaveLength(0);
  });
  it('sends when a book finished', async () => {
    const sent = [];
    const r = await sendDigest(500, deps({ sendEmail: async (m) => sent.push(m), to: 'a@b.c' }));
    expect(r).toEqual({ count: 1, sentTo: 'a@b.c' });
    expect(sent[0].subject).toContain('1 book grounded');
    expect(sent[0].html).toContain('The Dawn-Breakers');
  });
});

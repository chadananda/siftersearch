// Grounding progress digest — completed + in-progress books + plan state, render nice HTML, send-gate + test-send.
import { describe, it, expect } from 'vitest';
import { buildDigest, renderDigestHtml, renderDigestText, sendDigest } from '../../api/lib/pipeline/digest.js';

// queryAll dispatches on the SQL: the 'done' query vs the 'running' (processing) query.
const deps = (o = {}) => ({
  queryAll: async (sql) => (sql.includes("status='running'") ? (o._proc || []) : (o._done ?? [{ doc_id: 5, finished_at: 1000 }])),
  queryOne: async () => ({ title: 'The Dawn-Breakers', author: 'Nabíl', description: 'An early history.', paragraph_count: 1200 }),
  getProgress: async () => ({
    phases: [{ label: 'Foundation', books: [{ id: 5, title: 'The Dawn-Breakers', author: 'Nabíl', size: 1200, persons: 42, newInSequence: 10, done: true }] }],
    doneBooks: 30, totalBooks: 253, totalParas: 100000, cumulativeUnique: 5000,
  }),
  ...o,
});
const procRow = (extra = {}) => ({ doc_id: 6, title: 'Live Book', author: 'Author', paragraph_count: 900, run_json: JSON.stringify({ stage: 'hype', stageIndex: 9, totalStages: 11, withinFrac: 0.5 }), ...extra });

describe('buildDigest', () => {
  it('collects finished books with people counts + plan percentages (docs and size)', async () => {
    const d = await buildDigest(500, deps());
    expect(d.books).toHaveLength(1);
    expect(d.books[0]).toMatchObject({ title: 'The Dawn-Breakers', author: 'Nabíl', people: 42, newPeople: 10, paras: 1200 });
    expect(d.plan).toMatchObject({ docsDone: 30, docsTotal: 253, docsPct: 11.9, parasDone: 1200, parasTotal: 100000, parasPct: 1.2 });
  });
  it('collects currently-processing books with stage + progress', async () => {
    const d = await buildDigest(500, deps({ _proc: [procRow()] }));
    expect(d.processing).toHaveLength(1);
    expect(d.processing[0]).toMatchObject({ title: 'Live Book', stage: 'hype', stageNum: 10, totalStages: 11, withinFrac: 0.5 });
  });
  it('counts people DIRECTLY from bound entities (fixes 0-names for dynamic/pilgrim books)', async () => {
    const d = await buildDigest(500, deps({
      queryOne: async (sql) => (sql.includes('entity_claims') ? { n: 37 } : { title: 'Bio', author: 'X', description: '', paragraph_count: 100 }),
    }));
    expect(d.books[0].people).toBe(37);   // direct count, not the curated-only b.persons
  });
  it('links each book title to its SifterSearch library page (slug + religion + collection)', async () => {
    const d = await buildDigest(500, deps({
      queryOne: async (sql) => (sql.includes('entity_claims') ? { n: 3 }
        : { title: 'The Dawn-Breakers', author: 'Nabíl', description: '', paragraph_count: 100, slug: 'nabil_dawn-breakers', collection: "Baha'i Books", religion: "Baha'i" }),
    }));
    expect(d.books[0].url).toBe("https://siftersearch.com/library/bahai/bahai-books/nabil_dawn-breakers");
    const html = renderDigestHtml(d);
    expect(html).toContain('<a href="https://siftersearch.com/library/bahai/bahai-books/nabil_dawn-breakers"');
    expect(renderDigestText(d)).toContain('https://siftersearch.com/library/');
  });
  it('reports a re-grounding book only ONCE (the repeat-in-every-digest bug: 47 done-rows for one doc)', async () => {
    const d = await buildDigest(500, deps({ _done: [
      { doc_id: 5, finished_at: 1000 }, { doc_id: 5, finished_at: 2000 }, { doc_id: 5, finished_at: 3000 },
    ] }));
    expect(d.books).toHaveLength(1);
    expect(d.books[0].id).toBe(5);
  });
  it('is empty when nothing finished or processing in the window', async () => {
    const d = await buildDigest(500, deps({ _done: [] }));
    expect(d.books).toHaveLength(0);
    expect(d.processing).toHaveLength(0);
  });
});

describe('render', () => {
  it('HTML shows completed + in-progress + progress percentages, escaped', async () => {
    const d = await buildDigest(500, deps({ _proc: [procRow()] }));
    const html = renderDigestHtml(d);
    expect(html).toContain('The Dawn-Breakers');   // completed
    expect(html).toContain('11.9%');               // plan progress
    expect(html).toContain('Currently processing');
    expect(html).toContain('Live Book');           // in-progress
    expect(html).not.toContain('<script');
    expect(renderDigestText(d)).toContain('CURRENTLY PROCESSING');
  });
  it('escapes HTML in titles (no injection)', async () => {
    const d = await buildDigest(500, deps({
      getProgress: async () => ({ phases: [{ label: 'F', books: [{ id: 5, title: '<b>x</b>', author: 'a', size: 1, persons: 0, newInSequence: 0, done: true }] }], doneBooks: 1, totalBooks: 1, totalParas: 1, cumulativeUnique: 0 }),
    }));
    expect(renderDigestHtml(d)).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('sendDigest', () => {
  it('sends nothing when no book finished (hourly gate)', async () => {
    const sent = [];
    const r = await sendDigest(500, deps({ _done: [], sendEmail: async (m) => sent.push(m), to: 'a@b.c' }));
    expect(r).toEqual({ count: 0, processing: 0, sentTo: null });
    expect(sent).toHaveLength(0);
  });
  it('sends when a book finished', async () => {
    const sent = [];
    const r = await sendDigest(500, deps({ sendEmail: async (m) => sent.push(m), to: 'a@b.c' }));
    expect(r).toMatchObject({ count: 1, sentTo: 'a@b.c' });
    expect(sent[0].subject).toContain('1 grounded');
  });
  it('force sends a TEST email even with no completed books', async () => {
    const sent = [];
    const r = await sendDigest(500, deps({ _done: [], _proc: [procRow()], force: true, sendEmail: async (m) => sent.push(m), to: 'a@b.c' }));
    expect(r.sentTo).toBe('a@b.c');
    expect(sent[0].subject).toContain('[TEST]');
    expect(sent[0].html).toContain('Live Book');
  });
});

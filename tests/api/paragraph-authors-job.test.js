// (a compilation's quotation is introduced — "Bahá'u'lláh writes:" — v18b never reassigns an unintroduced block)
// Every paragraph its author (Chad 10-19: "author granularity is not at the document level"): the ops-job port of the
// window run — saved labels resume without a model call, today's rules apply, writes go through the writer with rollback.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paragraphAuthorsJob, isSecondaryBook } from '../../api/lib/ops/paragraph-authors-job.js';

const BOOK = { id: 7, title: 'Lights of Guidance', author: 'Helen Hornby', religion: "Baha'i", collection: 'Compilations', paragraph_count: 2 };
const rows = [
  { id: 100, pidx: 0, text: 'Bahá’u’lláh writes:', heading: null, blocktype: 'paragraph', block_attrs: null, authors: JSON.stringify([{ name: 'Helen Hornby', role: 'author', basis: 'book' }]), authors_model: null },
  { id: 101, pidx: 1, text: 'O Son of Spirit! My first counsel is this: Possess a pure, kindly and radiant heart.', heading: null, blocktype: 'paragraph', block_attrs: null, authors: JSON.stringify([{ name: 'Helen Hornby', role: 'author', basis: 'book' }]), authors_model: null },
  { id: 102, pidx: 2, text: 'The House of Justice advises that consultation should precede action.', heading: null, blocktype: 'paragraph', block_attrs: null, authors: JSON.stringify([{ name: 'Helen Hornby', role: 'author', basis: 'book' }]), authors_model: null },
];

describe('paragraph-authors job', () => {
  it('resumes a saved book with no model call, writes changed authors through the writer, and keeps a rollback', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'pa-'));
    writeFileSync(join(outDir, '7.json'), JSON.stringify({ id: 7, labels: [{ id: 100, speaker: 'Helen Hornby' }, { id: 101, speaker: 'Bahá’u’lláh', conf: 0.95 }, { id: 102, speaker: null }] }));
    const written = [];
    const r = await paragraphAuthorsJob({ ids: [7], write: true, outDir }, {
      ask: async () => { throw new Error('no model call on a saved book'); }, chatCompletion: async () => { throw new Error('no model call'); },
      doc: async () => BOOK, rowsOf: async () => rows, writeAuthors: async (u) => { written.push(...u); return u.length; },
    });
    expect(r).toMatchObject({ resumed: 1, books: 1, errors: 0 });
    expect(written.length).toBeGreaterThan(0);
    expect(written.find((u) => u.id === 101)?.authors[0].name).toMatch(/Bah/);   // Bahá'u'lláh inside a compilation
    expect(existsSync(join(outDir, 'rollback.jsonl'))).toBe(true);
    expect(readFileSync(join(outDir, 'rollback.jsonl'), 'utf8')).toMatch(/Helen Hornby/);
  });
  it('a dry run writes nothing', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'pa-'));
    writeFileSync(join(outDir, '7.json'), JSON.stringify({ id: 7, labels: [{ id: 100, speaker: 'Helen Hornby' }, { id: 101, speaker: 'Bahá’u’lláh', conf: 0.95 }, { id: 102, speaker: null }] }));
    let wrote = false;
    const r = await paragraphAuthorsJob({ ids: [7], outDir }, { ask: async () => ({}), chatCompletion: async () => ({}), doc: async () => BOOK, rowsOf: async () => rows, writeAuthors: async () => { wrote = true; } });
    expect(wrote).toBe(false);
    expect(r.writes).toBeGreaterThan(0);
  });
  it('compilations and scholars get the secondary rules', () => {
    expect(isSecondaryBook(BOOK)).toBe(true);
  });
});

describe('trailer evidence (Lights of Guidance, 10-19)', () => {
  it('a quotation followed by its trailer is the trailer\'s writer — attribute tails stripped, heading resets', async () => {
    const { trailerAuthors } = await import('../../api/lib/authorship/trailers.js');
    const m = trailerAuthors([
      { id: 1, text: '**1. Established First in America** {id="para_11"}', blocktype: 'heading' },
      { id: 2, text: '“The Administrative Order of the Cause … is not an American production …” {id="para_12" ilm_id="x"}', blocktype: 'paragraph' },
      { id: 3, text: '(From a letter written on behalf of Shoghi Effendi to an individual believer, October 29, 1938: Dawn of a New Day, p. 202) {id="para_13" ilm_id="bl4rw"}', blocktype: 'paragraph' },
      { id: 4, text: '“Bahá’í elections are a spiritual act …”', blocktype: 'paragraph' },
      { id: 5, text: '(From a letter of the Universal House of Justice, 1 May 1989)', blocktype: 'paragraph' },
    ]);
    expect(m.get(2)).toMatchObject({ name: 'Shoghi Effendi', on_behalf: true });
    expect(m.get(4)).toMatchObject({ name: 'Universal House of Justice' });
    expect(m.has(1)).toBe(false);
  });
});

describe('Ibid. and <br> trailers (Lights of Guidance 20804, 10-21: ~110 quotations left with no author)', () => {
  it('"(Ibid.)" is the previous trailer\'s writer; a trailer ending ")<br>" before its attribute tail is still a trailer', async () => {
    const { trailerAuthors } = await import('../../api/lib/authorship/trailers.js');
    const m = trailerAuthors([
      { id: 1, text: '“God judges each soul on its own merits.” {id="para_4623"}', blocktype: 'paragraph' },
      { id: 2, text: '(From a letter written on behalf of the Guardian to an individual believer, March 26, 1950)<br>{id="para_4624" ilm_id="bl2tq"}', blocktype: 'paragraph' },
      { id: 3, text: '**93. Preservation of Ballots** {id="para_335"}', blocktype: 'heading' },
      { id: 4, text: '“A Board Member should not be given the opportunity to resign …” {id="para_333"}', blocktype: 'paragraph' },
      { id: 5, text: '(Ibid.) {id="para_334" ilm_id="bl4s2"}', blocktype: 'paragraph' },
      { id: 6, text: '“…it behooveth man, upon reaching the age of nineteen …”', blocktype: 'paragraph' },
      { id: 7, text: '(Ibid., p. 89) [pg 140] {id="para_8121"}', blocktype: 'paragraph' },
    ]);
    expect(m.get(1)).toMatchObject({ name: 'Shoghi Effendi', on_behalf: true });
    expect(m.get(4)).toMatchObject({ name: 'Shoghi Effendi', on_behalf: true });
    expect(m.get(6)).toMatchObject({ name: 'Shoghi Effendi' });
  });
  it('an Ibid. with no trailer before it names nobody', async () => {
    const { trailerAuthors } = await import('../../api/lib/authorship/trailers.js');
    expect(trailerAuthors([{ id: 1, text: '“Some words of guidance for the friends here.”', blocktype: 'paragraph' }, { id: 2, text: '(Ibid.)', blocktype: 'paragraph' }]).has(1)).toBe(false);
  });
});

describe('trailer paragraph keeps its quoted voices', () => {
  it('nextAuthors on a trailer-locked row keeps the author and adds the quoted voice', async () => {
    const { nextAuthors } = await import('../../api/lib/authorship/window-core.js');
    const row = { id: 1, text: 'x', authors: JSON.stringify([{ name: 'Shoghi Effendi', role: 'author', basis: 'trailer' }]) };
    const n = nextAuthors(row, { speaker: 'Helen Hornby', quotes: "Bahá'u'lláh" }, { author: 'Helen Hornby' });
    expect(n.authors.find((e) => e.role === 'author')).toMatchObject({ name: 'Shoghi Effendi', basis: 'trailer' });
    expect(n.authors.some((e) => e.role === 'quoted')).toBe(true);
  });
});

describe('spend cap', () => {
  it('starts no book once maxLlm calls are reached', async () => {
    const { paragraphAuthorsJob } = await import('../../api/lib/ops/paragraph-authors-job.js');
    const { mkdtempSync } = await import('fs'); const { tmpdir } = await import('os'); const { join } = await import('path');
    const books = [1, 2, 3].map((id) => ({ id, title: `B${id}`, author: 'X', religion: "Baha'i", paragraph_count: 1 }));
    const r = await paragraphAuthorsJob({ maxLlm: 0, concurrency: 1, outDir: mkdtempSync(join(tmpdir(), 'pa-')) },
      { ask: async () => ({}), chatCompletion: async () => '', docs: async () => ({ docs: books }), rowsOf: async () => [], writeAuthors: async () => {} });
    expect(r.books).toBe(0);
    expect(r.stopped_at_cap).toBe(3);
  });
});

describe('yields to a drain (10-19: a multi-hour run held the reports service in draining)', () => {
  it('starts no new book while the service drains and reports yielded', async () => {
    vi.resetModules();
    vi.doMock('../../api/lib/drain.js', () => ({ isDraining: () => true }));
    const { paragraphAuthorsJob } = await import('../../api/lib/ops/paragraph-authors-job.js');
    const { mkdtempSync } = await import('fs'); const { tmpdir } = await import('os'); const { join } = await import('path');
    const books = [1, 2].map((id) => ({ id, title: `B${id}`, author: 'X', religion: "Baha'i", paragraph_count: 1 }));
    const r = await paragraphAuthorsJob({ concurrency: 1, outDir: mkdtempSync(join(tmpdir(), 'pa-')) },
      { ask: async () => ({}), chatCompletion: async () => '', docs: async () => ({ docs: books }), rowsOf: async () => [], writeAuthors: async () => {} });
    expect(r.yielded).toBe(true);
    expect(r.books).toBe(0);
    vi.doUnmock('../../api/lib/drain.js');
  });
});

describe('a drain stops a long book mid-way and the next run resumes it (10-21: a 15,600-paragraph volume held the service)', () => {
  it('checkpoints, yields inside the book, then asks only for the windows left', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'pa-'));
    const big = { id: 5, title: 'Big Volume', author: 'Some Assembly', religion: "Baha'i", paragraph_count: 60 };
    const many = Array.from({ length: 60 }, (_, i) => ({ id: 1000 + i, pidx: i, text: `Paragraph ${i} of a long annual record of the community.`, heading: null, blocktype: 'paragraph', block_attrs: null, authors: null, authors_model: null }));
    let asks = 0;
    const deps = (drain) => ({ ask: async () => { asks++; return { answers: {} }; }, chatCompletion: async () => '', docs: async () => ({ docs: [big] }), doc: async () => big,
      rowsOf: async () => many, writeAuthors: async () => {}, draining: drain });
    const r1 = await paragraphAuthorsJob({ concurrency: 1, outDir, write: false }, deps(() => asks >= 3));
    expect(r1.yielded).toBe(true);
    expect(existsSync(join(outDir, '5.json'))).toBe(false);
    expect(JSON.parse(readFileSync(join(outDir, '5.partial.json'), 'utf8')).from).toBe(30);
    asks = 0;
    const r2 = await paragraphAuthorsJob({ concurrency: 1, outDir, write: false }, deps(() => false));
    expect(r2.yielded).toBeFalsy();
    expect(asks).toBe(3);   // windows 30, 40, 50 — not the whole book again
    expect(existsSync(join(outDir, '5.json'))).toBe(true);
    expect(existsSync(join(outDir, '5.partial.json'))).toBe(false);
  });
});

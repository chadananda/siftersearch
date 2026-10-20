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

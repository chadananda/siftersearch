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

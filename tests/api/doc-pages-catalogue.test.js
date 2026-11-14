// The Anís host's /doc catalogue: slug scheme, snapshot shaping (books + original/English pairs), the snapshot reader.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { docPageSlug, docIdFromSlug, docPageUrl } from '../../api/lib/library/doc-slug.js';
import { shapeDocPages, readDocPages } from '../../api/lib/library/doc-pages.js';

describe('doc slug', () => {
  it('title + author + id, ASCII, the id last', () => {
    expect(docPageSlug({ id: 8632, title: 'Gate of the Heart: Understanding the Writings of the Báb', author: 'Nader Saiedi' }))
      .toBe('gate-of-the-heart-understanding-the-writings-of-the-bab-nader-saiedi-8632');
    expect(docPageSlug({ id: 945614, title: 'Prayer for Aḥmad', author: 'The Báb' })).toBe('prayer-for-ahmad-the-bab-945614');
    expect(docPageUrl({ id: 945614, title: 'Prayer for Aḥmad', author: 'The Báb' })).toBe('https://anis.oceanlibrary.com/doc/prayer-for-ahmad-the-bab-945614');
  });
  it('an author already in the title, or unknown, is not repeated; long titles cut at a word', () => {
    expect(docPageSlug({ id: 5, title: "Bahá'u'lláh's Tablet", author: "Bahá'u'lláh" })).toBe('bahaullahs-tablet-5');
    expect(docPageSlug({ id: 6, title: 'Untitled', author: 'Unknown' })).toBe('untitled-6');
    const s = docPageSlug({ id: 7, title: 'word '.repeat(40) });
    expect(s.length).toBeLessThan(80); expect(s).toMatch(/^word(-word)*-7$/);
    expect(docPageSlug({ id: 'x', title: 'T' })).toBeNull();
  });
  it('the trailing id resolves; a bare id too; anything else is not a doc', () => {
    expect(docIdFromSlug('gate-of-the-heart-8632')).toBe(8632);
    expect(docIdFromSlug('8632')).toBe(8632);
    expect(docIdFromSlug('gate-of-the-heart')).toBeNull();
  });
});

describe('shapeDocPages', () => {
  const rows = {
    books: [{ id: 8632, title: 'Gate of the Heart', author: 'Nader Saiedi', religion: "Baha'i", metadata: '{"publicationName":"Wilfrid Laurier University Press"}', purchase_url: 'https://example.com/b', updated_at: '2026-11-03 18:02:54' },
      { id: 9, title: 'Hidden', religion: 'Secret' }],
    tablets: [
      { id: 945614, title: 'Prayer for Ahmad', author: 'The Báb', religion: "Baha'i", language: 'ar', with_original: 0, with_translation: 18, metadata: '{"bookid":"BAB_AHMAD"}' },
      { id: 11, title: 'Prayer for Ahmad (English)', language: 'en', with_original: 18, with_translation: 0, original_doc_id: 945614, original_lang: 'ar' },
      { id: 12, title: 'A Tablet', language: 'en', with_original: 4, with_translation: 0, original_lang: 'fa' },
      { id: 13, title: 'English with a translator only', language: 'en', with_original: 0, with_translation: 30 },
    ],
  };
  const snap = shapeDocPages(rows, { hidden: new Set(['Secret']), now: Date.parse('2026-11-14T00:00:00Z') });
  it('books carry the purchase link and publisher; hidden traditions are out', () => {
    expect(snap.books).toEqual([{ id: 8632, slug: 'gate-of-the-heart-nader-saiedi-8632', title: 'Gate of the Heart', author: 'Nader Saiedi', religion: "Baha'i", collection: null,
      language: null, year: null, description: null, purchase_url: 'https://example.com/b', publisher: 'Wilfrid Laurier University Press', cover_url: null, updated: '2026-11-03' }]);
  });
  it('pairs: original docs with a translation, English docs with a stored original; one page per text', () => {
    expect(snap.tablets.map((t) => t.id)).toEqual([12, 945614]);
    expect(snap.tablets.find((t) => t.id === 945614)).toMatchObject({ language: 'ar', paired: 18, bookid: 'BAB_AHMAD' });
    expect(snap.tablets.find((t) => t.id === 12)).toMatchObject({ language: 'fa', paired: 4 });
  });
  it('readDocPages reads the file, null before the first build', () => {
    const dir = mkdtempSync(join(tmpdir(), 'docp-'));
    expect(readDocPages(join(dir, 'none.json'))).toBeNull();
    writeFileSync(join(dir, 'd.json'), JSON.stringify(snap));
    expect(readDocPages(join(dir, 'd.json')).books[0].id).toBe(8632);
  });
});

describe('GET /api/library/doc-pages', () => {
  it('reads the snapshot (503 until built), never the database', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(join(import.meta.dirname, '../../api/routes/library.js'), 'utf8');
    const h = src.slice(src.indexOf("fastify.get('/doc-pages'"), src.indexOf("fastify.get('/sitemap/:part'"));
    expect(h).toMatch(/readDocPages\(\)/);
    expect(h).toMatch(/code\(503\)/);
    expect(h).not.toMatch(/query(All|One)?\(|repos\//);
  });
  it('the SBS route passes ?cached through to buildSbs', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(join(import.meta.dirname, '../../api/routes/library.js'), 'utf8');
    expect(src).toMatch(/cached: \{ type: 'boolean', default: false \}/);
  });
});

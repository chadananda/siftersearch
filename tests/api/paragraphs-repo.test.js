// The ONE search-document shape: what the sync worker sends to Meili and what Qdrant hits are hydrated with from SQLite.
import { describe, it, expect } from 'vitest';
import { paragraphDoc } from '../../api/lib/paragraphs-repo.js';

const doc = { title: 'The World Order of Bahá’u’lláh', author: 'Shoghi Effendi', religion: "Baha'i", collection: 'Shoghi Effendi',
  language: 'en', year: '1938', filename: 'wob.md', source_site: 'oceanlibrary.com', source_url: 'https://oceanlibrary.com/wob' };

describe('paragraphDoc', () => {
  it('carries every field search callers read, typed as the worker always sent them', () => {
    const d = paragraphDoc({ id: 7, doc_id: 3, paragraph_index: 12, text: 'Small wonder…', authors: null, pdf_page: 4 }, doc, 9);
    expect(d).toMatchObject({ id: 7, doc_id: 3, paragraph_index: 12, text: 'Small wonder…', title: doc.title, author: 'Shoghi Effendi',
      year: 1938, authority: 9, heading: '', blocktype: 'paragraph', pdf_page: 4, source_site: 'oceanlibrary.com', context: null });
    expect(Object.keys(d).sort()).toEqual(['author', 'authority', 'blocktype', 'collection', 'context', 'doc_id', 'external_para_id', 'filename',
      'heading', 'id', 'language', 'paragraph_index', 'pdf_page', 'religion', 'source_site', 'source_url', 'text', 'text_grounded', 'title',
      'translation', 'translation_segments', 'year'].sort());
  });
  it('the paragraph’s own writer is its author (a quotation keeps its writer)', () => {
    const d = paragraphDoc({ id: 8, doc_id: 3, text: '“The earth is but one country…”',
      authors: JSON.stringify([{ name: 'Bahá’u’lláh', role: 'author', basis: 'reference' }]) }, doc, 9);
    expect(d.author).toBe('Bahá’u’lláh');
  });
});

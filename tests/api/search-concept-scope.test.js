// The Bahá'í concept lexicon must not leak into a scope that excludes Bahá'í (11-09, Sikh-scoped search returned the Aqdas).
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/config.js', () => ({ config: { search: { enabled: true, host: 'http://localhost', authorityRankPosition: 4 }, ai: { embeddings: { model: 'm', dimensions: 512 } } } }));
vi.mock('../../api/lib/logger.js', () => ({ logger: { info() {}, warn() {}, error() {}, debug() {} } }));
const { conceptInScope, conceptInDocs } = await import('../../api/lib/search.js');
describe('concept layer scope', () => {
  it('runs unscoped and for Baha\'i', () => { expect(conceptInScope({})).toBe(true); expect(conceptInScope({ religion: "Baha'i" })).toBe(true); expect(conceptInScope({ religion: 'Bahá’í' })).toBe(true); });
  it('is off for another religion, an author, a collection, a language or a year range', () => {
    for (const f of [{ religion: 'Sikh' }, { author: 'X' }, { collection: 'C' }, { language: 'ar' }, { yearFrom: 1900 }]) expect(conceptInScope(f)).toBe(false);
  });
  it('a document scope keeps only that document\'s proofs', () => {
    const r = { hits: [{ paragraph_id: 1, doc_id: 21307 }, { paragraph_id: 2, doc_id: 5 }] };
    expect(conceptInDocs(r, { documentId: 5 }).hits.map((h) => h.paragraph_id)).toEqual([2]);
    expect(conceptInDocs(r, {}).hits).toHaveLength(2);
  });
});

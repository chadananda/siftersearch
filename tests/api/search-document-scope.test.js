// A search scoped to one document stays in it and returns that document's passages (r9, 11-01: /api/v1/search dropped
// filters.documentId — "Elias" in the Íqán came back from ten other books — and every document-scoped multi-index search,
// the named-work scopes of planned search included, returned ONE paragraph).
import { describe, it, expect } from 'vitest';
import { perDocCapFor } from '../../api/lib/search.js';
import { apiSearchFilters, DOCUMENT_ID_SCHEMA } from '../../api/routes/public-api.js';

describe('perDocCapFor', () => {
  it('one passage per book in an open search; the whole limit when scoped to documents or an author', () => {
    expect(perDocCapFor({}, 10)).toBe(1);
    expect(perDocCapFor({ religion: "Bahá'í" }, 10)).toBe(1);
    expect(perDocCapFor({ documentId: 20810 }, 15)).toBe(15);
    expect(perDocCapFor({ documentId: [20810, 20811] }, 8)).toBe(8);
    expect(perDocCapFor({ documentId: [] }, 8)).toBe(1);
    expect(perDocCapFor({ author: 'Shoghi Effendi' }, 8)).toBe(8);
  });
});

describe('public API search filters', () => {
  it('documentId is declared in the schema (Fastify drops undeclared body properties silently)', () => {
    expect(DOCUMENT_ID_SCHEMA.anyOf.map((s) => s.type)).toEqual(['integer', 'string', 'array']);
  });
  it('passes documentId through as a number and marks the search scoped', () => {
    expect(apiSearchFilters({ documentId: '20810', religion: "Bahá'í" })).toEqual({ searchFilters: { religion: "Bahá'í", documentId: 20810 }, scoped: true });
    expect(apiSearchFilters({ documentId: [1, 2] }).searchFilters.documentId).toEqual([1, 2]);
    expect(apiSearchFilters({ author: 'x' })).toEqual({ searchFilters: { author: 'x' }, scoped: false });
    expect(apiSearchFilters({ documentId: 'abc' }).scoped).toBe(false);
  });
});

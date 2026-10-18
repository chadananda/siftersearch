// A document's original source: who may open it (unpublished material public, published scans admin-only), signed links.
import { describe, it, expect } from 'vitest';
import { isPublicSource, signSource, verifySource } from '../../api/lib/doc-source.js';

describe('doc-source', () => {
  it('unpublished material is public; a published book is not', () => {
    expect(isPublicSource({ identified: { appraisal: { kind: 'pilgrim notes' } } })).toBe(true);
    expect(isPublicSource({ identified: { appraisal: { kind: 'letter' } } })).toBe(true);
    expect(isPublicSource({ kind: 'transcript' })).toBe(true);
    expect(isPublicSource({ identified: { appraisal: { kind: 'book' } } })).toBe(false);
    expect(isPublicSource({ identified: { appraisal: { kind: 'book' }, source_public: true } })).toBe(true);   // released by hand
  });
  it('a signed link works for its document until it expires', () => {
    const t = signSource(42, 600000, 1000);
    expect(verifySource(42, t, 2000)).toBe(true);
    expect(verifySource(43, t, 2000)).toBe(false);
    expect(verifySource(42, t, 1000 + 600001)).toBe(false);
    expect(verifySource(42, 'garbage', 2000)).toBe(false);
  });
});

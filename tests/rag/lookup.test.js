// entities/lookup — transliteration-invariant recall (candidates only). On fake ports.
import { describe, it, expect } from 'vitest';
import { makeRag } from './kit.js';

describe('entities/lookup', () => {
  it('returns recall candidates for any spelling', async () => {
    const candidates = [{ id: 3, canonical: 'Quddús', type: 'person', importance: 90 }];
    const { rag } = makeRag({ seed: { candidates } });
    expect(await rag.entities.lookup('Ghoddus')).toEqual(candidates);   // Ghoddus→Quddús via the store's translit recall
  });

  it('returns [] when nothing recalls', async () => {
    const { rag } = makeRag({ seed: { candidates: [] } });
    expect(await rag.entities.lookup('Zzz')).toEqual([]);
  });
});

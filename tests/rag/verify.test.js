// entities/verify — the search-verification gate. Rules only; all querying is a port. Fake ports.
import { describe, it, expect } from 'vitest';
import { makeRag } from './kit.js';

describe('verify — search-verification gate', () => {
  const full = {
    castCount: 355, claimCount: 1200, hypeIndexed: 400, paragraphsIndexed: 3000,
    probes: [{ kind: 'cast', query: 'Mullá Ḥusayn', hits: 12 }, { kind: 'hype', query: 'Who defended Fort Ṭabarsí?', hits: 3 }],
  };

  it('passes only when cast + claims + HyPE + paragraphs all return from search', async () => {
    const { rag } = makeRag({ seed: { grounding: { 21308: full } } });
    const r = await rag.entities.verify(21308);
    expect(r).toMatchObject({ docId: 21308, ok: true });
    expect(r.missing).toEqual([]);
  });

  it('fails and NAMES what is missing (empty cast, unindexed HyPE) — driver cannot claim done', async () => {
    const { rag } = makeRag({ seed: { grounding: { 429: { castCount: 0, claimCount: 50, hypeIndexed: 0, paragraphsIndexed: 800, probes: [] } } } });
    const r = await rag.entities.verify(429);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining([expect.stringMatching(/cast/), expect.stringMatching(/hype/)]));
  });

  it('fails when a probe returns zero hits (exists in tables but is not actually searchable)', async () => {
    const g = { ...full, probes: [{ kind: 'cast', query: 'Vaḥíd', hits: 0 }] };
    const { rag } = makeRag({ seed: { grounding: { 8632: g } } });
    const r = await rag.entities.verify(8632);
    expect(r.ok).toBe(false);
    expect(r.missing.join(' ')).toMatch(/probe\(cast\).*Vaḥíd.*returns nothing/);
  });

  it('defaults to NOT ok when the adapter reports no coverage', async () => {
    const { rag } = makeRag({ seed: {} });
    const r = await rag.entities.verify(999);
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
  });
});

// 10-22: the first search of every fresh API process took 6–10 s — the concept lexicon loaded beside it (one synchronous
// read per proof book, ~4 s). Now: boot warms it (bounded), a timer refreshes it and the encounter index off the request
// path, and an unchanged lexicon is reused without re-reading a single book.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../api/lib/search.js', () => ({ getMeili: () => null, INDEXES: {} }));

const rows = [
  { id: 1, symbol: 'the sun', interpretation: 'the Manifestation', authority: 'A', authority_tier: 1, proof_doc_id: 9, proof_para_id: 'para_2', proof_verbatim: 'the sun of truth' },
  { id: 2, symbol: 'the clouds', interpretation: 'human limitations', authority: 'A', authority_tier: 1, proof_doc_id: 7, proof_para_id: 'para_3', proof_verbatim: 'the clouds' },
];
const book = [{ id: 102, text: 'Behold the sun of truth', block_attrs: '{"id":"para_2"}' }, { id: 103, text: 'the clouds that obscure', block_attrs: '{"id":"para_3"}' }];

describe('lexicon refresh reuses an unchanged lexicon', () => {
  it('reads no proof book when the rows are the same', async () => {
    const { loadLexicon } = await import('../../api/lib/search/concepts.js');
    const rowsOf = vi.fn(async () => book);
    const first = await loadLexicon({ rows, rowsOf });
    expect(rowsOf).toHaveBeenCalledTimes(2);
    expect(first.sig).toMatch(/^2:/);
    const again = await loadLexicon({ rows: rows.map((r) => ({ ...r })), rowsOf, previous: { sig: first.sig, entries: first } });
    expect(rowsOf).toHaveBeenCalledTimes(2);
    expect(again).toBe(first);
    expect(again[0].paragraph_id).toBe(102);
  });
  it('re-resolves when a proof changed', async () => {
    const { loadLexicon } = await import('../../api/lib/search/concepts.js');
    const rowsOf = vi.fn(async () => book);
    const first = await loadLexicon({ rows, rowsOf });
    const changed = [{ ...rows[0], proof_verbatim: 'the clouds that' }, rows[1]];
    const next = await loadLexicon({ rows: changed, rowsOf, previous: { sig: first.sig, entries: first } });
    expect(rowsOf).toHaveBeenCalledTimes(4);
    expect(next[0].paragraph_id).toBe(103);
  });
});

describe('warm keeper', () => {
  it('refreshes every index and survives a failing one', async () => {
    const { keepWarm } = await import('../../api/lib/search/warm-keeper.js');
    const lexicon = vi.fn(async () => {}), encounters = vi.fn(async () => { throw new Error('db busy'); });
    const ms = await keepWarm({ lexicon, encounters });
    expect(lexicon).toHaveBeenCalledOnce();
    expect(encounters).toHaveBeenCalledOnce();
    expect(ms.lexicon).toBeTypeOf('number');
    expect(ms.encounters).toBeNull();
  });
  it('runs on its timer, under the 30-minute TTLs, one pass at a time', async () => {
    vi.useFakeTimers();
    try {
      const { startWarmKeeper, KEEP_EVERY_MS } = await import('../../api/lib/search/warm-keeper.js');
      expect(KEEP_EVERY_MS).toBeLessThan(30 * 60 * 1000);
      let release; const run = vi.fn(() => new Promise((ok) => { release = ok; }));
      const stop = startWarmKeeper({ everyMs: 1000, run });
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);   // still busy: no second pass
      expect(run).toHaveBeenCalledTimes(1);
      release({}); await vi.advanceTimersByTimeAsync(1000);
      expect(run).toHaveBeenCalledTimes(2);
      stop();
    } finally { vi.useRealTimers(); }
  });
});

describe('api runtime wiring', () => {
  const src = readFileSync(new URL('../../api/lib/api-runtime.js', import.meta.url), 'utf8');
  it('warms the lexicon at boot, bounded so it can never outlast listen_timeout', () => {
    expect(src).toMatch(/warmLexicon\(\)/);
    expect(src).toMatch(/Promise\.race\(\[lex, new Promise\(\(ok\) => setTimeout\(ok, 20000\)/);
  });
  it('starts the warm keeper for the services that search', () => {
    expect(src).toMatch(/startWarmKeeper\(\)/);
  });
});

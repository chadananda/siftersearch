// entities/claims — pure gate/parse/row + run() (incl. continuation-on-truncation) on fake ports.
import { describe, it, expect } from 'vitest';
import { parseClaims, proofPresent, claimRow } from '../../api/lib/rag/entities/claims.js';
import { fakeLLM, makeRag } from './kit.js';

const relKeys = new Set(['born', 'died', 'met']);

describe('claims — pure helpers', () => {
  it('parseClaims recovers complete objects from a truncated array', () => {
    const truncated = '{"claims":[{"subject":"A","relation":"born","object":"X","proof":"p"},{"subject":"B","relatio';
    expect(parseClaims(truncated)).toEqual([{ subject: 'A', relation: 'born', object: 'X', proof: 'p' }]);
  });

  it('proofPresent requires a ≥8-char verbatim span of the paragraph', () => {
    const text = 'mullá ḥusayn died at fort ṭabarsí in 1849.';
    expect(proofPresent('died at Fort Ṭabarsí', text)).toBe(true);
    expect(proofPresent('was never written', text)).toBe(false);
    expect(proofPresent('short', text)).toBe(false);
  });

  it('claimRow defers identity (no entity binding) and derives key/time', () => {
    const row = claimRow({ subject: 'Mullá Ḥusayn', relation: 'died', object: 'Fort Ṭabarsí', proof: 'x', when: '1849 [pin]' },
      { docId: 21308, pid: 'para_9', era: '', relKeys, methodVersion: 'v1', extractor: 'e1', batch: 'b1' });
    expect(row).not.toHaveProperty('entity_id');     // LAW: identity deferred
    expect(row).toMatchObject({ relation: 'died', timeValue: '1849', timeBasis: 'pin', batch: 'b1' });
    expect(row.semanticKey).toContain('|died|');
    expect(row.claimHash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('claims — run() on fake ports', () => {
  const para = { id: 1, pid: 'para_1', kind: 'paragraph', contextModel: 'v1', context: '@Khurásán, ~1849 [pin] — Ṭabarsí',
    text: 'Mullá Ḥusayn was born in Bushrúyih. He died at Fort Ṭabarsí in 1849.' };
  const seed = { paras: { 5: [para] }, coverage: { 5: 1 }, relations: [{ key: 'born' }, { key: 'died' }, { key: 'met' }] };
  const reply = (finishReason, claims) => ({ content: JSON.stringify({ claims }), finishReason });
  const good = [
    { subject: 'Mullá Ḥusayn', relation: 'born', object: 'Bushrúyih', proof: 'born in Bushrúyih', when: '1835 [est]' },
    { subject: 'Mullá Ḥusayn', relation: 'died', object: 'Fort Ṭabarsí', proof: 'died at Fort Ṭabarsí in 1849', when: '1849 [pin]' },
    { subject: 'X', relation: 'met', object: 'Y', proof: 'not in the paragraph at all' }, // proof-gate drops this
  ];

  it('extracts proof-gated claims, dropping any without a verbatim span', async () => {
    const { rag, store } = makeRag({ seed, llm: fakeLLM([reply('stop', good)]) });
    const stats = await rag.entities.claims(5, { version: 'v1', batch: 'test' });
    expect(stats).toMatchObject({ claims: 3, dropped: 1, written: 2 });
    expect(store.claims.map((c) => c.relation)).toEqual(['born', 'died']);
    expect(store.claims.every((c) => !('entity_id' in c))).toBe(true);
  });

  it('continues on truncation until the model closes the JSON', async () => {
    // First call: truncated (finish=length) with one claim; second: closes with the rest.
    const llm = fakeLLM((_opts, i) => (i === 0 ? reply('length', [good[0]]) : reply('stop', [good[1]])));
    const { rag, store } = makeRag({ seed, llm });
    const stats = await rag.entities.claims(5, { version: 'v1' });
    expect(stats.continued).toBeGreaterThanOrEqual(1);
    expect(store.claims).toHaveLength(2);
    expect(llm.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('gates on disambiguation', async () => {
    const { rag } = makeRag({ seed: { ...seed, coverage: { 5: 0.3 } } });
    await expect(rag.entities.claims(5)).rejects.toThrow(/disambiguated/);
  });

  it('RESUME skips paragraphs that already have claims (fills gaps, no re-work)', async () => {
    const llm = fakeLLM([reply('stop', good)]);
    const { rag } = makeRag({ seed: { ...seed, claimedParas: { 5: ['para_1'] } }, llm });
    const stats = await rag.entities.claims(5, { version: 'v1', resume: true });
    expect(stats.paras).toBe(0);          // the only paragraph was already claimed → skipped
    expect(llm.calls.length).toBe(0);     // no model calls wasted on done work
  });

  it('RESILIENCE: a transient model error is surfaced as failed (never a silent loss), distinct from empty', async () => {
    const llm = fakeLLM(() => { throw new Error('429 rate limit'); });   // every call throws → errored, never empty
    const { rag, store } = makeRag({ seed, llm });
    const stats = await rag.entities.claims(5, { version: 'v1', model: 'flash', fallback: 'flash' });  // single model → bounded backoff
    expect(store.claims).toHaveLength(0);
    expect(stats.failed).toBe(1);         // errored paragraph is counted — recoverable by a --resume re-run
    expect(stats.empty).toBe(0);          // not misclassified as a genuine empty paragraph
  }, 20000);                              // real ladder+retry-backoff on a fully-erroring paragraph is slow by design
});

// identity-audit — the Jev cluster flagger: windows centred on the mention, and anything not a confident "same" flagged.
import { describe, it, expect } from 'vitest';
import { windowAround, buildRequest, readAnswer, auditClusters, BATCH } from '../../api/lib/identity-audit.js';

describe('identity-audit', () => {
  it('centres the window on the mention (readers missed names past a fixed cut-off)', () => {
    const text = `${'x'.repeat(2000)} Mullá Ḥusayn of Nayríz ${'y'.repeat(2000)}`;
    const w = windowAround(text, 'Mulla Husayn', 100);
    expect(w).toContain('Mullá Ḥusayn of Nayríz');
    expect(w.length).toBeLessThan(260);
  });
  it('asks one choice per cluster, telling Jev a matching name is not evidence', () => {
    const r = buildRequest('PROFILE — Mullá Ḥusayn', [{ title: 'The Bábís of Nayriz', handle: 'Mullá Ḥusayn', surface: 'Mullá Ḥusayn', window: '…' }]);
    expect(Object.keys(r.questions)).toEqual(['c1']);
    expect(r.questions.c1.instructions).toMatch(/a matching name is not evidence/);
  });
  it('flags everything but a confident same', () => {
    expect(readAnswer({ choice: 'same', confidence: 0.9 }).flagged).toBe(false);
    expect(readAnswer({ choice: 'same', confidence: 0.6 }).flagged).toBe(true);
    expect(readAnswer({ choice: 'different', confidence: 0.99 }).flagged).toBe(true);
    expect(readAnswer(undefined).flagged).toBe(true);
  });
  it('batches clusters, and a failed call flags its clusters instead of passing them', async () => {
    const clusters = Array.from({ length: BATCH + 1 }, (_, i) => ({ title: 't', handle: `h${i}`, surface: 's', window: 'w' }));
    let calls = 0;
    const fetchImpl = async () => { calls++; return calls === 1 ? { ok: true, json: async () => ({ answers: Object.fromEntries(Array.from({ length: BATCH }, (_, j) => [`c${j + 1}`, { choice: 'same', confidence: 0.95 }])) }) } : { ok: false, status: 503 }; };
    const out = await auditClusters('P', clusters, { apiKey: 'k', fetchImpl });
    expect(calls).toBe(2);
    expect(out.filter((c) => c.flagged)).toHaveLength(1);
    expect(out.at(-1)).toMatchObject({ verdict: 'error', flagged: true });
  });
});

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
  it('stage 2 sends a reader a likely "different" or a weak "profile", and tells Jev a title is the person', () => {
    expect(readAnswer({ choice: 'different', confidence: 0.8 }, { stage: 2 }).flagged).toBe(true);
    expect(readAnswer({ choice: 'different', confidence: 0.5 }, { stage: 2 }).flagged).toBe(true);    // 0.40–0.73 were mostly real
    expect(readAnswer({ choice: 'different', confidence: 0.3 }, { stage: 2 }).flagged).toBe(false);
    expect(readAnswer({ choice: 'profile', confidence: 0.54 }, { stage: 2 }).flagged).toBe(true);     // weak "profile" hid errors
    expect(readAnswer({ choice: 'profile', confidence: 0.95 }, { stage: 2 }).flagged).toBe(false);
    expect(buildRequest('P', [{ title: 't', handle: 'h', surface: 's', window: 'w' }], { stage: 2 }).questions.c1.instructions).toMatch(/A title, an epithet/);
  });
  it('the profile carries the names the texts use — titles and original script — as this person', async () => {
    const { profileOf } = await import('../../api/lib/identity-audit.js');
    const p = profileOf({ name: 'Mullá Ḥusayn', summary: 's', aliases: ['Bábu\'l-Báb'], names: ['باب الباب', 'Mullá Ḥusayn'] });
    expect(p).toMatch(/also call this person: Bábu'l-Báb · باب الباب\./);
  });
  it('batches clusters, and a failed call flags its clusters instead of passing them', async () => {
    const clusters = Array.from({ length: BATCH + 1 }, (_, i) => ({ title: 't', handle: `h${i}`, surface: 's', window: 'w' }));
    let calls = 0;
    const fetchImpl = async () => { calls++; return calls === 1 ? { ok: true, json: async () => ({ answers: Object.fromEntries(Array.from({ length: BATCH }, (_, j) => [`c${j + 1}`, { choice: 'same', confidence: 0.95 }])) }) } : { ok: false, status: 503 }; };
    const out = await auditClusters('P', clusters, { apiKey: 'k', fetchImpl });
    expect(calls).toBe(3);   // the failed batch is retried once
    expect(out.filter((c) => c.flagged)).toHaveLength(1);
    expect(out.at(-1)).toMatchObject({ verdict: 'error', flagged: true });
  });
});

describe('shadow linking', () => {
  it('asks one choice per occurrence among its cards, plus "not listed" and "not a person"', async () => {
    const { linkRequest, readLink } = await import('../../api/lib/identity-audit.js');
    const r = linkRequest('P', [{ surface: 'Mullá Ḥusayn', cands: [{ id: 5, card: 'Mullá Ḥusayn | Bushrú’í' }, { id: 9, card: 'Mullá Ḥusayn of Nayríz' }] }]);
    expect(Object.keys(r.questions.o1.criteria)).toEqual(['c5', 'c9', 'new', 'none']);
    expect(readLink({ choice: 'c9', confidence: 0.9 })).toEqual({ pick: 9, confidence: 0.9 });
    expect(readLink({ choice: 'none', probabilities: { none: 0.7 } })).toEqual({ pick: 'none', confidence: 0.7 });
  });
  it('a credits outage is thrown, never read as "no opinion"', async () => {
    const { linkParagraph } = await import('../../api/lib/identity-audit.js');
    await expect(linkParagraph('P', [{ surface: 's', cands: [] }], { apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 402 }) })).rejects.toThrow(/402/);
  });
});

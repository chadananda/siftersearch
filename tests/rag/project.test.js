// entities/project — materialize entities from the decision log. On fake ports.
import { describe, it, expect } from 'vitest';
import { makeRag } from './kit.js';

const proposals = [
  { id: 1, kind: 'link', status: 'approved', confidence: 0.92, payload: { resolvedAs: 'Mullá Ḥusayn-i-Bushrú’í', entityId: 5, canonical: null } },
  { id: 2, kind: 'create', status: 'approved', confidence: 0.8, payload: { resolvedAs: 'Karbilá’í ‘Alí', entityId: null, canonical: 'Karbilá’í ‘Alí', type: 'person' } },
  { id: 3, kind: 'link', status: 'proposed', confidence: 0.6, payload: { resolvedAs: 'X', entityId: 7 } },   // low-conf, not approved
  { id: 4, kind: 'uncertain', status: 'proposed', confidence: 0.4, payload: { resolvedAs: 'Y' } },            // never applied
  { id: 5, kind: 'link', status: 'applied', confidence: 0.99, payload: { resolvedAs: 'Z', entityId: 8 } },   // already applied
];

describe('entities/project', () => {
  it('dry-run reports what would apply without writing', async () => {
    const { rag, store } = makeRag({ seed: { proposals } });
    const stats = await rag.entities.project({ dryRun: true });
    expect(stats).toMatchObject({ proposals: 5, toApply: 2, uncertain: 1 }); // #1 link + #2 create; #3 low-conf, #4 uncertain, #5 done
    expect(store.created).toHaveLength(0);
    expect(store.bound).toHaveLength(0);
  });

  it('applies approved link + create, binds their clusters, marks them applied', async () => {
    const { rag, store } = makeRag({ seed: { proposals, clusterSizes: { 'Mullá Ḥusayn-i-Bushrú’í': 40, 'Karbilá’í ‘Alí': 3 } } });
    const stats = await rag.entities.project();
    expect(stats).toMatchObject({ applied: 2, created: 1, linked: 1, mentionsBound: 43 });
    expect(stats.createdIds).toEqual([store.created[0].id]);   // → handed to dedup-guard
    expect(store.created[0]).toMatchObject({ canonical: 'Karbilá’í ‘Alí', type: 'person' });
    expect(store.bound.map((b) => b.resolvedAs).sort()).toEqual(['Karbilá’í ‘Alí', 'Mullá Ḥusayn-i-Bushrú’í']);
    expect(store.appliedMarks.map((m) => m.id).sort()).toEqual([1, 2]);
  });

  it('never applies an uncertain decision, even with auto/high-confidence', async () => {
    const uncertainHi = [{ id: 9, kind: 'uncertain', status: 'proposed', confidence: 0.99, payload: { resolvedAs: 'Q', entityId: 1 } }];
    const { rag, store } = makeRag({ seed: { proposals: uncertainHi } });
    const stats = await rag.entities.project({ auto: true, hiConf: 0.85 });
    expect(stats.applied).toBe(0);
    expect(store.bound).toHaveLength(0);
  });

  it('auto mode applies a high-confidence proposed link', async () => {
    const hi = [{ id: 9, kind: 'link', status: 'proposed', confidence: 0.95, payload: { resolvedAs: 'Q', entityId: 1 } }];
    const { rag, store } = makeRag({ seed: { proposals: hi } });
    const stats = await rag.entities.project({ auto: true, hiConf: 0.85 });
    expect(stats).toMatchObject({ applied: 1, linked: 1 });
    expect(store.bound[0]).toMatchObject({ resolvedAs: 'Q', entityId: 1 });
  });
});

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

  it('docId scopes application to ONE book — other books’ decisions stay unapplied (serial grounding)', async () => {
    const mixed = [
      { id: 1, kind: 'create', status: 'approved', confidence: 0.9, payload: { resolvedAs: 'A', entityId: null, canonical: 'A', type: 'person', docId: 21310 } },
      { id: 2, kind: 'create', status: 'approved', confidence: 0.9, payload: { resolvedAs: 'B', entityId: null, canonical: 'B', type: 'person', docId: 21308 } },
    ];
    const { rag, store } = makeRag({ seed: { proposals: mixed } });
    const stats = await rag.entities.project({ docId: 21310 });
    expect(stats).toMatchObject({ applied: 1, created: 1 });
    expect(store.created).toHaveLength(1);
    expect(store.created[0].canonical).toBe('A');   // only the 21310 book's create is applied
  });

  it('skips a link whose id is not a real numeric entity id (name-as-id / null) — never binds junk', async () => {
    const bad = [
      { id: 1, kind: 'link', status: 'approved', confidence: 0.95, payload: { resolvedAs: 'A', entityId: 'Mírzá Abu’l-Qásim', docId: 21308 } },
      { id: 2, kind: 'link', status: 'approved', confidence: 0.95, payload: { resolvedAs: 'B', entityId: null, docId: 21308 } },
      { id: 3, kind: 'link', status: 'approved', confidence: 0.95, payload: { resolvedAs: 'C', entityId: 42, docId: 21308 } },
    ];
    const { rag, store } = makeRag({ seed: { proposals: bad } });
    const stats = await rag.entities.project({ docId: 21308 });
    expect(stats.skippedBadId).toBe(2);          // name-as-id + null both skipped
    expect(stats).toMatchObject({ linked: 1, applied: 1 });
    expect(store.bound).toEqual([{ resolvedAs: 'C', entityId: 42, conf: 0.95 }]);   // only the real integer id bound
  });

  it('auto mode applies a high-confidence proposed link', async () => {
    const hi = [{ id: 9, kind: 'link', status: 'proposed', confidence: 0.95, payload: { resolvedAs: 'Q', entityId: 1 } }];
    const { rag, store } = makeRag({ seed: { proposals: hi } });
    const stats = await rag.entities.project({ auto: true, hiConf: 0.85 });
    expect(stats).toMatchObject({ applied: 1, linked: 1 });
    expect(store.bound[0]).toMatchObject({ resolvedAs: 'Q', entityId: 1 });
  });

  it('a re-adjudicated CREATE reuses the entity its superseded create minted — never a duplicate', async () => {
    const re = [{ id: 20, kind: 'create', status: 'proposed', confidence: 0.9, supersedes: 10, priorKind: 'create', priorEntityId: 555,
      payload: { resolvedAs: 'Re One', entityId: null, canonical: 'Re One', type: 'person', docId: 21310 } }];
    const { rag, store } = makeRag({ seed: { proposals: re, clusterSizes: { 'Re One': 4 } } });
    const stats = await rag.entities.project({ auto: true, hiConf: 0.85, docId: 21310 });
    expect(stats).toMatchObject({ reused: 1, created: 0, mentionsBound: 4 });
    expect(store.created).toHaveLength(0);                          // no new entity minted
    expect(store.bound[0]).toMatchObject({ resolvedAs: 'Re One', entityId: 555 });  // rebound to the same entity
  });

  it('a re-adjudication pulling a LINK back to uncertain UNBINDS the cluster', async () => {
    const pull = [{ id: 21, kind: 'uncertain', status: 'proposed', confidence: 0.3, supersedes: 11, priorKind: 'link', priorEntityId: 88,
      payload: { resolvedAs: 'Pull One', docId: 21310 } }];
    const { rag, store } = makeRag({ seed: { proposals: pull, clusterSizes: { 'Pull One': 6 } } });
    const stats = await rag.entities.project({ auto: true, docId: 21310 });
    expect(stats.unbound).toBe(6);
    expect(store.unbound[0]).toMatchObject({ resolvedAs: 'Pull One' });
    expect(store.bound).toHaveLength(0);                            // never bound; the veto is honored
    expect(store.appliedMarks).toContainEqual({ id: 21, entityId: null });
  });

  it('a LINK→CREATE split does NOT reuse the old link target (that entity is someone else) — mints new', async () => {
    const split = [{ id: 22, kind: 'create', status: 'proposed', confidence: 0.9, supersedes: 12, priorKind: 'link', priorEntityId: 99,
      payload: { resolvedAs: 'Split One', entityId: null, canonical: 'Split One', type: 'person', docId: 21310 } }];
    const { rag, store } = makeRag({ seed: { proposals: split, clusterSizes: { 'Split One': 2 } } });
    const stats = await rag.entities.project({ auto: true, hiConf: 0.85, docId: 21310 });
    expect(stats).toMatchObject({ created: 1, reused: 0 });
    expect(store.created).toHaveLength(1);
    expect(store.bound[0].entityId).not.toBe(99);                  // not bound to the prior link target
  });
});

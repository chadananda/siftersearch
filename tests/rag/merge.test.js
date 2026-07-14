// entities/merge — evidence-based dedup; merge same-person, keep namesakes apart. Fake ports.
import { describe, it, expect } from 'vitest';
import { parseMerge, buildUser, SYSTEM } from '../../api/lib/rag/entities/merge.js';
import { fakeLLM, makeRag } from './kit.js';

describe('merge — pure helpers', () => {
  it('parseMerge reads canonical/same/distinct', () => {
    expect(parseMerge('{"canonical":5,"same":[6,7],"distinct":[8],"reason":"same era/role"}'))
      .toEqual({ canonical: 5, same: [6, 7], distinct: [8], reason: 'same era/role' });
    expect(parseMerge('nope')).toBeNull();
  });
  it('the prompt merges on evidence CONSISTENCY (keep apart only on contradiction), with a bare-common-name caution', () => {
    expect(SYSTEM).toMatch(/consisten/i);                 // merge when consistent — not "facts must agree"
    expect(SYSTEM).toMatch(/contradict/i);                // keep apart ONLY on a load-bearing contradiction
    expect(SYSTEM).toMatch(/bare|common given-name/i);    // namesake caution retained for bare common names
    expect(buildUser({ key: 'abdulbaha', ids: [1, 2], entities: [{ id: 1, canonical: '‘Abdu’l-Bahá', mentions: 40 }, { id: 2, canonical: '‘Abdu’l-Bahá', mentions: 3 }] })).toContain('abdulbaha');
  });
});

describe('merge — run() on fake ports', () => {
  const dupGroups = [
    { key: 'abdulbaha', ids: [5, 6, 7], entities: [{ id: 5, canonical: '‘Abdu’l-Bahá', mentions: 40 }, { id: 6, canonical: '‘Abdu’l-Bahá', mentions: 2 }, { id: 7, canonical: '‘Abdu’l-Bahá', mentions: 1 }] },
    { key: 'muhammad', ids: [10, 11], entities: [{ id: 10, canonical: 'Muḥammad', mentions: 5 }, { id: 11, canonical: 'Muḥammad', mentions: 4 }] },
  ];
  const adjudicate = (_o, _i, msgs) => {
    const u = msgs[1].content;
    if (u.includes('abdulbaha')) return { content: '{"canonical":5,"same":[6,7],"distinct":[],"reason":"clearly one person"}' };
    return { content: '{"canonical":10,"same":[],"distinct":[11],"reason":"different men sharing a common name"}' };
  };

  it('merges the confirmed same-person group; keeps namesakes distinct', async () => {
    const { rag, store } = makeRag({ seed: { dupGroups }, llm: fakeLLM(adjudicate) });
    const stats = await rag.entities.merge({ model: 'flash', fallback: 'haiku' });
    expect(stats).toMatchObject({ groups: 2, adjudicated: 2, merges: 1, entitiesMerged: 2, kept: 1 });
    expect(store.merges).toHaveLength(1);
    expect(store.merges[0]).toMatchObject({ canonical: 5, mergeIds: [6, 7] });   // namesake group NOT merged
  });

  it('dry-run returns plans without merging', async () => {
    const { rag, store } = makeRag({ seed: { dupGroups }, llm: fakeLLM(adjudicate) });
    const stats = await rag.entities.merge({ dryRun: true, model: 'flash', fallback: 'haiku' });
    expect(stats.plans).toHaveLength(1);
    expect(store.merges).toHaveLength(0);
  });
});

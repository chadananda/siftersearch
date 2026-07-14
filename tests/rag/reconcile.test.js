// entities/reconcile — evidence adjudication → proposed decisions. Pure verdict/decision + run() on fakes.
// Uses real GPB cast (Mullá Ḥusayn, Fort Ṭabarsí, the Báb) as examples.
import { describe, it, expect } from 'vitest';
import { parseVerdict, decisionRow, buildUser, SYSTEM } from '../../api/lib/rag/entities/reconcile.js';
import { fakeLLM, makeRag } from './kit.js';

describe('reconcile — pure helpers', () => {
  it('parseVerdict accepts the four verdicts and rejects anything else', () => {
    expect(parseVerdict('{"verdict":"link","entity_id":5,"confidence":0.9}')).toMatchObject({ verdict: 'link', entityId: 5 });
    expect(parseVerdict('{"verdict":"other","type":"place","canonical":"Fort Ṭabarsí"}')).toMatchObject({ verdict: 'other', type: 'place' });
    expect(parseVerdict('{"verdict":"maybe"}')).toBeNull();
    expect(parseVerdict('not json')).toBeNull();
  });

  it('decisionRow maps verdict→kind, carries entity_id only for a link, and is a tier-2 proposal', () => {
    const cluster = { resolvedAs: 'Mullá Ḥusayn-i-Bushrú’í', freq: 40, paraIds: ['para_1', 'para_2'] };
    const link = decisionRow(parseVerdict('{"verdict":"link","entity_id":5,"decisive":"same role/era","confidence":0.9}'), cluster, [{ id: 5 }]);
    expect(link).toMatchObject({ kind: 'link', targetKind: 'mention-cluster', actor: 'model', actorTier: 2, status: 'proposed' });
    expect(link.payload).toMatchObject({ entityId: 5, freq: 40 });

    const other = decisionRow(parseVerdict('{"verdict":"other","type":"place","canonical":"Fort Ṭabarsí"}'), { resolvedAs: 'Fort Ṭabarsí', freq: 20, paraIds: [] }, []);
    expect(other.kind).toBe('other-type');
    expect(other.payload.entityId).toBeNull();              // never binds an entity for a non-person

    const create = decisionRow(parseVerdict('{"verdict":"create","canonical":"Karbilá’í ‘Alí","confidence":0.7}'), { resolvedAs: 'x', freq: 3, paraIds: [] }, [{ id: 9 }], 21308);
    expect(create.kind).toBe('create');
    expect(create.payload.entityId).toBeNull();             // a create carries no link id
    expect(create.payload.docId).toBe(21308);               // tagged with its book → doc-scoped project
  });

  it('the prompt forbids binding on name similarity alone', () => {
    expect(SYSTEM).toMatch(/name similarity ALONE never/i);
    expect(buildUser({ resolvedAs: 'the Báb', freq: 100, paraIds: ['para_1'] }, [{ id: 1, canonical: 'the Báb', importance: 100 }], [{ pid: 'para_1', context: '@Shíráz — Declaration' }]))
      .toContain('the Báb');
  });

  it('buildUser renders a GROUNDED EVIDENCE block when cross-book evidence is supplied', () => {
    const u = buildUser({ resolvedAs: 'Mírzá Aḥmad', freq: 5, paraIds: ['para_3'] },
      [{ id: 7, canonical: 'Mírzá Aḥmad-i-Azghandí', importance: 40 }],
      [{ pid: 'para_3', context: '@Baghdád — the Báb’s amanuensis' }],
      [{ entityId: 9, name: '‘Abdu’l-Karím-i-Qazvíní', fact: 'served as the Báb’s amanuensis at Baghdád', source: 'GPB ¶88' }]);
    expect(u).toMatch(/GROUNDED EVIDENCE/);
    expect(u).toContain('#9');
    expect(u).toContain('amanuensis');       // the decisive cross-book fact reaches the adjudicator
  });

  it('the prompt makes grounded evidence decisive over name overlap', () => {
    expect(SYSTEM).toMatch(/GROUNDED EVIDENCE[\s\S]*DECISIVE/);
  });
});

describe('reconcile — run() on fake ports (GPB clusters)', () => {
  const clusters = [
    { resolvedAs: 'Mullá Ḥusayn-i-Bushrú’í (first Letter of the Living)', freq: 40, paraIds: ['para_1'] },
    { resolvedAs: 'Fort Ṭabarsí', freq: 20, paraIds: ['para_9'] },
  ];
  // Branch the verdict on the cluster named in the prompt.
  const adjudicate = (_opts, _i, messages) => {
    const u = messages[1].content;
    if (u.includes('Fort Ṭabarsí')) return { content: '{"verdict":"other","type":"place","canonical":"Fort Ṭabarsí","entity_id":null,"confidence":1}' };
    return { content: '{"verdict":"link","type":"person","entity_id":5,"decisive":"same person: Ṭabarsí commander","confidence":0.92}' };
  };

  it('proposes a link for the person cluster and other-type for the place', async () => {
    const seed = { clusters: { 21310: clusters }, coverage: { 21310: 1 }, candidates: [{ id: 5, canonical: 'Mullá Ḥusayn', type: 'person', importance: 95 }] };
    const { rag, store } = makeRag({ seed, llm: fakeLLM(adjudicate) });
    const stats = await rag.entities.reconcile(21310);
    expect(stats).toMatchObject({ clusters: 2, adjudicated: 2, failed: 0, proposed: 2 });
    expect(stats.byKind).toEqual({ link: 1, 'other-type': 1 });
    const link = store.decisions.find((d) => d.kind === 'link');
    expect(link.payload).toMatchObject({ entityId: 5 });
    expect(store.decisions.every((d) => d.status === 'proposed' && d.actorTier === 2)).toBe(true);
  });

  it('consults the grounded corpus and feeds its evidence into the adjudication prompt', async () => {
    const seed = {
      clusters: { 21310: [{ resolvedAs: 'Mírzá Aḥmad', freq: 5, paraIds: ['para_3'] }] },
      coverage: { 21310: 1 },
      candidates: [{ id: 7, canonical: 'Mírzá Aḥmad-i-Azghandí', type: 'person', importance: 40 }],
      grounded: [{ entityId: 9, name: '‘Abdu’l-Karím-i-Qazvíní', fact: 'the Báb’s amanuensis at Baghdád', source: 'GPB ¶88' }],
    };
    const llm = fakeLLM([{ content: '{"verdict":"create","type":"person","canonical":"Mírzá Aḥmad","confidence":0.6}' }]);
    const { rag } = makeRag({ seed, llm });
    await rag.entities.reconcile(21310);
    const prompt = llm.calls[0].messages[1].content;
    expect(prompt).toMatch(/GROUNDED EVIDENCE/);
    expect(prompt).toContain('amanuensis');     // cross-book fact name-recall alone would miss
    expect(prompt).toContain('#9');
  });

  it('gates on disambiguation', async () => {
    const { rag } = makeRag({ seed: { clusters: { 21310: clusters }, coverage: { 21310: 0.5 } } });
    await expect(rag.entities.reconcile(21310)).rejects.toThrow(/disambiguated/);
  });
});

describe('reconcile — durable checkpointing + resume (the binding fix)', () => {
  // A big book: many clusters, so a single end-of-run write would lose everything to an interruption.
  const many = Array.from({ length: 10 }, (_, i) => ({ resolvedAs: `Person ${i}`, freq: 5, paraIds: [`para_${i}`] }));
  const linkAll = () => ({ content: '{"verdict":"create","type":"person","canonical":"x","confidence":0.7}' });

  it('flushes decisions in batches instead of one final write, so partial progress is durable', async () => {
    const seed = { clusters: { 21310: many }, coverage: { 21310: 1 } };
    const { rag, store } = makeRag({ seed, llm: fakeLLM(linkAll) });
    const stats = await rag.entities.reconcile(21310, { flush: 3, concurrency: 2 });
    expect(stats.proposed).toBe(10);                 // every decision persisted…
    expect(store.decisions.length).toBe(10);
    expect(store.decisionBatches.length).toBeGreaterThan(1);  // …across multiple checkpoints, not one end-write
    expect(store.decisionBatches.reduce((a, b) => a + b, 0)).toBe(10); // no rows lost or duplicated
  });

  it('resume skips clusters already decided IN THIS BOOK (a killed run picks up where it left off)', async () => {
    const seed = { clusters: { 21310: many }, coverage: { 21310: 1 }, decided: ['Person 0', 'Person 1', 'Person 2'] };
    const llm = fakeLLM(linkAll);
    const { rag, store } = makeRag({ seed, llm });
    const stats = await rag.entities.reconcile(21310, { resume: true, flush: 3 });
    expect(stats.clusters).toBe(7);                  // the 3 already-decided are filtered out
    expect(store.decisions.length).toBe(7);          // only the remaining are adjudicated + written
    expect(llm.calls.length).toBe(7);                // and no LLM call is wasted on decided clusters
  });

  it('dryRun writes nothing but still returns the verdicts for review', async () => {
    const seed = { clusters: { 21310: many }, coverage: { 21310: 1 } };
    const { rag, store } = makeRag({ seed, llm: fakeLLM(linkAll) });
    const stats = await rag.entities.reconcile(21310, { dryRun: true, flush: 3 });
    expect(stats.proposed).toBe(0);
    expect(store.decisions.length).toBe(0);          // nothing persisted
    expect(stats.decisions.length).toBe(10);         // but the caller gets every verdict
  });
});

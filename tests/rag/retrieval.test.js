// enrich/retrieval (HyPE) — pure parse + run() on fakes, including the disambiguation gate.
import { describe, it, expect } from 'vitest';
import { parseHype } from '../../api/lib/rag/enrich/retrieval.js';
import { fakeLLM, makeRag } from './kit.js';

const NOTE = '{"questions":["Who declared in Shíráz?","When was the Declaration?","What is the Báb\'s role?","Why does it matter?","How did it begin?"],"thesis":"The Báb declared His mission in Shíráz in 1844."}';
const para = { id: 1, pid: 'p1', text: 'a'.repeat(80), heading: 'Ch1', context: '@Shíráz, ~1844 — the Declaration' };

describe('retrieval — parseHype', () => {
  it('accepts ≥4 questions + thesis, caps at 5', () => {
    expect(parseHype(NOTE)).toMatchObject({ thesis: expect.stringContaining('Shíráz') });
    expect(parseHype(NOTE).questions).toHaveLength(5);
  });
  it('rejects fewer than 4 questions', () => {
    expect(parseHype('{"questions":["a?","b?"],"thesis":"x"}')).toBeNull();
  });
});

describe('retrieval — run() on fake ports', () => {
  it('gates on disambiguation: refuses a doc below coverage threshold', async () => {
    const { rag } = makeRag({ seed: { paras: { 9: [para] }, coverage: { 9: 0.5 } }, llm: fakeLLM([{ content: NOTE }]) });
    await expect(rag.retrieval.index(9)).rejects.toThrow(/disambiguated/);
  });

  it('writes questions + thesis for each long paragraph once disambiguated', async () => {
    const { rag, store } = makeRag({ seed: { paras: { 9: [para] }, coverage: { 9: 1 } }, llm: fakeLLM([{ content: NOTE }]) });
    const stats = await rag.retrieval.index(9);
    expect(stats).toMatchObject({ done: 1, failed: 0 });
    expect(store.hyped).toHaveLength(1);
    expect(store.hyped[0]).toMatchObject({ paragraphId: 1, questions: expect.any(Array) });
    expect(store.hyped[0].questions).toHaveLength(5);
  });

  it('skips short fragments and already-HyPE\'d paragraphs (RESUME)', async () => {
    const done = { ...para, id: 2, pid: 'p2', hyp: JSON.stringify(['a?', 'b?', 'c?', 'd?']), hypThesis: 'done' };
    const short = { ...para, id: 3, pid: 'p3', text: 'tiny' };
    const { rag, store } = makeRag({ seed: { paras: { 9: [done, short] }, coverage: { 9: 1 } }, llm: fakeLLM([{ content: NOTE }]) });
    const stats = await rag.retrieval.index(9);
    expect(stats.done).toBe(0);       // one already done, one too short
    expect(store.hyped).toHaveLength(0);
  });
});

// enrich/retrieval (HyPE) — pure parse + run() on fakes, including the disambiguation gate and the v2
// fact-informed adaptive behavior (2-5 questions, version stamp, cited-claim feed).
import { describe, it, expect } from 'vitest';
import { parseHype, HYPE_VERSION } from '../../api/lib/rag/enrich/retrieval.js';
import { fakeLLM, makeRag } from './kit.js';

const NOTE = '{"questions":["Who declared in Shíráz?","When was the Declaration?","What is the Báb\'s role?","Why does it matter?","How did it begin?"],"thesis":"The Báb declared His mission in Shíráz in 1844."}';
const NOTE3 = '{"questions":["Who declared in Shíráz?","When was the Declaration?","What happened in Shíráz in 1844?"],"thesis":"The Báb declared His mission in Shíráz in 1844."}';
const para = { id: 1, pid: 'p1', text: 'a'.repeat(80), heading: 'Ch1', context: '@Shíráz, ~1844 — the Declaration' };

describe('retrieval — parseHype (v2 adaptive)', () => {
  it('accepts 5 questions + thesis, caps at 5', () => {
    expect(parseHype(NOTE)).toMatchObject({ thesis: expect.stringContaining('Shíráz') });
    expect(parseHype(NOTE).questions).toHaveLength(5);
  });
  it('accepts an adaptive 2-3 question array (thin paragraph)', () => {
    expect(parseHype(NOTE3).questions).toHaveLength(3);
    expect(parseHype('{"questions":["a?","b?"],"thesis":"x"}').questions).toHaveLength(2);
  });
  it('rejects fewer than 2 questions', () => {
    expect(parseHype('{"questions":["only one?"],"thesis":"x"}')).toBeNull();
    expect(parseHype('{"questions":[],"thesis":"x"}')).toBeNull();
  });
});

describe('retrieval — run() on fake ports', () => {
  it('gates on disambiguation: refuses a doc below coverage threshold', async () => {
    const { rag } = makeRag({ seed: { paras: { 9: [para] }, coverage: { 9: 0.5 } }, llm: fakeLLM([{ content: NOTE }]) });
    await expect(rag.retrieval.index(9)).rejects.toThrow(/disambiguated/);
  });

  it('writes questions + thesis + HYPE_VERSION stamp for each long paragraph', async () => {
    const { rag, store } = makeRag({ seed: { paras: { 9: [para] }, coverage: { 9: 1 } }, llm: fakeLLM([{ content: NOTE }]) });
    const stats = await rag.retrieval.index(9);
    expect(stats).toMatchObject({ done: 1, failed: 0, version: HYPE_VERSION });
    expect(store.hyped).toHaveLength(1);
    expect(store.hyped[0]).toMatchObject({ paragraphId: 1, questions: expect.any(Array), version: HYPE_VERSION });
    expect(store.hyped[0].questions).toHaveLength(5);
  });

  it('accepts an adaptive 3-question reply and persists it', async () => {
    const { rag, store } = makeRag({ seed: { paras: { 9: [para] }, coverage: { 9: 1 } }, llm: fakeLLM([{ content: NOTE3 }]) });
    const stats = await rag.retrieval.index(9);
    expect(stats.done).toBe(1);
    expect(store.hyped[0].questions).toHaveLength(3);
  });

  it('feeds cited claims into the prompt (ESTABLISHED FACTS) and counts factFed', async () => {
    const llm = fakeLLM([{ content: NOTE }]);
    const { rag } = makeRag({
      seed: { paras: { 9: [para] }, coverage: { 9: 1 }, paraClaims: { 9: { p1: ['The Báb — declared His mission in Shíráz, 22 May 1844'] } } },
      llm,
    });
    const stats = await rag.retrieval.index(9);
    expect(stats.factFed).toBe(1);
    const user = llm.calls[0].messages.find((m) => m.role === 'user').content;
    expect(user).toContain('ESTABLISHED FACTS');
    expect(user).toContain('declared His mission in Shíráz');
  });

  it('stays fact-blind (no FACTS block) when the paragraph has no claims', async () => {
    const llm = fakeLLM([{ content: NOTE }]);
    const { rag } = makeRag({ seed: { paras: { 9: [para] }, coverage: { 9: 1 } }, llm });
    await rag.retrieval.index(9);
    const user = llm.calls[0].messages.find((m) => m.role === 'user').content;
    expect(user).not.toContain('ESTABLISHED FACTS');
  });

  it('skips short fragments and already-HyPE\'d paragraphs (RESUME accepts v1 and v2 counts)', async () => {
    const doneV1 = { ...para, id: 2, pid: 'p2', hyp: JSON.stringify(['a?', 'b?', 'c?', 'd?', 'e?']), hypThesis: 'done' };
    const doneV2 = { ...para, id: 4, pid: 'p4', hyp: JSON.stringify(['a?', 'b?', 'c?']), hypThesis: 'done' };
    const short = { ...para, id: 3, pid: 'p3', text: 'tiny' };
    const { rag, store } = makeRag({ seed: { paras: { 9: [doneV1, doneV2, short] }, coverage: { 9: 1 } }, llm: fakeLLM([{ content: NOTE }]) });
    const stats = await rag.retrieval.index(9);
    expect(stats.done).toBe(0);       // two already done (v1 + v2 formats), one too short
    expect(store.hyped).toHaveLength(0);
  });

  it('resume:false regenerates even already-done paragraphs (the explicit rehype path)', async () => {
    const doneV1 = { ...para, id: 2, pid: 'p2', hyp: JSON.stringify(['a?', 'b?', 'c?', 'd?', 'e?']), hypThesis: 'done' };
    const { rag, store } = makeRag({ seed: { paras: { 9: [doneV1] }, coverage: { 9: 1 } }, llm: fakeLLM([{ content: NOTE }]) });
    const stats = await rag.retrieval.index(9, { resume: false });
    expect(stats.done).toBe(1);
    expect(store.hyped).toHaveLength(1);
    expect(store.hyped[0].version).toBe(HYPE_VERSION);
  });
});

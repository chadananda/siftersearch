// enrich/retrieval (HyPE) — pure parse + run() on fakes, including the disambiguation gate and the v2
// fact-informed adaptive behavior (2-5 questions, version stamp, cited-claim feed).
import { describe, it, expect } from 'vitest';
import { parseHype, sliceParagraph, HYPE_VERSION } from '../../api/lib/rag/enrich/retrieval.js';
import { fakeLLM, makeRag } from './kit.js';

const NOTE = '{"questions":["Who declared in Shíráz?","When was the Declaration?","What is the Báb\'s role?","Why does it matter?","How did it begin?"],"thesis":"The Báb declared His mission in Shíráz in 1844."}';
const NOTE3 = '{"questions":["Who declared in Shíráz?","When was the Declaration?","What happened in Shíráz in 1844?"],"thesis":"The Báb declared His mission in Shíráz in 1844."}';
const para = { id: 1, pid: 'p1', text: 'a'.repeat(80), heading: 'Ch1', context: '@Shíráz, ~1844 — the Declaration' };

describe('retrieval — parseHype (v3: count set by the paragraph)', () => {
  it('accepts 5 questions + thesis', () => {
    expect(parseHype(NOTE)).toMatchObject({ thesis: expect.stringContaining('Shíráz') });
    expect(parseHype(NOTE).questions).toHaveLength(5);
  });
  it('accepts thin-paragraph counts down to a single question', () => {
    expect(parseHype(NOTE3).questions).toHaveLength(3);
    expect(parseHype('{"questions":["a?","b?"],"thesis":"x"}').questions).toHaveLength(2);
    expect(parseHype('{"questions":["only one?"],"thesis":"x"}').questions).toHaveLength(1);
  });
  it('accepts dense-paragraph counts (20-40) and rails only at the 40 sanity ceiling', () => {
    const dense = JSON.stringify({ questions: Array.from({ length: 27 }, (_, i) => `q${i}?`), thesis: 'x' });
    expect(parseHype(dense).questions).toHaveLength(27);
    const runaway = JSON.stringify({ questions: Array.from({ length: 55 }, (_, i) => `q${i}?`), thesis: 'x' });
    expect(parseHype(runaway).questions).toHaveLength(40);
  });
  it('rejects an empty question array', () => {
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

  it('resume:false regenerates even already-done paragraphs (unconditional full redo)', async () => {
    const doneV1 = { ...para, id: 2, pid: 'p2', hyp: JSON.stringify(['a?', 'b?', 'c?', 'd?', 'e?']), hypThesis: 'done' };
    const { rag, store } = makeRag({ seed: { paras: { 9: [doneV1] }, coverage: { 9: 1 } }, llm: fakeLLM([{ content: NOTE }]) });
    const stats = await rag.retrieval.index(9, { resume: false });
    expect(stats.done).toBe(1);
    expect(store.hyped).toHaveLength(1);
    expect(store.hyped[0].version).toBe(HYPE_VERSION);
  });

  it('slices a long paragraph into bounded calls and merges (thesis from part 1, dedup, one save)', async () => {
    const sent = 'The Báb declared His mission in Shíráz before Mullá Ḥusayn on the evening of 23 May 1844. ';
    const long = { ...para, id: 7, pid: 'p7', text: sent.repeat(50).trim() };   // ~4,550 chars → sliced
    const replies = [
      { content: '{"questions":["Where did the Báb declare His mission?","Who witnessed the Declaration?"],"thesis":"The Báb declared His mission in Shíráz in 1844."}' },
      { content: '{"questions":["Who witnessed the Declaration?","When did the Bábí Dispensation begin?"],"thesis":""}' },
    ];
    const llm = fakeLLM(replies);
    const { rag, store } = makeRag({ seed: { paras: { 9: [long] }, coverage: { 9: 1 } }, llm });
    const stats = await rag.retrieval.index(9);
    expect(stats.done).toBe(1);
    expect(stats.sliced).toBe(1);
    expect(llm.calls.length).toBeGreaterThanOrEqual(2);                          // one bounded call per slice
    expect(llm.calls[1].messages.find((m) => m.role === 'user').content).toMatch(/FOCUS \(part 2\/\d+\)/);
    expect(store.hyped).toHaveLength(1);
    expect(store.hyped[0].thesis).toContain('Shíráz');                           // thesis from part 1
    expect(store.hyped[0].questions).toEqual([                                    // dedup across slices
      'Where did the Báb declare His mission?',
      'Who witnessed the Declaration?',
      'When did the Bábí Dispensation begin?',
    ]);
  });

  it('sliceParagraph: short stays whole; long splits on sentence bounds; no boundaries stays whole', () => {
    expect(sliceParagraph('short one.')).toHaveLength(1);
    expect(sliceParagraph('One sentence here. '.repeat(60).trim())).toHaveLength(1);      // ~1,140 chars: under threshold now
    const long = 'One sentence here. '.repeat(300).trim();                                // ~5,700 chars
    const slices = sliceParagraph(long);
    expect(slices.length).toBeGreaterThan(1);
    expect(slices.join(' ').length).toBeGreaterThanOrEqual(long.length - slices.length);  // nothing lost beyond joins
    expect(sliceParagraph('x'.repeat(4500))).toHaveLength(1);                             // no sentence bounds → one slice
  });

  it('upgrade: redoes old-version paragraphs, skips already-current ones (retries resume, no double-spend)', async () => {
    const v1 = { ...para, id: 2, pid: 'p2', hyp: JSON.stringify(['a?', 'b?', 'c?', 'd?', 'e?']), hypThesis: 'done' };                    // no hypModel → v1
    const current = { ...para, id: 5, pid: 'p5', hyp: JSON.stringify(['x?', 'y?']), hypThesis: 'done', hypModel: HYPE_VERSION };        // already upgraded
    const { rag, store } = makeRag({ seed: { paras: { 9: [v1, current] }, coverage: { 9: 1 } }, llm: fakeLLM([{ content: NOTE }]) });
    const stats = await rag.retrieval.index(9, { upgrade: true });
    expect(stats.done).toBe(1);                       // only the v1 paragraph regenerated
    expect(store.hyped).toHaveLength(1);
    expect(store.hyped[0].paragraphId).toBe(2);
  });
});

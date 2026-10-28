// retrieval.plan / settle — the host's batch seam: same prompt, cap enforcement, validated idempotent writes, retry bookkeeping.
import { describe, it, expect } from 'vitest';
import { HYPE_VERSION, BATCH_MAX_INPUT_TOKENS, BATCH_MAX_OUTPUT_TOKENS } from '../../api/lib/rag/enrich/retrieval.js';
import { makeRag } from './kit.js';

const TEXT = 'The soul of man is a sign of God, a heavenly gem whose reality the most learned of men hath failed to grasp. It is the first thing created.';
const para = (id, over = {}) => ({ id, pid: `p${id}`, pidx: id, text: TEXT, heading: 'Ch1', context: '', hypModel: null, ...over });
const seed = (paras, docs = { 1: { id: 1, title: 'The Test Book', author: 'A' } }) => ({ docs, paras: { 1: paras }, samples: { 1: TEXT } });
// distinct answer spans: two questions answered by the same words are one question (dedupeByAnswer)
const SPANS = ['a heavenly gem', 'the first thing created', 'a sign of God', 'the most learned of men'];
const reply = (qs, thesis = 'The soul is a sign of God.') => JSON.stringify({ seeker: [], questions: qs.map((q, i) => ({ q, a: SPANS[i] })), deep: [], thesis });

describe('retrieval.plan', () => {
  it('plans only paragraphs not yet at the current version, one shared system prompt', async () => {
    const { rag } = makeRag({ seed: seed([para(1), para(2, { hypModel: HYPE_VERSION }), para(3)]) });
    const p = await rag.retrieval.plan(1, {});
    expect(p.units.map((u) => u.id)).toEqual([1, 3]);
    expect(p.system).toMatch(/Hypothetical Prompt Embeddings/);
    expect(p.maxTokens).toBe(BATCH_MAX_OUTPUT_TOKENS);
    expect(p.units[0].parts).toHaveLength(1);
    expect(p.units[0].parts[0]).toContain(TEXT);
  });
  it('honours limit and the in-flight exclude set', async () => {
    const { rag } = makeRag({ seed: seed([para(1), para(2), para(3), para(4)]) });
    expect((await rag.retrieval.plan(1, { exclude: new Set([1, 2]), limit: 1 })).units.map((u) => u.id)).toEqual([3]);
  });
  it('splits a long paragraph into bounded parts instead of enlarging the request', async () => {
    const long = Array.from({ length: 400 }, (_, i) => `Sentence number ${i} says that the soul progresses.`).join(' ');
    const { rag } = makeRag({ seed: seed([para(1, { text: long })]) });
    const p = await rag.retrieval.plan(1, {});
    expect(p.units[0].parts.length).toBeGreaterThan(1);
    for (const u of p.units[0].parts) expect(Math.ceil((p.system.length + u.length) / 3.2)).toBeLessThanOrEqual(BATCH_MAX_INPUT_TOKENS);
  });
  it('hard-splits a paragraph with no sentence boundaries', async () => {
    const blob = Array.from({ length: 6000 }, (_, i) => `word${i}`).join(' ');   // ~50k chars, no terminators
    const { rag } = makeRag({ seed: seed([para(1, { text: blob })]) });
    const p = await rag.retrieval.plan(1, {});
    expect(p.skipped).toEqual([]);
    expect(p.units[0].parts.length).toBeGreaterThan(5);
    for (const u of p.units[0].parts) expect(Math.ceil((p.system.length + u.length) / 3.2)).toBeLessThanOrEqual(BATCH_MAX_INPUT_TOKENS);
  });
  it('skips (never sends) what cannot fit the cap, and says why', async () => {
    const { rag } = makeRag({ seed: seed([para(1), para(2)]) });
    const p = await rag.retrieval.plan(1, { maxInputTokens: 200 });   // smaller than the system prompt alone
    expect(p.units).toEqual([]);
    expect(p.skipped).toEqual([{ id: 1, reason: 'overCap' }, { id: 2, reason: 'overCap' }]);
  });
  it('cuts finer for ids whose earlier reply was truncated', async () => {
    const mid = Array.from({ length: 30 }, (_, i) => `Sentence ${i} is about the soul and its journey.`).join(' ');   // ~1.4k chars: one slice normally
    const { rag } = makeRag({ seed: seed([para(1, { text: mid })]) });
    expect((await rag.retrieval.plan(1, {})).units[0].parts).toHaveLength(1);
    expect((await rag.retrieval.plan(1, { split: new Set([1]) })).units[0].parts.length).toBeGreaterThan(1);
  });
  it('is gated: an undisambiguated history book is refused unless noDisambig', async () => {
    const { rag } = makeRag({ seed: { ...seed([para(1)]), coverage: { 1: 0 } } });
    await expect(rag.retrieval.plan(1, {})).rejects.toThrow();
    expect((await rag.retrieval.plan(1, { noDisambig: true })).units).toHaveLength(1);
  });
});

describe('retrieval.settle', () => {
  it('writes validated questions with the current version stamp', async () => {
    const { rag, store } = makeRag({ seed: seed([para(1)]) });
    const r = await rag.retrieval.settle(1, [{ id: 1, replies: [reply(['What is the soul?', 'How was the soul created?'])] }]);
    expect(r.written).toBe(1);
    expect(store.hyped).toEqual([{ paragraphId: 1, questions: ['What is the soul?', 'How was the soul created?'], thesis: 'The soul is a sign of God.', version: HYPE_VERSION }]);
  });
  it('holds batch replies to the live gates (yes/no, self-reference, answer not in the passage)', async () => {
    const { rag, store } = makeRag({ seed: seed([para(1)]) });
    const bad = JSON.stringify({ seeker: [], questions: [
      { q: 'Is the soul a gem?', a: 'a heavenly gem' }, { q: 'What does this passage say about the soul?', a: 'a heavenly gem' },
      { q: 'What is the moon made of?', a: 'cheese and dust' }, { q: 'What is the soul called?', a: 'the first thing created' }], deep: [], thesis: 't' });
    const r = await rag.retrieval.settle(1, [{ id: 1, replies: [bad] }]);
    expect(r.written).toBe(1);
    expect(store.hyped[0].questions).toEqual(['What is the soul called?']);
  });
  it('is idempotent: a paragraph already at the current version is left alone', async () => {
    const { rag, store } = makeRag({ seed: seed([para(1, { hypModel: HYPE_VERSION })]) });
    const r = await rag.retrieval.settle(1, [{ id: 1, replies: [reply(['What is the soul?'])] }]);
    expect(r).toMatchObject({ written: 0, alreadyDone: 1 });
    expect(store.hyped).toEqual([]);
  });
  it('returns unparseable and missing replies as failed without stamping them', async () => {
    const { rag, store } = makeRag({ seed: seed([para(1), para(2)]) });
    const r = await rag.retrieval.settle(1, [{ id: 1, replies: ['{"questions":[{"q":"cut off'] }, { id: 2, replies: [null] }]);
    expect(r.failed).toEqual([1, 2]);
    expect(store.hyped).toEqual([]);
  });
  it('stamps a paragraph empty only when the host says its retry budget is spent', async () => {
    const { rag, store } = makeRag({ seed: seed([para(1)]) });
    const r = await rag.retrieval.settle(1, [{ id: 1, replies: [null] }], { exhaust: new Set([1]) });
    expect(r.exhausted).toBe(1);
    expect(store.hyped).toEqual([{ paragraphId: 1, questions: [], thesis: '', version: HYPE_VERSION }]);
  });
  it('combines the replies of a sliced paragraph (thesis from part 1, duplicates dropped)', async () => {
    const { rag, store } = makeRag({ seed: seed([para(1)]) });
    const r = await rag.retrieval.settle(1, [{ id: 1, replies: [reply(['What is the soul?']), reply(['What is the soul?', 'How was it made?'], '')] }]);
    expect(r.written).toBe(1);
    expect(store.hyped[0].questions).toEqual(['What is the soul?', 'How was it made?']);
  });
});

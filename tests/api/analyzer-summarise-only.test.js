// Planned retrieval decides the ORDER; the LLM only summarises (Chad: 1–2 LLM calls per search, classification
// does the rest). preserveOrder: no re-sort, no dropping <40, nothing lost if the model skips a passage.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chat = vi.fn();
vi.mock('../../api/lib/ai-services.js', () => ({ aiService: () => ({ chat }) }));
vi.mock('../../api/lib/search.js', () => ({ enrichHitsWithExcerpts: (p) => p }));
vi.mock('../../api/lib/logger.js', () => ({ logger: { info: () => {}, warn: () => {}, debug: () => {} } }));

const { analyzePassagesParallel } = await import('../../api/lib/parallel-analyzer.js');
const passages = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, text: `passage ${i + 1} text`, authority: 5 }));

beforeEach(() => {
  chat.mockReset();
  // The model scores the LAST passages highest, drops one, and rates one below 40.
  chat.mockImplementation(async (msgs) => {
    const idx = [...msgs[1].content.matchAll(/\[(\d+)\]/g)].map((m) => +m[1]);
    const results = idx.filter((g) => g !== 3).map((g) => ({ globalIndex: g, score: g === 5 ? 10 : 50 + g, summary: `s${g}`, keyPhrase: '', coreTerms: [] }));
    return { content: JSON.stringify({ results }) };
  });
});

describe('analyzePassagesParallel preserveOrder', () => {
  it('keeps retrieval order, drops nothing, and fills a passage the model skipped', async () => {
    const r = await analyzePassagesParallel('q', passages, { preserveOrder: true, maxCalls: 2, introduction: false });
    expect(r.results.map((x) => x.id)).toEqual(passages.map((p) => p.id));
    expect(r.results.find((x) => x.id === 4).summary).toBe('');   // globalIndex 3 was skipped by the model
  });

  it('makes at most maxCalls LLM calls and no introduction call', async () => {
    await analyzePassagesParallel('q', passages, { preserveOrder: true, maxCalls: 2, introduction: false });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('default mode is unchanged: sorted by score and <40 dropped', async () => {
    const r = await analyzePassagesParallel('q', passages, { batchSize: 3, introduction: false });
    expect(r.results.some((x) => x.id === 6)).toBe(false);   // globalIndex 5 scored 10
  });
});

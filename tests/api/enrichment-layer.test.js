/**
 * Enrichment Layer Tests — TDD RED phase
 *
 * Tests cover: deterministic prompt builder, window sizer, enrichment runner.
 * All tests must FAIL — no implementation files exist yet.
 */

import { describe, it, expect } from 'vitest';

// ==========================================================================
// Shared fixtures
// ==========================================================================

const doc = {
  title: 'Kitáb-i-Íqán',
  author: "Bahá'u'lláh",
  religion: "Baha'i",
  collection: 'Core',
  year: 1861,
  language: 'en',
  description: 'Book of Certitude'
};

const paragraphs = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  paragraph_index: i,
  text: `Paragraph ${i} text.`
}));

const objects = [
  {
    people: [{ name: 'The Báb' }],
    concepts: [{ term: 'progressive revelation' }],
    relations: []
  }
];

// ==========================================================================
// Enrichment Prompts
// ==========================================================================

describe('Enrichment Prompts', () => {
  it('buildInstructionsBlock() returns { text, hash } — text contains disambiguation + HyPE instructions', async () => {
    const { buildInstructionsBlock } = await import('../../api/lib/enrichment-prompts.js');
    const result = buildInstructionsBlock();
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('hash');
    expect(typeof result.text).toBe('string');
    expect(result.text.toLowerCase()).toMatch(/disambigu/);
    expect(result.text.toLowerCase()).toMatch(/hype/);
  });

  it('buildInstructionsBlock() is deterministic — same output on every call', async () => {
    const { buildInstructionsBlock } = await import('../../api/lib/enrichment-prompts.js');
    const a = buildInstructionsBlock();
    const b = buildInstructionsBlock();
    expect(a.text).toBe(b.text);
    expect(a.hash).toBe(b.hash);
  });

  it('buildBookMetaBlock(doc) returns { text, hash } — contains title, author, religion, collection, year', async () => {
    const { buildBookMetaBlock } = await import('../../api/lib/enrichment-prompts.js');
    const result = buildBookMetaBlock(doc);
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('hash');
    expect(result.text).toContain(doc.title);
    expect(result.text).toContain(doc.author);
    expect(result.text).toContain(doc.religion);
    expect(result.text).toContain(doc.collection);
    expect(result.text).toContain(String(doc.year));
  });

  it('buildBookMetaBlock uses fixed field order (title|author|religion|collection|year|language|description)', async () => {
    const { buildBookMetaBlock } = await import('../../api/lib/enrichment-prompts.js');
    const result = buildBookMetaBlock(doc);
    const titleIdx = result.text.indexOf(doc.title);
    const authorIdx = result.text.indexOf(doc.author);
    const religionIdx = result.text.indexOf(doc.religion);
    const collectionIdx = result.text.indexOf(doc.collection);
    const yearIdx = result.text.indexOf(String(doc.year));
    const langIdx = result.text.indexOf(doc.language);
    const descIdx = result.text.indexOf(doc.description);
    expect(titleIdx).toBeLessThan(authorIdx);
    expect(authorIdx).toBeLessThan(religionIdx);
    expect(religionIdx).toBeLessThan(collectionIdx);
    expect(collectionIdx).toBeLessThan(yearIdx);
    expect(yearIdx).toBeLessThan(langIdx);
    expect(langIdx).toBeLessThan(descIdx);
  });

  it('buildBookMetaBlock is deterministic — same doc → same hash', async () => {
    const { buildBookMetaBlock } = await import('../../api/lib/enrichment-prompts.js');
    const a = buildBookMetaBlock(doc);
    const b = buildBookMetaBlock({ ...doc });
    expect(a.hash).toBe(b.hash);
    expect(a.text).toBe(b.text);
  });

  it('buildWindowBlock(paragraphs) returns { text, hash } — serializes paragraphs with [P1], [P2] labels', async () => {
    const { buildWindowBlock } = await import('../../api/lib/enrichment-prompts.js');
    const result = buildWindowBlock(paragraphs);
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('hash');
    expect(result.text).toContain('[P1]');
    expect(result.text).toContain('[P2]');
    expect(result.text).toContain('Paragraph 0 text.');
  });

  it('buildWindowBlock is deterministic — same paragraphs → same hash', async () => {
    const { buildWindowBlock } = await import('../../api/lib/enrichment-prompts.js');
    const a = buildWindowBlock(paragraphs);
    const b = buildWindowBlock([...paragraphs]);
    expect(a.hash).toBe(b.hash);
    expect(a.text).toBe(b.text);
  });

  it('buildObjectsBlock(objects) returns { text, hash } — serializes entity data', async () => {
    const { buildObjectsBlock } = await import('../../api/lib/enrichment-prompts.js');
    const result = buildObjectsBlock(objects);
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('hash');
    expect(typeof result.text).toBe('string');
    expect(result.text).toContain('The Báb');
    expect(result.text).toContain('progressive revelation');
  });

  it('buildObjectsBlock uses sorted keys for deterministic output', async () => {
    const { buildObjectsBlock } = await import('../../api/lib/enrichment-prompts.js');
    const objA = [{ z_field: 'z', a_field: 'a' }];
    const objB = [{ a_field: 'a', z_field: 'z' }];
    const a = buildObjectsBlock(objA);
    const b = buildObjectsBlock(objB);
    expect(a.hash).toBe(b.hash);
  });

  it('buildTargetBlock("context", 15) returns { text } like "DISAMBIGUATE [P15]"', async () => {
    const { buildTargetBlock } = await import('../../api/lib/enrichment-prompts.js');
    const result = buildTargetBlock('context', 15);
    expect(result).toHaveProperty('text');
    expect(result.text).toMatch(/DISAMBIGUATE/i);
    expect(result.text).toContain('[P15]');
  });

  it('buildTargetBlock("hype", 15) returns { text } like "HYPE [P15]"', async () => {
    const { buildTargetBlock } = await import('../../api/lib/enrichment-prompts.js');
    const result = buildTargetBlock('hype', 15);
    expect(result).toHaveProperty('text');
    expect(result.text).toMatch(/HYPE/i);
    expect(result.text).toContain('[P15]');
  });

  it('two calls with identical inputs produce identical hashes (byte-identical for vLLM prefix caching)', async () => {
    const { buildBookMetaBlock, buildWindowBlock, buildObjectsBlock } = await import('../../api/lib/enrichment-prompts.js');
    const meta1 = buildBookMetaBlock(doc);
    const meta2 = buildBookMetaBlock(doc);
    const win1 = buildWindowBlock(paragraphs);
    const win2 = buildWindowBlock(paragraphs);
    const obj1 = buildObjectsBlock(objects);
    const obj2 = buildObjectsBlock(objects);
    expect(meta1.hash).toBe(meta2.hash);
    expect(win1.hash).toBe(win2.hash);
    expect(obj1.hash).toBe(obj2.hash);
  });
});

// ==========================================================================
// Window Sizer
// ==========================================================================

describe('Window Sizer', () => {
  it('computeWindowN returns { N, twoN, tokensPerUnit, usable } with N > 0', async () => {
    const { computeWindowN } = await import('../../api/lib/window-sizer.js');
    const result = computeWindowN({
      kvBudgetTokens: 32768,
      avgParagraphTokens: 200,
      avgObjectTokensPerPara: 50,
      budgetFraction: 0.5,
      reservedParallelRequests: 1,
      max_window_tokens_hard_limit: 8192
    });
    expect(result).toHaveProperty('N');
    expect(result).toHaveProperty('twoN');
    expect(result).toHaveProperty('tokensPerUnit');
    expect(result).toHaveProperty('usable');
    expect(result.N).toBeGreaterThan(0);
  });

  it('N is conservative — usable tokens divided by tokensPerUnit, halved', async () => {
    const { computeWindowN } = await import('../../api/lib/window-sizer.js');
    const result = computeWindowN({
      kvBudgetTokens: 32768,
      avgParagraphTokens: 200,
      avgObjectTokensPerPara: 50,
      budgetFraction: 0.5,
      reservedParallelRequests: 1,
      max_window_tokens_hard_limit: 99999
    });
    const expectedTwoN = Math.floor(result.usable / result.tokensPerUnit);
    expect(result.twoN).toBeLessThanOrEqual(expectedTwoN);
    expect(result.N).toBe(Math.floor(result.twoN / 2));
  });

  it('hard limit respected: max_window_tokens_hard_limit caps 2N', async () => {
    const { computeWindowN } = await import('../../api/lib/window-sizer.js');
    const hardLimit = 800;
    const avgParagraphTokens = 100;
    const result = computeWindowN({
      kvBudgetTokens: 1000000,
      avgParagraphTokens,
      avgObjectTokensPerPara: 30,
      budgetFraction: 0.9,
      reservedParallelRequests: 1,
      max_window_tokens_hard_limit: hardLimit
    });
    const maxParagraphsFromHardLimit = Math.floor(hardLimit / avgParagraphTokens);
    expect(result.twoN).toBeLessThanOrEqual(maxParagraphsFromHardLimit);
  });

  it('with very small budget → N equals minimum (e.g., 3)', async () => {
    const { computeWindowN } = await import('../../api/lib/window-sizer.js');
    const result = computeWindowN({
      kvBudgetTokens: 500,
      avgParagraphTokens: 200,
      avgObjectTokensPerPara: 50,
      budgetFraction: 0.5,
      reservedParallelRequests: 1,
      max_window_tokens_hard_limit: 8192
    });
    expect(result.N).toBeGreaterThanOrEqual(1);
    expect(result.N).toBeLessThanOrEqual(5);
  });

  it('with large budget → N capped by hard limit', async () => {
    const { computeWindowN } = await import('../../api/lib/window-sizer.js');
    const result = computeWindowN({
      kvBudgetTokens: 10000000,
      avgParagraphTokens: 100,
      avgObjectTokensPerPara: 25,
      budgetFraction: 0.9,
      reservedParallelRequests: 1,
      max_window_tokens_hard_limit: 2000
    });
    const maxFromHardLimit = Math.floor(2000 / 100);
    expect(result.twoN).toBeLessThanOrEqual(maxFromHardLimit);
  });

  it('budgetFraction (0.5 default) correctly reduces usable tokens', async () => {
    const { computeWindowN } = await import('../../api/lib/window-sizer.js');
    const base = computeWindowN({
      kvBudgetTokens: 32768,
      avgParagraphTokens: 200,
      avgObjectTokensPerPara: 50,
      budgetFraction: 1.0,
      reservedParallelRequests: 1,
      max_window_tokens_hard_limit: 99999
    });
    const halved = computeWindowN({
      kvBudgetTokens: 32768,
      avgParagraphTokens: 200,
      avgObjectTokensPerPara: 50,
      budgetFraction: 0.5,
      reservedParallelRequests: 1,
      max_window_tokens_hard_limit: 99999
    });
    expect(halved.usable).toBeLessThan(base.usable);
    expect(halved.N).toBeLessThanOrEqual(base.N);
  });

  it('reservedParallelRequests reduces available budget proportionally', async () => {
    const { computeWindowN } = await import('../../api/lib/window-sizer.js');
    const single = computeWindowN({
      kvBudgetTokens: 32768,
      avgParagraphTokens: 200,
      avgObjectTokensPerPara: 50,
      budgetFraction: 0.5,
      reservedParallelRequests: 1,
      max_window_tokens_hard_limit: 99999
    });
    const parallel = computeWindowN({
      kvBudgetTokens: 32768,
      avgParagraphTokens: 200,
      avgObjectTokensPerPara: 50,
      budgetFraction: 0.5,
      reservedParallelRequests: 4,
      max_window_tokens_hard_limit: 99999
    });
    expect(parallel.usable).toBeLessThan(single.usable);
    expect(parallel.N).toBeLessThanOrEqual(single.N);
  });
});

// ==========================================================================
// Enrichment Runner
// ==========================================================================

describe('Enrichment Runner', () => {
  const cacheKeyInput = {
    instructionsHash: 'abc123',
    bookMetaHash: 'def456',
    windowHash: 'ghi789',
    objectsHash: 'jkl012',
    taskMode: 'context',
    targetParagraphId: 42,
    pipelineVersion: '1.0.0'
  };

  it('computeArtifactCacheKey returns a deterministic string key', async () => {
    const { computeArtifactCacheKey } = await import('../../api/lib/enrichment-runner.js');
    const key = computeArtifactCacheKey(cacheKeyInput);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('same inputs → same cache key', async () => {
    const { computeArtifactCacheKey } = await import('../../api/lib/enrichment-runner.js');
    const key1 = computeArtifactCacheKey(cacheKeyInput);
    const key2 = computeArtifactCacheKey({ ...cacheKeyInput });
    expect(key1).toBe(key2);
  });

  it('different taskMode → different cache key', async () => {
    const { computeArtifactCacheKey } = await import('../../api/lib/enrichment-runner.js');
    const key1 = computeArtifactCacheKey({ ...cacheKeyInput, taskMode: 'context' });
    const key2 = computeArtifactCacheKey({ ...cacheKeyInput, taskMode: 'hype' });
    expect(key1).not.toBe(key2);
  });

  it('different targetParagraphId → different cache key', async () => {
    const { computeArtifactCacheKey } = await import('../../api/lib/enrichment-runner.js');
    const key1 = computeArtifactCacheKey({ ...cacheKeyInput, targetParagraphId: 42 });
    const key2 = computeArtifactCacheKey({ ...cacheKeyInput, targetParagraphId: 99 });
    expect(key1).not.toBe(key2);
  });

  it('isArtifactCached returns true if content_enrichment has matching entry', async () => {
    const { isArtifactCached } = await import('../../api/lib/enrichment-runner.js');
    const fakeDb = {
      prepare: () => ({
        get: () => ({ cache_key: 'test-key', result: '{}' })
      })
    };
    const result = isArtifactCached('test-key', fakeDb);
    expect(result).toBe(true);
  });

  it('isArtifactCached returns false for missing entry', async () => {
    const { isArtifactCached } = await import('../../api/lib/enrichment-runner.js');
    const fakeDb = {
      prepare: () => ({
        get: () => null
      })
    };
    const result = isArtifactCached('missing-key', fakeDb);
    expect(result).toBe(false);
  });

  it('buildSlidingWindows(paragraphs, N) returns array of windows each with 2N paragraphs', async () => {
    const { buildSlidingWindows } = await import('../../api/lib/enrichment-runner.js');
    const N = 3;
    const paras = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, paragraph_index: i, text: `P${i}` }));
    const windows = buildSlidingWindows(paras, N);
    expect(Array.isArray(windows)).toBe(true);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].paragraphs.length).toBe(2 * N);
  });

  it('windows overlap by N paragraphs (second window starts at paragraph N)', async () => {
    const { buildSlidingWindows } = await import('../../api/lib/enrichment-runner.js');
    const N = 3;
    const paras = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, paragraph_index: i, text: `P${i}` }));
    const windows = buildSlidingWindows(paras, N);
    expect(windows.length).toBeGreaterThanOrEqual(2);
    const firstWindowLastN = windows[0].paragraphs.slice(N);
    const secondWindowFirstN = windows[1].paragraphs.slice(0, N);
    expect(firstWindowLastN.map(p => p.id)).toEqual(secondWindowFirstN.map(p => p.id));
  });

  it('last window may be smaller than 2N', async () => {
    const { buildSlidingWindows } = await import('../../api/lib/enrichment-runner.js');
    const N = 4;
    const paras = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, paragraph_index: i, text: `P${i}` }));
    const windows = buildSlidingWindows(paras, N);
    const last = windows[windows.length - 1];
    expect(last.paragraphs.length).toBeLessThanOrEqual(2 * N);
  });

  it('each window target range is the back half [N+1..2N]', async () => {
    const { buildSlidingWindows } = await import('../../api/lib/enrichment-runner.js');
    const N = 3;
    const paras = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, paragraph_index: i, text: `P${i}` }));
    const windows = buildSlidingWindows(paras, N);
    const win = windows[0];
    expect(win).toHaveProperty('targetParagraphs');
    const targetIds = win.targetParagraphs.map(p => p.id);
    const backHalfIds = win.paragraphs.slice(N).map(p => p.id);
    expect(targetIds).toEqual(backHalfIds);
  });
});

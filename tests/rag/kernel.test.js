// kernel — routing, escalation ladder, factory. Pure logic on fake ports (kit). No DB, no network.
import { describe, it, expect } from 'vitest';
import { makeModelEngine } from '../../api/lib/rag/kernel/model.js';
import { createCorpusRAG } from '../../api/lib/rag/index.js';
import { fakeLLM, fakeCatalog, memStore, fakeProfiler, makeRag, parseIdea } from './kit.js';

const engine = (llm) => makeModelEngine({ llm, catalog: fakeCatalog() });

describe('kernel/model — routing', () => {
  it('resolves provider from the catalog; local routes transparently; unknown throws', () => {
    const e = engine(fakeLLM([]));
    expect(e.resolveProvider('flash')).toBe('deepseek');
    expect(e.resolveProvider('local1')).toBe('ollama');
    expect(() => e.resolveProvider('nope')).toThrow(/not in the catalog/);
  });

  it('passes thinking intent only for reasoning-capable models', async () => {
    const run = async (model) => {
      const llm = fakeLLM([{ content: '{"idea":"x"}', finishReason: 'stop' }]);
      await engine(llm).runLadder({ route: { model, fallback: model }, system: 's', user: 'u', parse: parseIdea, maxTokens: 400 });
      return llm.calls[0].opts.thinking;
    };
    expect(await run('pro')).toBe(true);
    expect(await run('flash')).toBeFalsy();
  });
});

describe('kernel/model — escalation ladder', () => {
  it('returns the primary on first success, no escalation', async () => {
    const llm = fakeLLM([{ content: '{"idea":"ok"}', finishReason: 'stop' }]);
    const r = await engine(llm).runLadder({ route: { model: 'flash', fallback: 'haiku' }, system: 's', user: 'u', parse: parseIdea, maxTokens: 400 });
    expect(r).toMatchObject({ parsed: { idea: 'ok' }, escalated: false });
    expect(llm.calls).toHaveLength(1);
  });

  it('escalates to the fallback and self-heals when the primary keeps failing', async () => {
    // Respond by model: flash always garbage, haiku valid.
    const llm = fakeLLM((opts) => ({ content: opts.model === 'haiku' ? '{"idea":"healed"}' : 'garbage', finishReason: 'stop' }));
    const r = await engine(llm).runLadder({ route: { model: 'flash', fallback: 'haiku' }, system: 's', user: 'u', parse: parseIdea, maxTokens: 400 });
    expect(r).toMatchObject({ parsed: { idea: 'healed' }, escalated: true });
    expect(llm.calls).toHaveLength(4);                     // 3 primary tries + 1 fallback
    expect(llm.calls.at(-1).opts.model).toBe('haiku');
  });
});

describe('createCorpusRAG — factory', () => {
  it('fails fast on a missing required port', () => {
    expect(() => createCorpusRAG({})).toThrow(/missing required port 'llm'/);
    expect(() => createCorpusRAG({ llm: fakeLLM([]), models: fakeCatalog(), store: memStore() })).toThrow(/'profiler'/);
  });

  it('resolves a document profile through injected store + profiler (no db)', async () => {
    const { rag } = makeRag({ seed: { docs: { 1: { id: 1, lang: 'en' } } }, profile: { genre: 'history' } });
    const p = await rag.profile(1);
    expect(p).toMatchObject({ lang: 'en', genre: 'history', models: { disambig: 'flash' } });
  });
});

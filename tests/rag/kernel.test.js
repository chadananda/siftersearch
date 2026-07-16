// kernel — routing, escalation ladder, factory. Pure logic on fake ports (kit). No DB, no network.
import { describe, it, expect } from 'vitest';
import { makeModelEngine } from '../../api/lib/rag/kernel/model.js';
import { createCorpusRAG } from '../../api/lib/rag/index.js';
import { pool } from '../../api/lib/rag/kernel/run.js';
import { fakeLLM, fakeCatalog, memStore, fakeProfiler, makeRag, parseIdea } from './kit.js';

const engine = (llm) => makeModelEngine({ llm, catalog: fakeCatalog() });

describe('kernel/run — pool progress reporting', () => {
  it('reports (done,total) after each item settles, monotonically, ending at total', async () => {
    const items = [1, 2, 3, 4, 5];
    const seen = [];
    const out = await pool(2, items, async (x) => x * 10, (done, total) => seen.push([done, total]));
    expect(out).toEqual([10, 20, 30, 40, 50]);          // results in input order, concurrency respected
    expect(seen.length).toBe(5);                         // one report per item
    expect(seen.map((s) => s[0])).toEqual([1, 2, 3, 4, 5]); // done counts monotonically 1..N
    expect(seen.every((s) => s[1] === 5)).toBe(true);    // total is the known job size throughout
  });

  it('is a no-op without a callback (back-compatible) and handles empty input', async () => {
    expect(await pool(3, [], async (x) => x)).toEqual([]);
    expect(await pool(3, [7, 8], async (x) => x + 1)).toEqual([8, 9]); // no onProgress → still works
  });

  // A transient per-item failure is bad luck on ONE item; a book has thousands, so it must not end the stage.
  it('drops a transient per-item failure to null and keeps processing the rest', async () => {
    const out = await pool(2, [1, 2, 3], async (x) => { if (x === 2) throw new Error('timeout'); return x * 10; });
    expect(out).toEqual([10, null, 30]);
  });

  // …but an out-of-credits/bad-key error kills EVERY later call. Swallowing it = a stage that reports success
  // having written a fraction of the book (exactly how a Sonnet run silently wrote 26% of a doc). Fail loudly.
  it('re-throws a FATAL error instead of swallowing it into silent no-op churn', async () => {
    const fatal = Object.assign(new Error('credit balance too low'), { fatal: true });
    let attempted = 0;
    await expect(pool(1, [1, 2, 3], async () => { attempted++; throw fatal; })).rejects.toThrow('credit balance');
    expect(attempted).toBe(1); // aborted at the first fatal — did not churn through the remaining items
  });
});

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

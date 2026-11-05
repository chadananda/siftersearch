// Hedged query embed: a slow call gets a twin; first good answer wins, the loser is aborted; failures propagate.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { hedge } from '../../api/lib/search/qdrant-layers.js';

const later = (ms, v, signal, fail) => new Promise((res, rej) => {
  const t = setTimeout(() => (fail ? rej(new Error(v)) : res(v)), ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); });
});
const stats = () => ({ calls: 0, hedged: 0, twinWon: 0 });

describe('hedge', () => {
  afterEach(() => vi.useRealTimers());

  it('a fast call never starts a twin', async () => {
    const s = stats(), start = vi.fn((sig) => later(10, 'a', sig));
    expect(await hedge(start, 100, s)).toBe('a');
    expect(start).toHaveBeenCalledTimes(1);
    expect(s).toEqual({ calls: 1, hedged: 0, twinWon: 0 });
  });

  it('a slow call gets a twin; the twin wins and the slow one is aborted', async () => {
    const s = stats(), signals = [];
    const start = (sig) => { signals.push(sig); return later(signals.length === 1 ? 500 : 10, signals.length === 1 ? 'slow' : 'twin', sig); };
    expect(await hedge(start, 30, s)).toBe('twin');
    expect(signals[0].aborted).toBe(true);
    expect(s).toEqual({ calls: 1, hedged: 1, twinWon: 1 });
  });

  it('the first call can still win after the twin starts', async () => {
    const s = stats(), signals = [];
    const start = (sig) => { signals.push(sig); return later(signals.length === 1 ? 50 : 500, signals.length === 1 ? 'first' : 'twin', sig); };
    expect(await hedge(start, 30, s)).toBe('first');
    expect(signals[1].aborted).toBe(true);
    expect(s.twinWon).toBe(0);
  });

  it('one failed attempt does not fail the call while the other may still answer', async () => {
    let n = 0;
    const start = (sig) => (++n === 1 ? later(40, 'boom', sig, true) : later(30, 'twin', sig));
    expect(await hedge(start, 20, stats())).toBe('twin');
  });

  it('a failure before the twin is due is final; both failing rejects', async () => {
    const one = vi.fn((sig) => later(5, 'boom', sig, true));
    await expect(hedge(one, 100, stats())).rejects.toThrow('boom');
    expect(one).toHaveBeenCalledTimes(1);
    let n = 0;
    await expect(hedge((sig) => later(++n === 1 ? 40 : 30, `e${n}`, sig, true), 20, stats())).rejects.toThrow(/e[12]/);
  });

  it('ms 0 turns hedging off', async () => {
    const s = stats(), start = vi.fn((sig) => later(40, 'a', sig));
    expect(await hedge(start, 0, s)).toBe('a');
    expect(start).toHaveBeenCalledTimes(1);
    expect(s.hedged).toBe(0);
  });
});

// The edge's R2 cache of tower library lookups (worker/anis/index.js remoteImpl): tower once, then the edge; empty answers never cached.
import { describe, it, expect } from 'vitest';
import { remoteImpl, toolKey } from '../../worker/anis/index.js';

const r2 = () => { const m = new Map(); return { m, async get(k) { const v = m.get(k); return v && { text: async () => v.text, customMetadata: v.meta }; }, async put(k, text, o) { m.set(k, { text, meta: o?.customMetadata }); } }; };
const towerFake = (out) => { const calls = []; return { calls, fetchFn: async (url, o) => { calls.push(url); return new Response(JSON.stringify({ out: typeof out === 'function' ? out(calls.length) : out })); } }; };
const env = (c) => ({ TOWER_URL: 'https://t', TOWER_KEY: 'k', ANIS_CACHE: c });

describe('anis edge tool cache', () => {
  it('a book lookup reaches tower once; the second is served from R2', async () => {
    const c = r2(), t = towerFake({ book: { id: 1, title: 'The Kitáb-i-Íqán' } });
    const a = remoteImpl(env(c), { turn: {}, local: {}, fetchFn: t.fetchFn });
    expect((await a.impl.bookCard({ title: 'Iqan' })).book.id).toBe(1);
    const b = remoteImpl(env(c), { turn: {}, local: {}, fetchFn: t.fetchFn });
    expect((await b.impl.bookCard({ title: 'Iqan' })).book.title).toBe('The Kitáb-i-Íqán');
    expect(t.calls.length).toBe(1);
    expect(b.stat.cached).toBe(1);
    expect(c.m.has(await toolKey('bookCard', [{ title: 'Iqan' }]))).toBe(true);
  });
  it('an empty answer is not cached, and uncached tools (usage log, web) always go to tower', async () => {
    const c = r2(), t = towerFake(null);
    const a = remoteImpl(env(c), { turn: {}, local: {}, fetchFn: t.fetchFn });
    await a.impl.bookCard({ title: 'Nothing' }); await a.impl.bookCard({ title: 'Nothing' });
    await a.impl.logUsage({}); await a.impl.logUsage({});
    expect(t.calls.length).toBe(4);
    expect(c.m.size).toBe(0);
  });
  it('a sourceOf copy stored before passages carried their roles is never served (11-14 replay: holders, citing works, no card)', async () => {
    const c = r2();
    const args = ['Let your vision be world-embracing'];
    const legacy = (await toolKey('sourceOf', args)).replace('sourceOf@roles', 'sourceOf');
    await c.put(legacy, JSON.stringify({ out: [{ id: 1, title: 'Bahá’í Sacred Writings' }] }), { customMetadata: { at: String(Date.now()) } });
    const t = towerFake([{ id: 2, title: 'Gleanings', role: 'source' }]);
    const a = remoteImpl(env(c), { turn: {}, local: {}, fetchFn: t.fetchFn });
    expect((await a.impl.sourceOf(...args))[0].role).toBe('source');
    expect(t.calls.length).toBe(1);
    expect(legacy).not.toBe(await toolKey('sourceOf', args));
  });
});

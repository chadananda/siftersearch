// pipeline/hype-batch — chunking, persisted state + restart resume, in-flight exclusion, retry/exhaust, budget + spend gates. Fake rag + transport.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHypeBatch, hypeMode, MAX_ATTEMPTS } from '../../api/lib/pipeline/hype-batch.js';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hype-batch-')); });

// A fake library: docs → paragraph ids; plan honours exclude/limit; settle records outcomes and fails what the script says.
function fakeRag({ docs = { 1: [1, 2, 3, 4, 5] }, gated = [], failIds = new Set(), plansSeen = [] } = {}) {
  const done = new Set(), settled = [];
  return { done, settled, plansSeen, retrieval: {
    plan: async (docId, o) => {
      plansSeen.push({ docId, exclude: [...(o.exclude || [])], split: [...(o.split || [])] });
      if (gated.includes(docId)) throw new Error('not disambiguated');
      const ids = (docs[docId] || []).filter((i) => !done.has(i) && !o.exclude?.has(i)).slice(0, o.limit ?? Infinity);
      return { system: 'SYS', model: 'claude-haiku-5-5', maxTokens: 4096, skipped: [], units: ids.map((id) => ({ id, pid: `p${id}`, parts: [`u${id}`] })), docId };
    },
    settle: async (docId, outcomes, o) => {
      settled.push({ docId, outcomes, exhaust: [...(o.exhaust || [])] });
      const r = { written: 0, failed: [], exhausted: 0, alreadyDone: 0 };
      for (const out of outcomes) {
        if (done.has(out.id)) { r.alreadyDone++; continue; }
        if (out.replies[0] && !failIds.has(out.id)) { done.add(out.id); r.written++; }
        else if (o.exhaust?.has(out.id)) { done.add(out.id); r.exhausted++; } else r.failed.push(out.id);
      }
      return r;
    } } };
}
// A fake provider: every batch ends immediately unless held; replies echo the request.
function fakeTransport({ hold = false, truncate = new Set() } = {}) {
  const created = []; let n = 0;
  return { created, hold: (v) => { hold = v; },
    create: async (requests, { model }) => { const id = `b${++n}`; created.push({ id, requests, model }); return id; },
    status: async (id) => ({ ended: !hold && created.some((b) => b.id === id) }),
    async *results(id) { for (const r of created.find((b) => b.id === id).requests) { const idn = Number(r.custom_id.match(/_p(\d+)_/)[1]);
      yield { custom_id: r.custom_id, ok: true, text: `{"r":${idn}}`, stopReason: truncate.has(idn) ? 'max_tokens' : 'end_turn', usage: { input: 10, output: 20, cacheRead: 5, cacheWrite: 0 } }; } } };
}
const make = (rag, transport, extra = {}) => createHypeBatch({ rag, transport, dir, sleep: async () => {}, ...extra });

describe('hypeMode', () => {
  it('defaults to batch; HYPE_MODE=sync keeps the live path', () => {
    expect(hypeMode({})).toBe('batch');
    expect(hypeMode({ HYPE_MODE: 'batch' })).toBe('batch');
    expect(hypeMode({ HYPE_MODE: 'sync' })).toBe('sync');
  });
});

describe('submit', () => {
  it('chunks requests under the per-batch ceiling and persists the jobs', async () => {
    const t = fakeTransport(), rag = fakeRag({ docs: { 1: [1, 2, 3, 4, 5, 6, 7] } });
    const out = await make(rag, t, { maxRequests: 3 }).submit([1]);
    expect(out.batches).toHaveLength(3);
    expect(t.created.map((b) => b.requests.length)).toEqual([3, 3, 1]);
    expect(t.created[0].requests[0]).toMatchObject({ custom_id: 'd1_p1_s0', system: 'SYS', user: 'u1', maxTokens: 4096 });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).batches).toHaveProperty('b1');
  });
  it('also chunks by bytes', async () => {
    const t = fakeTransport();
    await make(fakeRag(), t, { maxBytes: 1200 }).submit([1]);
    expect(t.created.length).toBeGreaterThan(1);
  });
  it('never sends a paragraph twice: in-flight ids are excluded from the next plan', async () => {
    const t = fakeTransport({ hold: true }), rag = fakeRag(), hb = make(rag, t);
    await hb.submit([1]);
    const again = await hb.submit([1]);
    expect(again.paragraphs).toBe(0);
    expect(rag.plansSeen.at(-1).exclude).toEqual([1, 2, 3, 4, 5]);
  });
  it('a failed create leaves no state behind', async () => {
    const t = fakeTransport(); t.create = async () => { throw new Error('503'); };
    const hb = make(fakeRag(), t);
    await expect(hb.submit([1])).rejects.toThrow('503');
    expect(hb.status().inflight).toBe(0);
  });
  it('honours the paragraph limit across docs, in the order given (core first)', async () => {
    const t = fakeTransport(), rag = fakeRag({ docs: { 7: [10, 11], 8: [20, 21, 22] } });
    const out = await make(rag, t).submit([7, 8], { limit: 3 });
    expect(out.paragraphs).toBe(3);
    expect(t.created[0].requests.map((r) => r.custom_id)).toEqual(['d7_p10_s0', 'd7_p11_s0', 'd8_p20_s0']);
  });
  it('skips a gated doc and carries on; stops at the spend ceiling', async () => {
    const t = fakeTransport(), rag = fakeRag({ docs: { 1: [1], 2: [2] }, gated: [1] });
    const out = await make(rag, t).submit([1, 2]);
    expect(out.gated).toHaveLength(1);
    expect(out.paragraphs).toBe(1);
    const t2 = fakeTransport();
    const over = await make(fakeRag(), t2, { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'hb2-')), budgetOver: async () => true }).submit([1]);
    expect(over.over_budget).toBe(true);
    expect(t2.created).toEqual([]);
  });
  it('a doc the spend policy refuses is skipped, not sent', async () => {
    const t = fakeTransport(), refuse = Object.assign(new Error('Spend policy'), { fatal: true });
    const out = await make(fakeRag({ docs: { 1: [1] } }), t, { assertSpend: () => { throw refuse; } }).submit([1]);
    expect(out.spendRefused).toEqual([1]);
    expect(t.created).toEqual([]);
  });
});

describe('collect', () => {
  it('waits for a batch that has not ended', async () => {
    const t = fakeTransport({ hold: true }), rag = fakeRag(), hb = make(rag, t);
    await hb.submit([1]);
    expect((await hb.collect()).pending).toBe(1);
    expect(rag.settled).toEqual([]);
  });
  it('settles an ended batch, meters every result, and forgets the batch', async () => {
    const t = fakeTransport(), rag = fakeRag(), metered = [], hb = make(rag, t, { meter: (m) => metered.push(m) });
    await hb.submit([1]);
    const c = await hb.collect();
    expect(c.written).toBe(5);
    expect(metered).toHaveLength(5);
    expect(metered[0]).toMatchObject({ model: 'claude-haiku-5-5', docId: 1, ok: true });
    expect(hb.status().batches).toEqual([]);
  });
  it('resumes after a restart: a NEW instance on the same state dir collects the old batch', async () => {
    const t = fakeTransport({ hold: true }), rag = fakeRag();
    await make(rag, t).submit([1]);
    t.hold(false);
    const c = await make(rag, t).collect();   // fresh instance = restarted process
    expect(c.written).toBe(5);
  });
  it('is idempotent: collecting twice writes once', async () => {
    const t = fakeTransport(), rag = fakeRag(), hb = make(rag, t);
    await hb.submit([1]); await hb.collect();
    expect((await hb.collect()).written).toBe(0);
    expect(rag.settled).toHaveLength(1);
  });
  it('a settle error keeps the batch for the next collect', async () => {
    const t = fakeTransport(), rag = fakeRag(); const real = rag.retrieval.settle; let boom = true;
    rag.retrieval.settle = async (...a) => { if (boom) { boom = false; throw new Error('writer down'); } return real(...a); };
    const hb = make(rag, t); await hb.submit([1]);
    expect((await hb.collect()).errors[0]).toMatch(/writer down/);
    expect(hb.status().batches).toHaveLength(1);
    expect((await hb.collect()).written).toBe(5);
  });
});

describe('failed items', () => {
  it('retry in the next batch, truncated ones are cut finer, and the third failure stamps them empty', async () => {
    const t = fakeTransport({ truncate: new Set([2]) }), rag = fakeRag({ docs: { 1: [1, 2] }, failIds: new Set([2]) }), hb = make(rag, t);
    await hb.submit([1]); await hb.collect();                       // attempt 1: id 1 written, id 2 fails (truncated)
    expect(rag.done.has(1)).toBe(true);
    expect(rag.done.has(2)).toBe(false);
    await hb.submit([1]);                                           // retried in a NEW batch, with the finer-cut hint
    expect(rag.plansSeen.at(-1).split).toEqual([2]);
    expect(t.created.at(-1).requests.map((r) => r.custom_id)).toEqual(['d1_p2_s0']);
    await hb.collect();                                             // attempt 2 fails
    await hb.submit([1]); await hb.collect();                       // attempt 3: budget spent → exhausted
    expect(rag.settled.at(-1).exhaust).toEqual([2]);
    expect(rag.done.has(2)).toBe(true);
    expect(MAX_ATTEMPTS).toBe(3);
  });
  it('run() drives submit → wait → collect → retry to completion', async () => {
    const t = fakeTransport(), rag = fakeRag({ docs: { 1: [1, 2, 3] } });
    const r = await make(rag, t).run([1]);
    expect(r.written).toBe(3);
    expect(rag.done.size).toBe(3);
  });
});

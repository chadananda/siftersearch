// Edge job queue core (worker/queue/core.js): stage-named jobs, capability claims, leases, done/ack. better-sqlite3 stands in for DO storage.sql.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import * as Q from '../../worker/queue/core.js';

const doSql = () => {
  const db = new Database(':memory:');
  return { exec: (q, ...b) => { const st = db.prepare(q); const r = st.reader ? st.all(...b) : (st.run(...b), []); return { toArray: () => r }; } };   // eager, like DO
};
const job = (id, stages, extra = {}) => ({ id, file_id: `f-${id}`, stages, invoice: { audio_s: 3600, bytes: 5e7 }, ...extra });
const T0 = 1e12;
let sql;
beforeEach(() => { sql = doSql(); Q.migrate(sql); });

describe('edge queue', () => {
  it('a job must name its stages', () => {
    expect(() => Q.enqueue(sql, [{ id: 'a' }])).toThrow(/without stages/);
    expect(() => Q.enqueue(sql, [{ id: 'a', stages: ['transcribe'] }])).toThrow(/without file_id/);
    expect(Q.enqueue(sql, [job('a', ['transcribe'])], T0)).toEqual({ added: 1 });
  });
  it('a host takes only jobs whose every stage it can run, and that fit its free memory', () => {
    Q.enqueue(sql, [job('a', ['enhance', 'remaster'], { need: { vram_mb: 6000 } }), job('b', ['transcribe'], { need: { vram_mb: 3500 } })], T0);
    expect(Q.claim(sql, { host: 'cpu-box', can: ['web'] }, T0)).toBeNull();
    expect(Q.claim(sql, { host: 'aorus', can: ['enhance', 'remaster', 'transcribe'], vram_mb: 4000 }, T0).id).toBe('b');   // a needs 6 GB
    const a = Q.claim(sql, { host: 'pod', can: ['enhance', 'remaster'], vram_mb: 24000 }, T0);
    expect(a.id).toBe('a'); expect(a.stages).toEqual(['enhance', 'remaster']); expect(a.lease).toBeTruthy();
  });
  it('priority first, then oldest; a claimed job is not handed out twice', () => {
    Q.enqueue(sql, [job('old', ['transcribe'])], T0);
    Q.enqueue(sql, [job('new', ['transcribe'])], T0 + 1);
    Q.enqueue(sql, [job('urgent', ['transcribe'], { priority: 5 })], T0 + 2);
    const can = ['transcribe'];
    expect([1, 2, 3, 4].map(() => Q.claim(sql, { host: 'h', can }, T0 + 3)?.id ?? null)).toEqual(['urgent', 'old', 'new', null]);
  });
  it('an expired lease returns the job; a stale holder cannot finish it; three losses fail it', () => {
    Q.enqueue(sql, [job('a', ['transcribe'])], T0);
    const first = Q.claim(sql, { host: 'h1', can: ['transcribe'] }, T0);
    const second = Q.claim(sql, { host: 'h2', can: ['transcribe'] }, T0 + Q.LEASE_MS + 1);
    expect(second.id).toBe('a');
    expect(() => Q.done(sql, { id: 'a', lease: first.lease, result: {} })).toThrow(/lease lost/);
    Q.claim(sql, { host: 'h3', can: ['transcribe'] }, T0 + 2 * Q.LEASE_MS + 2);
    Q.expire(sql, T0 + 3 * Q.LEASE_MS + 3);
    expect(Q.stats(sql, T0 + 3 * Q.LEASE_MS + 3).states.failed.n).toBe(1);
  });
  it('heartbeat keeps the lease alive', () => {
    Q.enqueue(sql, [job('a', ['transcribe'])], T0);
    const j = Q.claim(sql, { host: 'h', can: ['transcribe'] }, T0);
    Q.heartbeat(sql, { id: 'a', lease: j.lease }, T0 + Q.LEASE_MS - 1000);
    expect(Q.claim(sql, { host: 'h2', can: ['transcribe'] }, T0 + Q.LEASE_MS + 1000)).toBeNull();
  });
  it('done → listed for tower with only the requested stages\' outputs; ack removes it and names the R2 keys', () => {
    Q.enqueue(sql, [job('a', ['transcribe'])], T0);
    const j = Q.claim(sql, { host: 'h', can: ['transcribe'] }, T0);
    Q.done(sql, { id: 'a', lease: j.lease, result: { stages: { transcribe: { ok: true } }, outputs: [{ name: 'asr.json', key: 'results/a/asr.json' }] } }, T0 + 5);
    const [d] = Q.listDone(sql);
    expect(d.result.outputs.map((o) => o.name)).toEqual(['asr.json']);
    const gone = Q.ack(sql, ['a']);
    expect(gone[0].file_id).toBe('f-a');
    expect(Q.fileInUse(sql, 'f-a')).toBe(false);
    expect(Q.listDone(sql)).toEqual([]);
  });
  it('re-enqueueing a queued job updates it; a leased one is left alone; fail requeues', () => {
    Q.enqueue(sql, [job('a', ['transcribe'])], T0);
    Q.enqueue(sql, [job('a', ['transcribe', 'diarize'])], T0 + 1);
    const j = Q.claim(sql, { host: 'h', can: ['transcribe', 'diarize'] }, T0 + 2);
    expect(j.stages).toEqual(['transcribe', 'diarize']);
    expect(Q.enqueue(sql, [job('a', ['web'])], T0 + 3)).toEqual({ added: 0 });
    Q.fail(sql, { id: 'a', lease: j.lease, error: 'oom' }, T0 + 4);
    expect(Q.claim(sql, { host: 'h', can: ['transcribe', 'diarize'] }, T0 + 5).attempts).toBe(1);
  });
  it('withdraw drops queued jobs only', () => {
    Q.enqueue(sql, [job('a', ['transcribe']), job('b', ['transcribe'])], T0);
    Q.claim(sql, { host: 'h', can: ['transcribe'] }, T0);
    expect(Q.withdraw(sql, ['a', 'b'])).toEqual({ withdrawn: 1 });
  });
  it('a reprocess queued behind a finished job keeps the staged file alive', () => {
    Q.enqueue(sql, [job('a', ['enhance']), { ...job('a2', ['transcribe']), file_id: 'f-a' }], T0);
    const j = Q.claim(sql, { host: 'h', can: ['enhance'] }, T0);
    Q.done(sql, { id: 'a', lease: j.lease, result: {} }, T0 + 1);
    Q.ack(sql, ['a']);
    expect(Q.fileInUse(sql, 'f-a')).toBe(true);
  });
  it('capacity: engaged hosts and their measured ability size the window tower keeps queued', () => {
    Q.enqueue(sql, [job('a', ['enhance']), job('b', ['enhance']), job('c', ['enhance'])], T0);
    const j = Q.claim(sql, { host: 'boss', can: ['enhance'], vram_mb: 60000 }, T0);
    Q.heartbeat(sql, { id: 'a', lease: j.lease }, T0 + 600_000);
    Q.done(sql, { id: 'a', lease: j.lease, result: {} }, T0 + 1_200_000);   // 1 h of audio in 20 min → 3× real time
    Q.claim(sql, { host: 'aorus', can: ['enhance'] }, T0 + 1_200_000);        // not yet measured: counts as 1×
    const c = Q.capacity(sql, T0 + 1_200_000);
    expect(c.hosts.map((h) => h.host)).toEqual(['aorus', 'boss']);
    expect(c.rate).toBeCloseTo(4);
    expect(c.queued_audio_h).toBe(1); expect(c.queued_h).toBeCloseTo(0.25);
    expect(Q.capacity(sql, T0 + 1_200_000 + Q.HOST_FRESH_MS + 1).hosts).toEqual([]);   // idle hosts drop out
  });
  it('cancel removes a job in any state; its holder then loses it', () => {
    Q.enqueue(sql, [job('a', ['transcribe'])], T0);
    const j = Q.claim(sql, { host: 'h', can: ['transcribe'] }, T0);
    expect(Q.cancel(sql, ['a', 'zz']).map((x) => x.id)).toEqual(['a']);
    expect(() => Q.heartbeat(sql, { id: 'a', lease: j.lease }, T0 + 1)).toThrow(/no such job/);
  });
});

it('a failure keeps its head (host, exit) and its tail (the reason)', async () => {
  const { clip } = await import('../../worker/queue/core.js');
  const e = 'aorus: exit 1: ' + 'x'.repeat(5000) + 'RuntimeError: post failed';
  const c = clip(e);
  expect(c.startsWith('aorus: exit 1:')).toBe(true);
  expect(c.endsWith('RuntimeError: post failed')).toBe(true);
  expect(c.length).toBeLessThan(2500);
  expect(clip('short')).toBe('short');
});

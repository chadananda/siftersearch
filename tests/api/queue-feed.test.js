// Tower ↔ edge queue (api/lib/media/queue-feed.js) over the real queue core (worker/queue/core.js) with an in-memory file store.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import * as Q from '../../worker/queue/core.js';
import { feed, pull, jobIdFor } from '../../api/lib/media/queue-feed.js';

const doSql = () => { const db = new Database(':memory:'); return { exec: (q, ...b) => { const st = db.prepare(q); const r = st.reader ? st.all(...b) : (st.run(...b), []); return { toArray: () => r }; } }; };
let sql, store, q, root, st, repo, wr, items;
beforeEach(async () => {
  sql = doSql(); Q.migrate(sql); store = new Map(); root = await mkdtemp(join(tmpdir(), 'qf-'));
  q = {
    capacity: async () => Q.capacity(sql), stats: async () => Q.stats(sql), enqueue: async (jobs) => Q.enqueue(sql, jobs),
    listDone: async (n) => Q.listDone(sql, n), ack: async (ids) => Q.ack(sql, ids),
    put: async (kind, id, name, file) => { const b = await readFile(file); store.set(`${kind}/${id}/${name}`, b); return { key: name, bytes: b.length }; },
    get: async (kind, id, name, dest) => { await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, store.get(`${kind}/${id}/${name}`)); return dest; },
  };
  items = {};
  for (const id of [1, 2, 3]) {
    const dir = join(root, String(id)); await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'orig.mp3'), `audio-${id}`);
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ slug: `t${id}`, original: 'orig.mp3', duration_s: 3600 }));
    items[id] = { id, dir, slug: `t${id}`, state: 'whole_queued' };
  }
  repo = { getMediaItem: async (id) => items[id], updateMediaItem: async (id, p) => Object.assign(items[id], p) };
  wr = {
    fileSha: async (f) => `sha${(await readFile(f, 'utf8')).slice(-1)}`.padEnd(16, '0'),
    wholeJob: (it, m, sha) => ({ v: 1, id: it.id, input: 'in.mp3', input_sha: sha, meta: { slug: m.slug } }),
    adoptWholeResult: async (staging, dir) => { await copyFile(join(staging, 'result.json'), join(dir, 'adopted.json')); return { stages: { whole: {} } }; },
  };
  st = { queue: [1, 2, 3, 9], items: { 1: { kind: 'whole' }, 2: { kind: 'whole' }, 3: { kind: 'whole' }, 9: { mode: 'restore' } }, done: [] };
});

describe('queue feed', () => {
  it('feeds nothing while no machine pulls from the queue', async () => {
    expect((await feed(st, { q, repo, wr })).fed).toBe(0);
    expect(st.queue).toEqual([1, 2, 3, 9]);
  });
  it('keeps ~2.5 h queued at the engaged hosts\' pace, staging inputs by file id; restores stay in tower\'s lane', async () => {
    Q.claim(sql, { host: 'aorus', can: ['whole'] });   // engaged, unmeasured → 1× real time → 2.5 h = 3 one-hour talks
    const r = await feed(st, { q, repo, wr });
    expect(r.fed).toBe(3);
    expect(st.queue).toEqual([9]);
    const j = Q.claim(sql, { host: 'aorus', can: ['whole'], ram_gb: 8 });
    expect(j.file_id).toMatch(/^w1-/); expect(j.body.invoice.audio_s).toBe(3600);
    expect(String(store.get(`files/${j.file_id}/in.mp3`))).toBe('audio-1');
    expect(JSON.parse(store.get(`files/${j.file_id}/job.json`)).threads).toBe(4);
    expect(Q.claim(sql, { host: 'tiny', can: ['whole'], ram_gb: 2 })).toBeNull();   // needs 5 GB free
  });
  it('pulls a finished job by id, adopts it, marks the talk transcribed and acks', async () => {
    Q.claim(sql, { host: 'aorus', can: ['whole'] });
    await feed(st, { q, repo, wr });
    const j = Q.claim(sql, { host: 'aorus', can: ['whole'], ram_gb: 8 });
    store.set(`results/${j.id}/result.json`, Buffer.from('{"ok":true}'));
    Q.done(sql, { id: j.id, lease: j.lease, result: { outputs: [{ name: 'result.json' }] } });
    const r = await pull(st, { q, repo, wr });
    expect(r).toMatchObject({ adopted: 1, acked: 1 });
    expect(items[1].state).toBe('transcribed');
    expect(await readFile(join(items[1].dir, 'adopted.json'), 'utf8')).toBe('{"ok":true}');
    expect(st.qjobs[j.id]).toBeUndefined();
    expect(st.done[0]).toMatchObject({ id: 1, via: 'queue', gpu: 'aorus' });
  });
  it('a job the queue gave up on goes back to tower\'s lane once, then fails the talk', async () => {
    Q.claim(sql, { host: 'aorus', can: ['whole'] });
    await feed(st, { q, repo, wr });
    const id = jobIdFor(1, 'sha1'.padEnd(16, '0'));
    for (let k = 0; k < Q.MAX_ATTEMPTS; k++) { Q.expire(sql); const j = Q.claim(sql, { host: 'aorus', can: ['whole'], ram_gb: 8 }); Q.fail(sql, { id: j.id, lease: j.lease, error: 'oom' }); }
    await pull(st, { q, repo, wr });
    expect(st.queue).toContain(1);
    expect(st.qjobs[id]).toBeUndefined();
  });
});

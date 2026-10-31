// The edge router (worker/queue/index.js MediaQueue.call) passes type through list-done and stats, so tower pulls typed steps from /_q.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { MediaQueue } from '../../worker/queue/index.js';

const doSql = () => { const db = new Database(':memory:'); return { exec: (q, ...b) => { const st = db.prepare(q); const r = st.reader ? st.all(...b) : (st.run(...b), []); return { toArray: () => r }; } }; };
const mq = () => new MediaQueue({ storage: { sql: doSql(), getAlarm: async () => 1, setAlarm: async () => {} }, blockConcurrencyWhile: (f) => f() }, {});
const job = (id, type) => ({ id, file_id: `f-${id}`, type, stages: [type], invoice: { audio_s: 3600, bytes: 1e6 }, ...(type === 'media' ? {} : { contract: 1 }) });

describe('edge router: typed list-done and stats', () => {
  it('list-done and stats answer for the asked type only', async () => {
    const q = mq();
    await q.call('enqueue', { jobs: [job('g1', 'gpu'), { ...job('w1', 'media'), stages: ['enhance'] }] });
    const g = await q.call('claim', { host: 'pod', types: ['gpu'], contract: 1, vram_mb: 24000, ram_gb: 32 });
    await q.call('done', { id: g.id, lease: g.lease, result: { outputs: [] } });
    const w = await q.call('claim', { host: 'old', can: ['enhance'] });
    expect((await q.call('list-done', { type: 'gpu' })).map((j) => j.id)).toEqual(['g1']);
    expect(await q.call('list-done', {})).toEqual([]);   // the legacy job is still leased
    expect((await q.call('stats', { type: 'gpu' })).states).toEqual({ done: { n: 1, audio_h: 1 } });
    expect((await q.call('stats', {})).states).toEqual({ leased: { n: 1, audio_h: 1 } });
    await q.call('done', { id: w.id, lease: w.lease, result: { outputs: [] } });
    expect((await q.call('list-done', {})).map((j) => j.id)).toEqual(['w1']);
  });
});

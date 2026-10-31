// Tower's LAN queue (api/lib/repos/media-queue-repo.js + api/routes/media-queue.js): the edge client (queue-client.mjs) works against it
// unchanged — only the base url differs — and tower's in-process client has the same methods.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { queueClient } from '../../api/lib/media/queue-client.mjs';

let app, base, dir, local, R;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mq-'));
  process.env.MEDIA_QUEUE_DIR = dir; process.env.MEDIA_QUEUE_KEY = 'machine-k'; process.env.INTERNAL_API_KEY = 'admin-k';
  R = await import('../../api/lib/repos/media-queue-repo.js');
  local = R.localQueue();
  app = Fastify();
  await app.register((await import('../../api/routes/media-queue.js')).default, { prefix: '/api/admin' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${app.server.address().port}/api/admin/ops/queue`;
});
afterAll(async () => { await app?.close(); R?._closeForTests(); });

describe('LAN media queue', () => {
  it('a machine claims, places its result under the lease, and tower pulls + acks; files go with the ack', async () => {
    const src = join(dir, 'in.mp3'); await writeFile(src, 'audio-bytes');
    await local.put('files', 'w1-abc', 'in.mp3', src);   // tower stages in-process
    await local.enqueue([{ id: 'whole-1-abc', file_id: 'w1-abc', item_id: 1, type: 'media', stages: ['whole'], invoice: { audio_s: 60 } }]);
    const m = queueClient({ base, key: 'machine-k' });
    expect(await m.list('files', 'w1-abc')).toEqual([{ name: 'in.mp3', bytes: 11 }]);
    const j = await m.claim({ host: 'aorus', can: ['whole'], ram_gb: 8 });
    expect(j.id).toBe('whole-1-abc');
    await m.get('files', j.file_id, 'in.mp3', join(dir, 'got', 'in.mp3'));
    expect(await readFile(join(dir, 'got', 'in.mp3'), 'utf8')).toBe('audio-bytes');
    const out = join(dir, 'result.json'); await writeFile(out, '{"ok":1}');
    await expect(m.put('results', j.id, 'result.json', out, { lease: 'wrong' })).rejects.toMatchObject({ status: 409 });
    expect(await m.put('results', j.id, 'nested/result.json', out, { lease: j.lease })).toMatchObject({ bytes: 8 });
    await m.done({ id: j.id, lease: j.lease, result: { outputs: [{ name: 'nested/result.json' }] } });
    expect(await m.claim({ host: 'aorus', can: ['whole'] })).toBeNull();   // 204
    const [d] = await local.listDone(10);
    expect(d.result.outputs[0].name).toBe('nested/result.json');
    await local.get('results', d.id, 'nested/result.json', join(dir, 'pulled.json'));
    expect(await readFile(join(dir, 'pulled.json'), 'utf8')).toBe('{"ok":1}');
    expect(await local.ack([d.id])).toMatchObject({ acked: 1, deleted: 2 });
    expect(existsSync(join(dir, 'stage', 'w1-abc'))).toBe(false); expect(existsSync(join(dir, 'results', d.id))).toBe(false);
  });
  it('a machine key can only run work ops and place results; no key gets nothing', async () => {
    const m = queueClient({ base, key: 'machine-k' }), src = join(dir, 'x'); await writeFile(src, 'x');
    await expect(m.enqueue([])).rejects.toMatchObject({ status: 401 });
    await expect(m.put('files', 'f1', 'x', src)).rejects.toMatchObject({ status: 403 });
    await expect(queueClient({ base, key: 'nope' }).claim({ host: 'h' })).rejects.toMatchObject({ status: 401 });
    expect(await queueClient({ base, key: 'admin-k' }).stats()).toBeTruthy();
    expect((await queueClient({ base, key: 'admin-k' }).put('files', 'f1', 'x', src)).bytes).toBe(1);   // admin may stage over HTTP too
  });
  it('a result over 90 MB (the edge\'s signed-url probe) lands whole on the LAN queue, never as the empty probe', async () => {
    const src = join(dir, 'big.bin'); await writeFile(src, Buffer.alloc(91e6, 7));
    await local.enqueue([{ id: 'whole-2-big', file_id: 'w2-big', item_id: 2, type: 'media', stages: ['whole'], invoice: { audio_s: 60 } }]);
    const m = queueClient({ base, key: 'machine-k' }), j = await m.claim({ host: 'aorus', can: ['whole'], ram_gb: 8 });
    expect(await m.put('results', j.id, 'big.bin', src, { lease: j.lease })).toMatchObject({ bytes: 91e6 });
    expect(await m.list('results', j.id)).toEqual([{ name: 'big.bin', bytes: 91e6 }]);
  });
  it('refuses path tricks in ids and names', async () => {
    const r = await fetch(`${base}/files/..%2Fetc/passwd`, { headers: { 'x-queue-key': 'admin-k' } });
    expect(r.status).toBe(400);
    const r2 = await fetch(`${base}/files/f1/a/../../x`, { headers: { 'x-queue-key': 'admin-k' } });
    expect([400, 404]).toContain(r2.status);
  });
});

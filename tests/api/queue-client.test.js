// queue-client PUT: big files never send their body through the Worker (Cloudflare 413s > 100 MB at the edge).
import { it, expect } from 'vitest';
import { mkdtemp, writeFile, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { queueClient, DIRECT_MAX } from '../../api/lib/media/queue-client.mjs';

const fakeFetch = (calls) => async (url, o) => {
  calls.push({ url, len: o.headers['content-length'], key: o.headers['x-queue-key'] });
  if (url.startsWith('https://q/') && o.headers['content-length'] === '0') return new Response(null, { status: 307, headers: { location: 'https://r2/signed' } });
  return new Response('{}', { status: url.startsWith('https://r2/') ? 200 : 201 });
};

it('a file over 90 MB asks with an empty PUT, then streams to the signed url without the key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qc-')), big = join(dir, 'in.mp4');
  await writeFile(big, ''); await truncate(big, DIRECT_MAX + 1);
  const calls = [], q = queueClient({ base: 'https://q', key: 'k', fetch: fakeFetch(calls) });
  expect((await q.put('files', 'w1', 'in.mp4', big)).bytes).toBe(DIRECT_MAX + 1);
  expect(calls).toEqual([{ url: 'https://q/files/w1/in.mp4', len: '0', key: 'k' }, { url: 'https://r2/signed', len: String(DIRECT_MAX + 1), key: undefined }]);
});

it('a small file goes straight through the Worker', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qc-')), small = join(dir, 'job.json');
  await writeFile(small, '{"v":1}');
  const calls = [], q = queueClient({ base: 'https://q', key: 'k', fetch: fakeFetch(calls) });
  await q.put('results', 'j1', 'result.json', small, { lease: 'L' });
  expect(calls).toEqual([{ url: 'https://q/results/j1/result.json?lease=L', len: '7', key: 'k' }]);
});

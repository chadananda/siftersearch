// A drifted realign on a home host (media/realign-remote.js over host-job.js): LAN only (ssh + rsync, never R2), CPU container with no network,
// realign.json swapped in only when it arrived whole. 11-01: 2680 waited for a worker that never takes a lone realign.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { realignStep, RUN_SH } from '../../api/lib/media/realign-remote.js';

const talk = () => {
  const dir = mkdtempSync(join(tmpdir(), 'realign-')); mkdirSync(join(dir, 'enhanced'));
  writeFileSync(join(dir, 'enhanced', 'unipase.flac'), Buffer.alloc(2e5, 1));
  writeFileSync(join(dir, 'enhanced', 'realign.json'), '{"times":{"old":1}}');
  writeFileSync(join(dir, 'transcript.work.json'), '{"paragraphs":[]}');
  return { id: 2680, dir };
};
// a fake home host: the container finishes at once (exit `code`); realign.json comes back as `body`
const fakeT = ({ body = '{"times":{"1":[[0.1,1]]}}', code = 0 } = {}, log = []) => ({ run: async (cmd, args) => {
  log.push([cmd, ...args].join(' '));
  if (cmd === 'rsync') { const to = args.at(-1); if (!to.includes(':')) writeFileSync(to, body); return { stdout: '' }; }
  const c = args[1];
  if (c.includes('inspect') && c.includes('.State')) return { stdout: log.some((l) => l.includes('docker run')) ? JSON.stringify({ Running: false, ExitCode: code }) : 'null' };
  if (c.includes('out.json')) return { stdout: 'loading model\n{"placed":9,"total":10}\n' };
  if (c.includes('logs')) return { stdout: 'Traceback: boom' };
  return { stdout: '' };
} });
const opts = (it0, T) => ({ T, audio: join(it0.dir, 'enhanced', 'unipase.flac'), out: join(it0.dir, 'enhanced', 'realign.json'), host: 'aorus', image: 'img', nap: async () => {} });

describe('realign on a home host', () => {
  it('ships the listening copy + transcript over the LAN, runs media_tool realign offline on CPU, brings realign.json back', async () => {
    const it0 = talk(), log = [];
    const r = await realignStep(it0, opts(it0, fakeT({}, log)));
    expect(r).toEqual({ placed: 9, total: 10, host: 'aorus' });
    expect(JSON.parse(readFileSync(join(it0.dir, 'enhanced', 'realign.json'), 'utf8')).times['1']).toEqual([[0.1, 1]]);
    expect(existsSync(join(it0.dir, 'enhanced', 'realign.json.remote'))).toBe(false);
    const run = log.find((l) => l.includes('docker run -d'));
    expect(run).toMatch(/--network none/); expect(run).not.toMatch(/--gpus/); expect(run).toMatch(/CUDA_VISIBLE_DEVICES=/); expect(run).toMatch(/realign-2680-/);
    expect(log.filter((l) => l.startsWith('rsync')).map((l) => l.split(' ').at(-1))).toEqual(expect.arrayContaining([expect.stringMatching(/^aorus:.*\/in\.flac$/), expect.stringMatching(/^aorus:.*\/work\.json$/)]));
    expect(log.some((l) => /r2|s3|wrangler/i.test(l))).toBe(false);   // never the cloud
    expect(RUN_SH).toMatch(/media_tool\.py realign \/job\/in\.flac .*--segments \/job\/work\.json --output \/job\/realign\.json/);
  });
  it('a failed container throws with its log and leaves the old realign.json in place', async () => {
    const it0 = talk();
    await expect(realignStep(it0, opts(it0, fakeT({ code: 1 })))).rejects.toThrow(/realign exited 1: Traceback/);
    expect(readFileSync(join(it0.dir, 'enhanced', 'realign.json'), 'utf8')).toBe('{"times":{"old":1}}');
  });
  it('a cut transfer never replaces realign.json', async () => {
    const it0 = talk();
    await expect(realignStep(it0, opts(it0, fakeT({ body: '{"times":{"1":[[0.1' })))).rejects.toThrow();
    expect(readFileSync(join(it0.dir, 'enhanced', 'realign.json'), 'utf8')).toBe('{"times":{"old":1}}');
  });
  it('a gate host (no docker over ssh) is refused', async () => {
    const it0 = talk();
    await expect(realignStep(it0, { ...opts(it0, fakeT()), host: 'boss' })).rejects.toThrow(/gate transport/);
  });
});

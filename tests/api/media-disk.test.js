// The 10-23 16:09 disk leak (aorus 100 % full of media job folders → 28 failures, the GPU idle): a fetched job is cleaned
// on its host, the gate's janitor removes old / over-cap finished jobs (never a running one), a host under 20 GB free takes
// no new job, and system-checks warns at 85 % / is critical at 95 %.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, copyFileSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync, spawn } from 'child_process';
import { diskLevel, diskCheck } from '../../scripts/lib/host-disk.mjs';

describe('host disk level (system-checks)', () => {
  it('WARN at 85 %, CRITICAL at 95 %', () => {
    expect(diskLevel(50)).toBe('ok'); expect(diskLevel(85)).toBe('warn'); expect(diskLevel(94)).toBe('warn'); expect(diskLevel(95)).toBe('critical'); expect(diskLevel(100)).toBe('critical');
    expect(diskCheck('aorus', { used_pct: 100, free_gb: 0, size_gb: 234, jobs: 1484 })).toMatchObject({ ok: false, level: 'critical' });
    expect(diskCheck('boss', { used_pct: 40, free_gb: 500, size_gb: 900, jobs: 3 })).toMatchObject({ ok: true });
    expect(diskCheck('boss', null)).toMatchObject({ ok: true, level: 'info' });
  });
});

describe('dispatch skips a host low on disk', () => {
  it('diskOk: < 20 GB free → no; unknown → yes; the transcription goes to the other host', async () => {
    const t = await import('../../api/lib/media/tools.js');
    const noop = async () => ({});
    t.noteDisk('dfull', { free_gb: 3 }); t.noteDisk('dok', { free_gb: 300 });
    expect(t.diskOk('dfull', { refresh: noop })).toBe(false);
    expect(t.diskOk('dok', { refresh: noop })).toBe(true);
    expect(t.diskOk('never-seen', { refresh: noop })).toBe(true);
    const got = await t.acquireAsrHost([{ host: 'dfull', slots: 2 }, { host: 'dok', slots: 2 }]);
    expect(got.host).toBe('dok'); got.release();
  });
});

describe('a fetched job is cleaned on its host', () => {
  it('asrJob: poll → start → done → fetch → clean <job>', async () => {
    const { asrJob } = await import('../../api/lib/media/tools.js');
    const d = mkdtempSync(join(tmpdir(), 'dc-')); const f = join(d, 'a.flac'); writeFileSync(f, 'x'.repeat(100));
    const cmds = []; let polled = 0;
    const exec = async (cmd, args) => {
      const c = args.at(-1); if (cmd === 'ssh') cmds.push(c.split(' ').slice(0, 2).join(' '));
      if (c.startsWith('poll')) return { stdout: JSON.stringify({ state: polled++ ? 'done' : 'missing' }) };
      if (c.startsWith('fetch')) return { stdout: '{"segments":[]}' };
      if (c.startsWith('clean')) return { stdout: '{"cleaned":true}' };
      return { stdout: '{}' };
    };
    await asrJob(f, { lang: 'en', output: join(d, 'out.json') }, { host: 'h9', job: 'j-clean-1', exec, pollMs: 0, count: false });
    expect(cmds.at(-1)).toBe('clean j-clean-1');
    expect(cmds.indexOf('fetch j-clean-1')).toBeLessThan(cmds.indexOf('clean j-clean-1'));
  });
});

describe('the gate: clean, df and the janitor', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    copyFileSync(new URL('../../scripts/media/boss-asr-gate.sh', import.meta.url), join(dir, 'asr-gate.sh'));
    mkdirSync(join(dir, 'jobs'));
    const job = (id, { hoursOld = 0, running = false, kb = 4 } = {}) => {
      const p = join(dir, 'jobs', id); mkdirSync(p); writeFileSync(join(p, 'in.flac'), Buffer.alloc(kb * 1024));
      let child = null;
      if (running) { child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' }); writeFileSync(join(p, 'pid'), String(child.pid)); } else writeFileSync(join(p, 'pid'), '0');
      const t = (Date.now() - hoursOld * 3600_000) / 1000; utimesSync(p, t, t);
      return child;
    };
    const gate = (cmd, env = {}) => execFileSync('bash', [join(dir, 'asr-gate.sh')], { env: { ...process.env, SSH_ORIGINAL_COMMAND: cmd, ...env }, input: '', encoding: 'utf8' }).trim();
    return { dir, job, gate, has: (id) => existsSync(join(dir, 'jobs', id)) };
  };
  it('clean removes a finished job and refuses a running one', () => {
    const g = setup(); g.job('done-job'); const ch = g.job('live-job', { running: true });
    try {
      expect(JSON.parse(g.gate('clean done-job'))).toEqual({ cleaned: true }); expect(g.has('done-job')).toBe(false);
      expect(JSON.parse(g.gate('clean live-job'))).toMatchObject({ cleaned: false, why: 'running' }); expect(g.has('live-job')).toBe(true);
      let out = ''; try { g.gate('clean ../etc'); } catch (e) { out = String(e.stdout); }
      expect(JSON.parse(out)).toMatchObject({ error: 'bad job' });   // refused, exit 2
    } finally { ch.kill(); }
  });
  it('df reports free space and the job count', () => {
    const g = setup(); g.job('a'); g.job('b');
    const j = JSON.parse(g.gate('df'));
    expect(j.jobs).toBe(2); expect(j.free_gb).toBeGreaterThanOrEqual(0); expect(j.used_pct).toBeGreaterThanOrEqual(0);
  });
  it('janitor (on start): old finished jobs go, running and recent stay; then the oldest go until under the cap', () => {
    const g = setup();
    g.job('old-done', { hoursOld: 10 }); const ch = g.job('old-running', { hoursOld: 10, running: true }); g.job('new-done', { hoursOld: 1 });
    try {
      // a start with a bad verb still runs the janitor first (it runs before the job is written)
      try { g.gate('start flac j-new1 --verb nope'); } catch { /* bad verb → exit 2 */ }
      expect(g.has('old-done')).toBe(false); expect(g.has('old-running')).toBe(true); expect(g.has('new-done')).toBe(true);
    } finally { ch.kill(); }
    // cap: 0 GB → every finished job goes, oldest first
    const g2 = setup(); g2.job('c1', { hoursOld: 3, kb: 64 }); g2.job('c2', { hoursOld: 2, kb: 64 });
    try { g2.gate('start flac j-new2 --verb nope', { MEDIA_JOB_CAP_GB: '0' }); } catch { /* exit 2 */ }
    expect(g2.has('c1')).toBe(false); expect(g2.has('c2')).toBe(false);
  });
});

describe('the disk-full failures go back to the queue', () => {
  it('"No space left on device" is retried even after two retries, and does not count as one', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('../../api/lib/db.js', () => ({
      queryAll: async () => [
        { id: 1, why: 'retry:2 enhance: OSError: [Errno 28] No space left on device', stage: 'enhance' },
        { id: 2, why: 'retry:2 asr job x failed: some model error', stage: 'transcribe' },
        { id: 3, why: 'diarize job y on aorus failed: No space left on device', stage: 'diarize' },
      ],
      queryOne: async () => null, query: async () => ({}),
      transaction: async (stmts) => { calls.push(...stmts); },
    }));
    const calls = [];
    const repo = await import('../../api/lib/repos/media-repo.js');
    const ids = await repo.retryTransientFailures();
    expect(ids).toEqual([1, 3]);
    expect(calls.find((c) => c.args[3] === 1).args[1]).toMatch(/^retry:2 /);   // not retry:3
    expect(calls.find((c) => c.args[3] === 3).args[1]).toMatch(/^retry:0 /);
    vi.doUnmock('../../api/lib/db.js'); vi.resetModules();
  });
});

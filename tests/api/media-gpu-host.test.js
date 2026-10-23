// The GPU compute host (remoteJob): start once, re-attach by job id after a restart, fetch the result; a drain leaves it running.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { writeFileSync, mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { remoteJob, DrainAbort } from '../../api/lib/media/tools.js';

let dir, input;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'gpu-')); input = join(dir, 'a.wav'); writeFileSync(input, 'x'); });

function fakeHost(initial = 'missing') {
  const calls = [];
  let state = initial;
  const exec = async (cmd, args, o = {}) => {
    const c = args[args.length - 1];
    calls.push(c);
    if (c.startsWith('poll')) { const s = state; if (state === 'running') state = 'done'; return { stdout: JSON.stringify({ state: s }) }; }
    if (c.startsWith('start')) { state = 'running'; return { stdout: '{"started":true}' }; }
    if (c.startsWith('install-tool')) return { stdout: '{}' };
    if (c.startsWith('fetch-file')) { o.onStdout?.(Buffer.from('AUDIO')); return { stdout: '' }; }
    if (c.startsWith('fetch')) return { stdout: '{"snr_db":30}' };
    throw new Error(`unexpected ${c}`);
  };
  return { exec, calls };
}

describe('remoteJob', () => {
  it('starts a grade job once and returns its JSON', async () => {
    const h = fakeHost();
    const r = await remoteJob('grade', input, {}, { host: 'g', job: 'talk-gr-1', exec: h.exec, pollMs: 0 });
    expect(r.snr_db).toBe(30);
    expect(h.calls.filter((c) => c.startsWith('start'))).toEqual(['start wav talk-gr-1 --verb grade']);
  });
  it('re-attaches to a running job without starting another', async () => {
    const h = fakeHost('running');
    await remoteJob('grade', input, {}, { host: 'g2', job: 'talk-gr-2', exec: h.exec, pollMs: 0 });
    expect(h.calls.some((c) => c.startsWith('start'))).toBe(false);
  });
  it('writes a dfn file result to opts.output', async () => {
    const h = fakeHost();
    const out = join(dir, 'dfn.flac');
    await remoteJob('dfn', input, { output: out }, { host: 'g3', job: 'talk-df-1', exec: h.exec, pollMs: 0, file: true });
    expect(readFileSync(out, 'utf8')).toBe('AUDIO');
  });
  it('a drain leaves the remote job running', async () => {
    const h = fakeHost('running');
    const exec = async (cmd, args, o) => (args.at(-1).startsWith('poll') ? { stdout: '{"state":"running"}' } : h.exec(cmd, args, o));
    await expect(remoteJob('grade', input, {}, { host: 'g4', job: 'talk-gr-3', exec, pollMs: 2000, stop: () => true })).rejects.toBeInstanceOf(DrainAbort);
  });
});

describe('gateWrap', () => {
  it('runs the gate explicitly on a host whose sshd Tailscale SSH bypasses; leaves forced-command hosts alone', async () => {
    const { gateWrap } = await import('../../api/lib/media/tools.js');
    process.env.MEDIA_GATE_AORUS = '~/media-gpu/asr-gate.sh';
    expect(gateWrap('aorus', 'poll job-1')).toBe("SSH_ORIGINAL_COMMAND='poll job-1' ~/media-gpu/asr-gate.sh");
    expect(gateWrap('aorus', "poll x'; rm -rf ~")).not.toContain("x'");
    expect(gateWrap('boss', 'poll job-1')).toBe('poll job-1');
    delete process.env.MEDIA_GATE_AORUS;
  });
});

describe('pickAsrHost', () => {
  it('fastest host with a free slot first, then the least loaded; slots from MEDIA_ASR_HOSTS', async () => {
    const { pickAsrHost, asrHosts } = await import('../../api/lib/media/tools.js');
    const hosts = [{ host: 'aorus', slots: 2 }, { host: 'boss', slots: 4 }];
    expect(pickAsrHost(hosts, new Map())).toBe('aorus');
    expect(pickAsrHost(hosts, new Map([['aorus', 2]]))).toBe('boss');
    expect(pickAsrHost(hosts, new Map([['aorus', 2], ['boss', 4]]))).toBe('aorus');
    expect(pickAsrHost(hosts, new Map([['aorus', 4], ['boss', 4]]))).toBe('boss');
    process.env.MEDIA_ASR_HOSTS = 'aorus:2, boss:4';
    expect(asrHosts()).toEqual(hosts);
    delete process.env.MEDIA_ASR_HOSTS;
  });
});

describe('probe slots (10-23: 24 probes at once filled aorus RAM)', () => {
  it('the GPU host takes 2 at a time, then the ASR host 3; the rest wait', async () => {
    const { withProbeHost } = await import('../../api/lib/media/tools.js');
    const live = new Map(); const peak = new Map(); const used = [];
    const job = () => withProbeHost(async (h) => {
      used.push(h); live.set(h, (live.get(h) || 0) + 1); peak.set(h, Math.max(peak.get(h) || 0, live.get(h)));
      await new Promise((r) => setTimeout(r, 10)); live.set(h, live.get(h) - 1);
    }, { hosts: [['gpu', 2], ['cpu', 3]] });
    await Promise.all(Array.from({ length: 9 }, job));
    expect(peak.get('gpu')).toBe(2);
    expect(peak.get('cpu')).toBe(3);
    expect(used.slice(0, 2)).toEqual(['gpu', 'gpu']);
  });
});

describe('long recordings are probed on boss only', () => {
  it('long: true skips the GPU host', async () => {
    const { withProbeHost } = await import('../../api/lib/media/tools.js');
    process.env.MEDIA_ASR_HOST = 'boss';
    expect(await withProbeHost(async (h) => h, { long: true })).toBe('boss');
    delete process.env.MEDIA_ASR_HOST;
  });
});

describe('errSummary', () => {
  it('keeps the command and the error ahead of a traceback tail', async () => {
    const { errSummary } = await import('../../api/lib/media/tools.js');
    const e = errSummary(`Traceback (most recent call last):\n  File "x.py", line 3, in <module>\n    run()\n           ^^^^^\nsubprocess.CalledProcessError: Command '['ffmpeg', '-i', 'in.flac']' died with <Signals.SIGKILL: 9>.\n[exit 1]`);
    expect(e.startsWith("subprocess.CalledProcessError: Command '['ffmpeg'")).toBe(true);
    expect(e).toContain('[exit 1]');
  });
});

describe('encodeRemote', () => {
  it('falls back to the tower encode when the host fails; a drain is not a failure', async () => {
    const { encodeRemote, DrainAbort } = await import('../../api/lib/media/tools.js');
    process.env.MEDIA_ENCODE_HOST = 'no-such-host-xyz';
    const local = vi.fn(async () => 'tower');
    expect(await encodeRemote('ogg', '/nonexistent.flac', '/tmp/x.ogg', { job: 'j-1', local })).toBe('tower');
    expect(local).toHaveBeenCalledTimes(1);
    delete process.env.MEDIA_ENCODE_HOST;
    void DrainAbort;
  });
});

describe('temp files', () => {
  it('never collide within one millisecond (the three variant probes)', async () => {
    const { tempFlac } = await import('../../api/lib/media/tools.js');
    const names = new Set(Array.from({ length: 50 }, () => tempFlac('/tmp')));
    expect(names.size).toBe(50);
  });
});

describe('live health counts running RUNS', () => {
  it('an update re-run of a published talk (state done) is LLM work in progress', async () => {
    const { liveHealth } = await import('../../api/routes/media.js');
    const h = await liveHealth(async () => ({ llm_backlog: 1, llm_running: 0 }), async () => [{ name: 'media-item' }, { name: 'media-llm' }, { name: 'media-asr' }]);
    expect(h).toMatchObject({ llm_running: 2, asr_running: 1, compute_running: 0, llm_backlog: 1 });
  });
});

describe('DeepFilterNet overflow (aorus 1 → boss 2)', () => {
  it('a second dfn goes to boss; a job already on a host is re-attached there', async () => {
    const { gpuOrTower } = await import('../../api/lib/media/tools.js');
    const started = [];
    const states = new Map();
    const exec = async (cmd, args, o = {}) => {
      const host = args.at(-2), c = args.at(-1);
      if (c.startsWith('poll')) { const id = c.split(' ')[1]; const s = states.get(id) || 'missing'; if (s === 'running') states.set(id, 'done'); return { stdout: JSON.stringify({ state: s }) }; }
      if (c.startsWith('install-tool')) return { stdout: '{}' };
      if (c.startsWith('start')) { const id = c.split(' ')[2]; started.push([host, id]); states.set(id, 'running'); await new Promise((r) => setTimeout(r, 20)); return { stdout: '{}' }; }
      if (c.startsWith('fetch-file')) { o.onStdout?.(Buffer.from('A')); return { stdout: '' }; }
      return { stdout: '{}' };
    };
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const d = mkdtempSync(join(tmpdir(), 'ov-')); writeFileSync(join(d, 'a.flac'), 'x');
    const hosts = [['gpu1', 1], ['cpu1', 2]];   // (not 'aorus': its gate is wrapped)
    await Promise.all([1, 2].map((i) => gpuOrTower('dfn', join(d, 'a.flac'), { output: join(d, `o${i}.flac`) }, { job: `t-df-${i}`, file: true, hosts, exec, pollMs: 0 })));
    expect(started.map(([h]) => h).sort()).toEqual(['cpu1', 'gpu1']);
    expect(started.find(([h]) => h === 'cpu1')[1]).toMatch(/-cpu1$/);
    // a restart: the job is found on boss and NOT started again
    started.length = 0;
    states.set('t-df-9-cpu1', 'running');
    await gpuOrTower('dfn', join(d, 'a.flac'), { output: join(d, 'o9.flac') }, { job: 't-df-9', file: true, hosts, exec, pollMs: 0 });
    expect(started).toEqual([]);
  });
});

describe('transcription slots are separate from diarization (10-23)', () => {
  it('acquireAsrHost waits while every host is full; diarizations never take a slot', async () => {
    const { acquireAsrHost } = await import('../../api/lib/media/tools.js');
    const hosts = [{ host: 'ga', slots: 1 }, { host: 'gb', slots: 1 }];
    const a = await acquireAsrHost(hosts), b = await acquireAsrHost(hosts);
    expect([a.host, b.host]).toEqual(['ga', 'gb']);
    let got = null;
    const c = acquireAsrHost(hosts).then((x) => { got = x; });
    await new Promise((r) => setTimeout(r, 20));
    expect(got).toBeNull();
    a.release(); a.release();   // idempotent
    await c;
    expect(got.host).toBe('ga');
    got.release(); b.release();
  });
});

describe('diarization slots per host', () => {
  it('3 at a time on one host', async () => {
    const { diarSlot } = await import('../../api/lib/media/tools.js');
    let live = 0, peak = 0;
    await Promise.all(Array.from({ length: 7 }, () => diarSlot('h1', async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 10)); live--; })));
    expect(peak).toBe(3);
  });
});

// The GPU compute host (remoteJob): start once, re-attach by job id after a restart, fetch the result; a drain leaves it running.
import { describe, it, expect, beforeAll } from 'vitest';
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

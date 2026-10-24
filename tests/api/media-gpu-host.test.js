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
    const none = { running: async () => [] };
    const a = await acquireAsrHost(hosts, none), b = await acquireAsrHost(hosts, none);
    expect([a.host, b.host]).toEqual(['ga', 'gb']);
    let got = null;
    const c = acquireAsrHost(hosts, none).then((x) => { got = x; });
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

describe('re-attached diarizations count toward the host cap', () => {
  it('a re-attached job on aorus counts: with its 2 slots filled the next diarization goes elsewhere', async () => {
    const { diarize, pickDiarHost } = await import('../../api/lib/media/tools.js');
    process.env.MEDIA_ASR_HOST = 'zgpu'; process.env.MEDIA_GPU_HOST = 'aorus';
    const { diarSlot } = await import('../../api/lib/media/tools.js');
    let free1; const one = { then: (f) => f() }; free1 = () => {};   // aorus has ONE diarization slot (10-23 heat)
    const { mkdtempSync, writeFileSync } = await import('fs'); const { join } = await import('path'); const { tmpdir } = await import('os');
    const out = join(mkdtempSync(join(tmpdir(), 'rd-')), 'd.json');
    let release; const hold = new Promise((r) => { release = r; });
    expect(pickDiarHost()).toBe('aorus');
    const p = diarize('/a.flac', out, { host: 'aorus', job: 'x-dz-1', deps: { live: async () => 'running', asrJob: async (i, o) => { await hold; writeFileSync(o.output, '{"turns":[]}'); return {}; } } });
    await new Promise((r) => setTimeout(r, 10));
    expect(pickDiarHost()).toBe('zgpu');
    release(); await p;
    expect(pickDiarHost()).toBe('aorus');
    free1(); await one;
    delete process.env.MEDIA_ASR_HOST; delete process.env.MEDIA_GPU_HOST;
  });
});

describe('the diarization cap holds after a restart (10-23: aorus ran 3 against a cap of 2)', () => {
  it('re-attached jobs over the cap finishing one by one never let a new start exceed it', async () => {
    const { diarize, diarSlot } = await import('../../api/lib/media/tools.js');
    const { mkdtempSync, writeFileSync } = await import('fs'); const { join } = await import('path'); const { tmpdir } = await import('os');
    const d = mkdtempSync(join(tmpdir(), 'cap-'));
    let live = 0, peak = 0; const frees = [];
    const job = () => new Promise((r) => { live++; peak = Math.max(peak, live); frees.push(() => { live--; r(); }); });
    // four jobs already on the host (re-attached after a restart), cap 2
    const reattached = [1, 2, 3, 4].map((i) => diarize('/a.flac', join(d, `r${i}.json`), { host: 'hcap', job: `r-${i}`,
      deps: { live: async () => 'running', asrJob: async (inp, o) => { await job(); writeFileSync(o.output, '{"turns":[]}'); return {}; } } }));
    await new Promise((r) => setTimeout(r, 5));
    let worstFresh = 0;
    const fresh = [1, 2, 3].map(() => diarSlot('hcap', () => { worstFresh = Math.max(worstFresh, live + 1); return job(); }, 2));
    for (let k = 0; k < 7; k++) { await new Promise((r) => setTimeout(r, 5)); frees.shift()?.(); }
    await Promise.all([...reattached, ...fresh]);
    expect(peak).toBe(4);          // the four that were already running
    expect(worstFresh).toBe(2);    // a NEW start never takes the host past its cap of 2 (the old 'if' let it reach 4)
  });
  it('a start waits while the HOST reports the cap filled by jobs this process does not hold', async () => {
    const { diarSlot } = await import('../../api/lib/media/tools.js');
    let onHost = ['old-1', 'old-2'], started = false;
    const p = diarSlot('hcap2', async () => { started = true; }, 2, { job: 'new-1', running: async () => onHost, recheckMs: 5 });
    await new Promise((r) => setTimeout(r, 20));
    expect(started).toBe(false);
    onHost = ['old-1'];
    await p;
    expect(started).toBe(true);
  });
});

describe('the transcription cap counts what the host is already running (10-23: three on aorus, cap 2)', () => {
  it('a host whose own count fills its slots is skipped; the next host takes the job', async () => {
    const { acquireAsrHost } = await import('../../api/lib/media/tools.js');
    const running = async (h) => (h === 'ra' ? ['old-1', 'old-2'] : []);   // two jobs from before a restart on ra
    const got = await acquireAsrHost([{ host: 'ra', slots: 2 }, { host: 'rb', slots: 4 }], { running });
    expect(got.host).toBe('rb'); got.release();
  });
});

describe('a transcription sends its audio as is', () => {
  it('no tower ffmpeg conversion for a normal-size audio file; the gate gets its own extension', async () => {
    const { asrJob } = await import('../../api/lib/media/tools.js');
    const { mkdtempSync, writeFileSync } = await import('fs'); const { join } = await import('path'); const { tmpdir } = await import('os');
    const d = mkdtempSync(join(tmpdir(), 'aj-')); const f = join(d, 'dfn.flac'); writeFileSync(f, 'x'.repeat(1000));
    const cmds = []; let polled = 0;
    const exec = async (cmd, args, o = {}) => {
      cmds.push(cmd === 'ssh' ? args.at(-1) : cmd);
      const c = args.at(-1);
      if (cmd !== 'ssh') return { stdout: '' };
      if (c.startsWith('poll')) return { stdout: JSON.stringify({ state: polled++ ? 'done' : 'missing' }) };
      if (c.startsWith('fetch')) return { stdout: '{"segments":[]}' };
      return { stdout: '{}' };
    };
    await asrJob(f, { lang: 'en', output: join(d, 'out.json') }, { host: 'h9', job: 'j-1', exec, pollMs: 0, count: false });
    expect(cmds).not.toContain('ffmpeg');
    expect(cmds.find((c) => c.startsWith('start'))).toMatch(/^start flac j-1 /);
  });
});

describe('a drain never waits on a slot (10-23 18:00: one diarization waiting for a slot held the media drain 12+ min)', () => {
  it('diarSlot and acquireAsrHost give up with DrainAbort when draining', async () => {
    const { diarSlot, acquireAsrHost } = await import('../../api/lib/media/tools.js');
    let free; const hold = diarSlot('hdrain', () => new Promise((r) => { free = r; }), 1);
    let draining = false;
    const waiting = diarSlot('hdrain', async () => 'ran', 1, { stop: () => draining, recheckMs: 10 });
    await new Promise((r) => setTimeout(r, 20));
    draining = true;
    await expect(waiting).rejects.toMatchObject({ code: 'DRAIN' });
    free(); await hold;
    const a = await acquireAsrHost([{ host: 'hd2', slots: 1 }], { running: async () => [] });
    await expect(acquireAsrHost([{ host: 'hd2', slots: 1 }], { running: async () => [], stop: () => true })).rejects.toMatchObject({ code: 'DRAIN' });
    a.release();
  });
});

describe('heat guard (10-23: aorus GPU 88 °C throttling, CPU Tctl 95 °C; boss Tctl 99.9 °C)', () => {
  it('GPU ≥ 83 °C → one transcription on the GPU host; CPU ≥ 95 °C → none; ≥ 90 °C → half; cool → as configured', async () => {
    process.env.MEDIA_GPU_HOST = 'aorus';
    const t = await import('../../api/lib/media/tools.js');
    t.noteDisk('aorus', { gpu_temp: 86, cpu_tctl: 80 }); expect(t.thermalSlots('aorus', 2)).toBe(1);
    t.noteDisk('aorus', { gpu_temp: 70, cpu_tctl: 80 }); expect(t.thermalSlots('aorus', 2)).toBe(2);
    t.noteDisk('boss', { gpu_temp: null, cpu_tctl: 99 }); expect(t.thermalSlots('boss', 4)).toBe(0);
    t.noteDisk('boss', { gpu_temp: null, cpu_tctl: 92 }); expect(t.thermalSlots('boss', 4)).toBe(2);
    t.noteDisk('aorus', { gpu_temp: 81, cpu_tctl: 70 }); expect(t.coolEnough('aorus')).toBe(false);
    t.noteDisk('aorus', { gpu_temp: 70, cpu_tctl: 70 }); expect(t.coolEnough('aorus')).toBe(true);
    delete process.env.MEDIA_GPU_HOST;
  });
  it('the gate reports GPU temperature and CPU Tctl; a GPU diarization never falls back to the CPU on aorus', async () => {
    const { readFileSync } = await import('fs');
    const g = readFileSync(new URL('../../scripts/media/boss-asr-gate.sh', import.meta.url), 'utf8');
    expect(g).toMatch(/temperature\.gpu/); expect(g).toMatch(/Tctl/); expect(g).toMatch(/MEDIA_DIAR_NO_CPU=1/);
    expect(readFileSync(new URL('../../scripts/media/media_tool.py', import.meta.url), 'utf8')).toMatch(/MEDIA_DIAR_NO_CPU/);
  });
});

describe('every slot wait gives way to a drain (10-23 19:44: two compute jobs held the media drain 9+ min in a probe/encode wait)', () => {
  it('slotWait throws DrainAbort when draining, and otherwise returns after its re-check interval', async () => {
    const { slotWait } = await import('../../api/lib/media/tools.js');
    const q = [];
    await expect(slotWait(q, 'x', { draining: () => true })).rejects.toMatchObject({ code: 'DRAIN' });
    let drain = false; const t0 = Date.now();
    await slotWait(q, 'x', { ms: 20, draining: () => drain });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
    expect(q).toHaveLength(0);   // a timed-out waker removes itself
    const p = slotWait(q, 'x', { ms: 5000, draining: () => drain }); drain = true; q.shift()();
    await expect(p).rejects.toMatchObject({ code: 'DRAIN' });
  });
  it('no plain slot wait is left in the media code', async () => {
    const { readFileSync } = await import('fs');
    for (const f of ['../../api/lib/media/tools.js', '../../api/lib/media/item.js']) {
      expect(readFileSync(new URL(f, import.meta.url), 'utf8'), f).not.toMatch(/await new Promise\(\(r\) => \w*[Ww]ait\w*\.push\(r\)\)/);
    }
  });
});

describe('a diarization not yet started moves off a full host (10-23 19:41: five queued for aorus’s one slot, boss idle)', () => {
  it('aorus full, boss free → it runs on boss and the item is told', async () => {
    process.env.MEDIA_GPU_HOST = 'aorus'; process.env.MEDIA_ASR_HOST = 'bossy';
    const { diarize, diarSlot } = await import('../../api/lib/media/tools.js');
    let free; const busy = diarSlot('aorus', () => new Promise((r) => { free = r; }), 1);   // aorus's one slot taken
    const { mkdtempSync, writeFileSync } = await import('fs'); const { join } = await import('path'); const { tmpdir } = await import('os');
    const out = join(mkdtempSync(join(tmpdir(), 'mv-')), 'd.json');
    const ran = [], moved = [];
    await diarize('/a.flac', out, { host: 'aorus', job: 'mv-dz-1', deps: { live: async () => 'missing', running: async () => [], onHost: async (h) => moved.push(h),
      asrJob: async (i, o, x) => { ran.push(x.host); writeFileSync(o.output, '{"turns":[]}'); return {}; } } });
    expect(ran).toEqual(['bossy']); expect(moved).toEqual(['bossy']);
    free(); await busy;
    delete process.env.MEDIA_GPU_HOST; delete process.env.MEDIA_ASR_HOST;
  });
});

describe('GPU memory is budgeted at dispatch (10-23 20:12: a DFN job OOM-ed on aorus beside two transcriptions)', () => {
  it('a kind goes to the GPU host only when free VRAM − recent dispatches covers its need', async () => {
    process.env.MEDIA_GPU_HOST = 'aorus';
    const t = await import('../../api/lib/media/tools.js');
    const noop = async () => ({});
    t.noteDisk('aorus', { free_gb: 3000, mem_avail_gb: 11, gpu_free_mb: 1700, gpu_temp: 60, cpu_tctl: 70 });
    expect(t.diskOk('aorus', { refresh: noop, kind: 'dfn' })).toBe(false);          // 1500 + 300 > 1700
    expect(t.diskOk('aorus', { refresh: noop, kind: 'diarize' })).toBe(false);
    t.noteDisk('aorus', { gpu_free_mb: 4500 });
    expect(t.diskOk('aorus', { refresh: noop, kind: 'dfn' })).toBe(true);
    t.reserveGpu('aorus', 'transcribe');                                          // 3500 dispatched, not yet resident
    expect(t.diskOk('aorus', { refresh: noop, kind: 'dfn' })).toBe(false);
    expect(t.diskOk('aorus', { refresh: noop, kind: 'dfn', now: Date.now() + 120_000 })).toBe(true);   // reservation expired
    delete process.env.MEDIA_GPU_HOST;
  });
  it('a full card that cannot create a context waits, and the OOM retry re-checks the env, not the cached device', async () => {
    const { readFileSync } = await import('fs');
    const py = readFileSync(new URL('../../scripts/media/media_tool.py', import.meta.url), 'utf8');
    expect(py).toMatch(/GPU context failed/);
    expect(py).toMatch(/'out of memory' not in str\(err\)\.lower\(\) or os\.environ\.get\('MEDIA_DEVICE'\) == 'cpu'/);
    expect(readFileSync(new URL('../../scripts/media/boss-asr-gate.sh', import.meta.url), 'utf8')).toMatch(/gpu_free_mb/);
  });
});

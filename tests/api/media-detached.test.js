// Detached long work survives the service's drains: the boss ASR job keeps running and is re-attached; the tower-side
// diarization process keeps running and the resumed stage waits for it (10-22: deploys kept killing a 15-minute stage).
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { asrJob, detachedTool } from '../../api/lib/media/tools.js';

describe('asrJob (detached transcription on the ASR host)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asrjob-'));
  const audio = join(dir, 'a.flac');
  writeFileSync(audio, 'x');
  it('a drain leaves the remote job running (no cancel); the resumed stage re-attaches and fetches', async () => {
    let state = 'missing';
    const calls = [];
    const exec = vi.fn(async (cmd, args) => {
      const c = args[args.length - 1]; calls.push(c.split(' ')[0]);
      if (cmd === 'ffmpeg') return { stdout: '' };
      if (c.startsWith('poll')) return { stdout: JSON.stringify({ state }) };
      if (c.startsWith('start')) { state = 'running'; return { stdout: '{"started":true}' }; }
      if (c.startsWith('fetch')) return { stdout: '{"segments":[]}' };
      return { stdout: '{}' };
    });
    await expect(asrJob(audio, { output: join(dir, 'out.json') }, { host: 'h', job: 'job-1', exec, stop: () => true, pollMs: 10, onStart: async () => {} }))
      .rejects.toMatchObject({ code: 'DRAIN' });
    expect(calls).not.toContain('cancel');
    state = 'done';
    const r = await asrJob(audio, { output: join(dir, 'out.json') }, { host: 'h', job: 'job-1', exec, pollMs: 10 });
    expect(r).toMatchObject({ job: 'job-1', reattached: true });
    expect(calls.filter((c) => c === 'start')).toHaveLength(1);   // never started twice
  });
});

describe('detachedTool (tower-side, survives a drain)', () => {
  it('stops waiting on a drain without killing the process; the next call waits for its result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'det-'));
    const fake = join(dir, 'fakepy.sh');
    // stands in for python media_tool.py: a second of work, then its JSON line (the name keeps "media_tool" in argv)
    writeFileSync(fake, '#!/bin/sh\nsleep 1\necho \'{"ok":true}\'\n'); chmodSync(fake, 0o755);
    process.env.MEDIA_PYTHON = fake;
    const pidFile = join(dir, 'diarization.pid');
    await expect(detachedTool('diarize', 'in.flac', {}, { pidFile, stop: () => true, pollMs: 20 })).rejects.toMatchObject({ code: 'DRAIN' });
    const r = await detachedTool('diarize', 'in.flac', {}, { pidFile, pollMs: 50 });
    expect(r).toEqual({ ok: true });
    delete process.env.MEDIA_PYTHON;
  });
});

describe('diarization runs on boss; tower only as a guarded fallback (10-22 watch: search 6.6–8.6 s)', async () => {
  const { diarize } = await import('../../api/lib/media/tools.js');
  const { mkdtempSync, readFileSync } = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  const out = () => join(mkdtempSync(join(tmpdir(), 'dz-')), 'diarization.json');
  it('boss: turns come back on stdout and are written to the output file', async () => {
    const o = out();
    const remote = vi.fn(async (sub, input, opts) => { expect(sub).toBe('diarize'); expect(opts['emit-turns']).toBe(true); return { speakers: 2, turns: 3, turn_list: [{ start: 0, end: 1, speaker: 'S1' }], threshold: 0.7, emb: 'x' }; });
    const detached = vi.fn();
    const r = await diarize('/a.flac', o, { host: 'boss', remote, detached });
    expect(r).toMatchObject({ host: 'boss', speakers: 2 });
    expect(JSON.parse(readFileSync(o, 'utf8')).turns).toHaveLength(1);
    expect(detached).not.toHaveBeenCalled();
  });
  it('boss unreachable: tower runs it with ≤ 4 threads, only once search p90 ≤ 4 s', async () => {
    const remote = async (sub, input, opts, { local }) => local();
    const detached = vi.fn(async () => ({ speakers: 1 }));
    const p90s = [6.6, 8.1, 3.2];
    const r = await diarize('/a.flac', out(), { host: 'boss', remote, detached, p90: async () => p90s.shift(), pause: async () => {}, towerThreads: 12 });
    expect(r.host).toBe('tower');
    expect(detached.mock.calls[0][3].threads).toBe(4);
    expect(p90s).toEqual([]);
  });
  it('gives up rather than slow search', async () => {
    let now = 0;
    const realNow = Date.now; Date.now = () => (now += 20 * 60_000);
    try {
      await expect(diarize('/a.flac', out(), { host: null, detached: vi.fn(), p90: async () => 7, pause: async () => {} })).rejects.toThrow(/deferred/);
    } finally { Date.now = realNow; }
  });
});

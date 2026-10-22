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

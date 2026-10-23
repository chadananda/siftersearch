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

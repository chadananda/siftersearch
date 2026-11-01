// quality.py's ffmpeg streams never deadlock on stderr (tower job 2530, 10-31: ffmpeg blocked writing a full stderr PIPE, python blocked reading
// stdout, 1 h 40 m at 0 % CPU). A fake ffmpeg that writes 200 KB of errors before its samples must finish, and a failing one must say why.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const WORKER = resolve('scripts/media/worker');
const fake = (code) => {
  const dir = mkdtempSync(join(tmpdir(), 'ffq-'));
  writeFileSync(join(dir, 'ffmpeg'), `#!/usr/bin/env python3\nimport sys\nsys.stderr.write('x'*200000);sys.stderr.flush()\nsys.stdout.buffer.write(b'\\0'*96000)\nsys.exit(${code})\n`);
  chmodSync(join(dir, 'ffmpeg'), 0o755);
  return dir;
};
const run = (dir) => spawnSync('python3', ['-c', `import sys;sys.path.insert(0,${JSON.stringify(WORKER)});import quality\ntry:print(quality.decoded_seconds('in.m4a'))\nexcept Exception as e:print('ERR',str(e)[:40])`],
  { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, timeout: 20_000, encoding: 'utf8' });

describe('quality.py ffmpeg pipes', () => {
  it('a decode that floods stderr still completes (1 s of 48 kHz s16 mono)', () => {
    const r = run(fake(0));
    expect(r.error).toBeUndefined();
    expect(r.stdout.trim()).toBe('1.0');
  });
  it('a failed decode raises with the tail of its stderr', () => {
    expect(run(fake(1)).stdout.trim()).toMatch(/^ERR reference decode failed: x+/);
  });
});

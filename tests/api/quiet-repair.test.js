// Silence-only repair of published remasters (media/quiet-repair.js): swap only a verified same-length copy, keep a backup, redo web.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { quietRecord, probeMismatch, quietMaster } from '../../api/lib/media/quiet-repair.js';

const talk = () => {
  const dir = mkdtempSync(join(tmpdir(), 'quiet-')); mkdirSync(join(dir, 'enhanced'));
  writeFileSync(join(dir, 'enhanced', 'unipase.flac'), Buffer.alloc(2e6, 1));
  writeFileSync(join(dir, 'enhanced', 'realign.json'), '{"times":{}}');
  writeFileSync(join(dir, 'transcript.work.json'), '{"paragraphs":[]}');
  return { id: 7, slug: 'x-talk', dir };
};
// a fake host: the container finishes at once; report/probe/out come from `result`
const fakeT = (result, log = []) => ({ run: async (cmd, args) => {
  log.push([cmd, ...args].join(' '));
  if (cmd === 'rsync') { const to = args.at(-1); if (!to.includes(':')) writeFileSync(to, Buffer.alloc(3e6, 0)); return { stdout: '' }; }
  const c = args[1];
  if (c.includes('inspect') && c.includes('.State')) return { stdout: log.some((l) => l.includes('docker run')) ? '{"Running":false,"ExitCode":0}' : 'null' };
  if (c.includes('report.json')) return { stdout: JSON.stringify(result.report) };
  if (c.includes('probe.json')) return { stdout: JSON.stringify(result.probe) };
  return { stdout: '' };
} });

describe('quiet repair', () => {
  it('quietRecord sums the voiced stretches kept', () => {
    expect(quietRecord({ quiet_s: 30, stretches: 4, loud_s: 12.5, voiced_kept: [[1, 3.5, 0.6], [10, 11, 0.5]] })).toMatchObject({ v: 1, quiet_s: 30, noise_silenced_s: 12.5, voiced_kept_s: 3.5 });
  });
  it('probeMismatch refuses a copy whose length or format moved', () => {
    expect(probeMismatch({ in: [48000, 1, 100], out: [48000, 1, 100.01] })).toBeNull();
    expect(probeMismatch({ in: [48000, 1, 100], out: [48000, 1, 99] })).toMatch(/length/);
    expect(probeMismatch({ in: [48000, 1, 100], out: [44100, 1, 100] })).toMatch(/format/);
    expect(probeMismatch({ in: [48000, 1, 100], out: null })).toMatch(/no output/);
  });
  it('swaps in the silenced master and keeps the old one as a backup', async () => {
    const it0 = talk(), log = [];
    const r = await quietMaster(it0, { T: fakeT({ report: { quiet_s: 20, stretches: 2, loud_s: 9 }, probe: { in: [48000, 1, 50], out: [48000, 1, 50] } }, log), host: 'aorus', image: 'img', nap: async () => {} });
    expect(r.changed).toBe(true);
    expect(readFileSync(join(it0.dir, 'enhanced', 'unipase.flac'))[0]).toBe(0);
    expect(readFileSync(join(it0.dir, 'enhanced', 'unipase.prequiet.flac'))[0]).toBe(1);
    expect(log.some((l) => /docker run -d .*--network none/.test(l) && !/--gpus/.test(l))).toBe(true);
  });
  it('leaves the master untouched when the copy is the wrong length', async () => {
    const it0 = talk();
    await expect(quietMaster(it0, { T: fakeT({ report: { quiet_s: 20, stretches: 2 }, probe: { in: [48000, 1, 50], out: [48000, 1, 40] } }), host: 'aorus', image: 'img', nap: async () => {} })).rejects.toThrow(/length/);
    expect(readFileSync(join(it0.dir, 'enhanced', 'unipase.flac'))[0]).toBe(1);
    expect(existsSync(join(it0.dir, 'enhanced', 'unipase.prequiet.flac'))).toBe(false);
  });
  it('nothing word-free → unchanged, no swap', async () => {
    const it0 = talk();
    const r = await quietMaster(it0, { T: fakeT({ report: { quiet_s: 0, stretches: 0 }, probe: { in: [48000, 1, 50], out: null } }), host: 'aorus', image: 'img', nap: async () => {} });
    expect(r.changed).toBe(false);
    expect(existsSync(join(it0.dir, 'enhanced', 'unipase.prequiet.flac'))).toBe(false);
  });
  it('no word timings on the master → refuses (needs a full redo)', async () => {
    const it0 = talk(); writeFileSync(join(it0.dir, 'enhanced', 'realign.json'), ''); await import('fs').then((f) => f.rmSync(join(it0.dir, 'enhanced', 'realign.json')));
    await expect(quietMaster(it0, { T: fakeT({}), host: 'aorus', image: 'img' })).rejects.toThrow(/realign/);
  });
});

// podVerdict (pod-post.js): tower refuses a worker result BY NAME — an old image's result says "re-image", never a silent re-queue loop (10-30).
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import { podVerdict, podComplete, sha256File, CONTRACT } from '../../api/lib/media/pod-post.js';
import { adoptRestoreResult } from '../../api/lib/media/restore-job.js';

async function talk(post) {
  const dir = await mkdtemp(join(tmpdir(), 'talk-')), pod = join(dir, 'enhanced', 'pod');
  await mkdir(pod, { recursive: true });
  await writeFile(join(dir, 'transcript.work.json'), '{"words":[]}');
  await writeFile(join(pod, 'unipase.flac'), 'x');
  const work_sha = await sha256File(join(dir, 'transcript.work.json'));
  await writeFile(join(pod, 'post.json'), JSON.stringify({ ok: true, guard: {}, work_sha, contract: CONTRACT.post, ...post }));
  return dir;
}
const full = { realign: {}, quiet: {}, web: {} };

describe('worker result contract', () => {
  it('accepts a complete result at the current contract', async () => {
    expect(await podVerdict(await talk(full))).toEqual({ ok: true, why: null });
    expect(await podComplete(await talk(full))).toBe(true);
  });
  it('names an old image (no contract stamp) instead of silently rejecting', async () => {
    const v = await podVerdict(await talk({ ...full, contract: undefined }));
    expect(v).toMatchObject({ ok: false, stale_image: true });
    expect(v.why).toMatch(/worker image too old/);
  });
  it('names the missing piece', async () => {
    const v = await podVerdict(await talk({ realign: {}, web: {} }));
    expect(v.ok).toBe(false);
    expect(v.why).toMatch(/missing quiet/);
  });
  it('a held verdict needs no encodes', async () => {
    expect((await podVerdict(await talk({ held: true }))).ok).toBe(true);
  });
  it('refuses a result aligned to an older transcript', async () => {
    const dir = await talk(full);
    await writeFile(join(dir, 'transcript.work.json'), '{"words":[1]}');
    expect((await podVerdict(dir)).why).toMatch(/transcript changed/);
  });
  it('post.py stamps the contract tower checks', async () => {
    const py = await readFile(new URL('../../scripts/media/worker/post.py', import.meta.url), 'utf8');
    expect(py).toMatch(/result-contract\.json'\)\)\)\['post'\]/);
    expect(CONTRACT.requires).toEqual(expect.arrayContaining(['realign', 'quiet', 'web']));
  });
});

// adoptRestoreResult (restore-job.js): the ONE intake every transport (home, gate, pod) lands a restore result through.
describe('adoptRestoreResult', () => {
  const web = { ogg: 'x.ogg', m4a: 'x.m4a' };
  async function staged(post, { skip = [] } = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'adopt-')), stage = join(dir, 'enhanced', 'pod-stage');
    await mkdir(stage, { recursive: true });
    await writeFile(join(dir, 'transcript.work.json'), '{"words":[]}');
    const work_sha = await sha256File(join(dir, 'transcript.work.json'));
    for (const f of ['unipase.flac', 'unipase.guard.json', 'realign.json', ...Object.values(web)]) if (!skip.includes(f)) await writeFile(join(stage, f), f);
    await writeFile(join(stage, 'post.json'), JSON.stringify({ ok: true, guard: {}, work_sha, contract: CONTRACT.post, realign: {}, quiet: {}, web, ...post }));
    return { dir, stage };
  }
  it('flat web copies move under web/ and the stage becomes enhanced/pod', async () => {
    const { dir, stage } = await staged({});
    await adoptRestoreResult(dir, stage);
    expect(existsSync(stage)).toBe(false);
    expect(await readFile(join(dir, 'enhanced', 'pod', 'web', 'x.ogg'), 'utf8')).toBe('x.ogg');
  });
  it('a missing result file is refused and the stage discarded', async () => {
    const { dir, stage } = await staged({}, { skip: ['x.m4a'] });
    await expect(adoptRestoreResult(dir, stage)).rejects.toThrow(/missing files: x.m4a/);
    expect(existsSync(stage)).toBe(false); expect(existsSync(join(dir, 'enhanced', 'pod'))).toBe(false);
  });
  it('an old image is refused by name with stale_image', async () => {
    const { dir, stage } = await staged({ contract: undefined });
    const e = await adoptRestoreResult(dir, stage).catch((x) => x);
    expect(e.message).toMatch(/worker image too old/); expect(e.stale_image).toBe(true);
    expect(existsSync(join(dir, 'enhanced', 'pod'))).toBe(false);
  });
  it('a result for an older transcript is refused', async () => {
    const { dir, stage } = await staged({ work_sha: 'nope' });
    await expect(adoptRestoreResult(dir, stage)).rejects.toThrow(/transcript changed/);
  });
});

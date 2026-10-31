// podVerdict (pod-post.js): tower refuses a worker result BY NAME — an old image's result says "re-image", never a silent re-queue loop (10-30).
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import { podVerdict, podComplete, sha256File, CONTRACT } from '../../api/lib/media/pod-post.js';
import { adoptRestoreResult } from '../../api/lib/media/restore-job.js';
import { wordsKeyFile } from '../../api/lib/media/words-key.js';

const WORK = JSON.stringify({ paragraphs: [{ n: 1, lang: 'en', words: [{ w: 'O', s: 1, e: 1.2 }, { w: 'Son', s: 1.2, e: 1.6 }] }] });
const retimed = () => JSON.stringify({ paragraphs: [{ n: 1, lang: 'en', words: [{ w: 'O', s: 1.03, e: 1.21, s0: 1, e0: 1.2 }, { w: 'Son', s: 1.22, e: 1.63, s0: 1.2, e0: 1.6 }] }] });
const reworded = () => JSON.stringify({ paragraphs: [{ n: 1, lang: 'en', words: [{ w: 'O', s: 1, e: 1.2 }, { w: 'Sun', s: 1.2, e: 1.6 }] }] });

async function talk(post) {
  const dir = await mkdtemp(join(tmpdir(), 'talk-')), pod = join(dir, 'enhanced', 'pod');
  await mkdir(pod, { recursive: true });
  await writeFile(join(dir, 'transcript.work.json'), WORK);
  await writeFile(join(pod, 'unipase.flac'), 'x');
  const words_key = await wordsKeyFile(join(dir, 'transcript.work.json'));
  await writeFile(join(pod, 'post.json'), JSON.stringify({ ok: true, guard: {}, words_key, contract: CONTRACT.post, ...post }));
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
    await writeFile(join(dir, 'transcript.work.json'), reworded());
    expect((await podVerdict(dir)).why).toMatch(/transcript words changed/);
  });
  it('a timing re-stamp on tower (realign) keeps the result valid — wordsKey, not the file bytes (stage-queue §5)', async () => {
    const dir = await talk(full);
    await writeFile(join(dir, 'transcript.work.json'), retimed());
    expect(await podVerdict(dir)).toEqual({ ok: true, why: null });
  });
  it('a v2 result (whole-file work_sha, pre-fix image) is refused BY NAME even when its sha still matches', async () => {
    const dir = await talk({ ...full, words_key: undefined, contract: 2, work_sha: await sha256File(join(await talk(full), 'transcript.work.json')) });
    const v = await podVerdict(dir);
    expect(v).toMatchObject({ ok: false, stale_image: true }); expect(v.why).toMatch(/v2 < v3/);
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
    await writeFile(join(dir, 'transcript.work.json'), WORK);
    const words_key = await wordsKeyFile(join(dir, 'transcript.work.json'));
    for (const f of ['unipase.flac', 'unipase.guard.json', 'realign.json', ...Object.values(web)]) if (!skip.includes(f)) await writeFile(join(stage, f), f);
    await writeFile(join(stage, 'post.json'), JSON.stringify({ ok: true, guard: {}, words_key, contract: CONTRACT.post, realign: {}, quiet: {}, web, ...post }));
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
    const { dir, stage } = await staged({ words_key: 'nope' });
    await expect(adoptRestoreResult(dir, stage)).rejects.toThrow(/transcript words changed/);
  });
  it('a result whose transcript was only re-timed since the job was staged is adopted', async () => {
    const { dir, stage } = await staged({});
    await writeFile(join(dir, 'transcript.work.json'), retimed());
    await adoptRestoreResult(dir, stage);
    expect(existsSync(join(dir, 'enhanced', 'pod', 'post.json'))).toBe(true);
  });
  it('a failed worker result names the worker\'s reason', async () => {
    const { dir, stage } = await staged({ ok: false, why: 'work.json missing or changed' });
    await expect(adoptRestoreResult(dir, stage)).rejects.toThrow(/worker failed: work.json missing or changed/);
  });
});

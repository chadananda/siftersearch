// podVerdict (pod-post.js): tower refuses a worker result BY NAME — an old image's result says "re-image", never a silent re-queue loop (10-30).
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { podVerdict, podComplete, sha256File, CONTRACT } from '../../api/lib/media/pod-post.js';

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

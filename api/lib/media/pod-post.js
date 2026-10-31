// What a worker already did for a remaster (scripts/media/worker/post.py): the word guard, the re-alignment and the four web encodes, placed by
// the cloud lane in <talk>/enhanced/pod/. Tower validates (the transcript the worker used is still THE transcript) and takes the files; anything
// missing or stale is simply computed on tower as before. Each piece is consumed once.
import { readFile, writeFile, rename, copyFile, rm, mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { wordsKeyFile } from './words-key.js';

export const sha256File = async (f) => createHash('sha256').update(await readFile(f)).digest('hex');
export const podDir = (dir) => join(dir, 'enhanced', 'pod');
/** Is a worker result (post.json) for this talk's CURRENT words? Contract v3 carries `words_key` (timings never invalidate it, stage-queue §5);
 *  an older result only has the whole-file `work_sha` (and is refused by name as an old image in podVerdict anyway). */
export async function resultMatches(post, dir) {
  const work = join(dir, 'transcript.work.json');
  if (post?.words_key) return post.words_key === await wordsKeyFile(work);
  return !!post?.work_sha && post.work_sha === await sha256File(work);
}

/** → the worker's post.json when it is usable for this talk's CURRENT transcript, else null. */
export async function podPost(dir, { needFlac = true } = {}) {
  try {
    const post = JSON.parse(await readFile(join(podDir(dir), 'post.json'), 'utf8'));
    if (!post?.ok || !post.guard || !(post.words_key || post.work_sha)) return null;
    if (!await resultMatches(post, dir)) return null;   // the transcript's words changed since the worker aligned to them
    if (needFlac && !existsSync(join(podDir(dir), 'unipase.flac'))) return null;
    return post;
  } catch { return null; }
}
/** Move a pod file into place (same filesystem: a rename). */
export async function take(dir, name, to) {
  await mkdir(dirname(to), { recursive: true });
  await rename(join(podDir(dir), name), to).catch(async () => { await copyFile(join(podDir(dir), name), to); await rm(join(podDir(dir), name), { force: true }); });
}
export const forget = (dir) => rm(podDir(dir), { recursive: true, force: true });

/** A worker result tower can publish without touching audio: a held verdict, or guard + alignment + silencing + all four encodes.
 *  `quiet` (Chad 10-29): a copy whose word-free stretches were not silenced carries the restorer's noise — never published. */
export async function podComplete(dir) {
  return (await podVerdict(dir)).ok;
}
/** The contract both sides read (scripts/media/worker/result-contract.json): a result from an older image is refused BY NAME, never silently. */
export const CONTRACT = JSON.parse(readFileSync(new URL('../../../scripts/media/worker/result-contract.json', import.meta.url), 'utf8'));
/** → { ok, why }: why the worker result in <talk>/enhanced/pod cannot be published (stale transcript, old image, missing pieces). */
export async function podVerdict(dir) {
  let raw = null;
  try { raw = JSON.parse(await readFile(join(podDir(dir), 'post.json'), 'utf8')); } catch { return { ok: false, why: 'no worker result' }; }
  if (!raw?.ok || !raw.guard || !(raw.words_key || raw.work_sha)) return { ok: false, why: `worker result not usable: ${raw?.why || 'no guard'}` };
  if ((raw.contract || 1) < CONTRACT.post) return { ok: false, stale_image: true, why: `worker image too old (result contract v${raw.contract || 1} < v${CONTRACT.post}): re-image the worker` };
  const post = await podPost(dir);
  if (!post) return { ok: false, why: 'transcript words changed since the worker aligned to them' };
  if (post.held) return { ok: true, why: null };
  const missing = CONTRACT.requires.filter((k) => !post[k]);
  return missing.length ? { ok: false, why: `worker result missing ${missing.join(', ')}${post.why ? ` (${post.why})` : ''}` } : { ok: true, why: null };
}

// What a worker already did for a remaster (scripts/media/worker/post.py): the word guard, the re-alignment and the four web encodes, placed by
// the cloud lane in <talk>/enhanced/pod/. Tower validates (the transcript the worker used is still THE transcript) and takes the files; anything
// missing or stale is simply computed on tower as before. Each piece is consumed once.
import { readFile, writeFile, rename, copyFile, rm, mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

export const sha256File = async (f) => createHash('sha256').update(await readFile(f)).digest('hex');
export const podDir = (dir) => join(dir, 'enhanced', 'pod');

/** → the worker's post.json when it is usable for this talk's CURRENT transcript, else null. */
export async function podPost(dir, { needFlac = true } = {}) {
  try {
    const post = JSON.parse(await readFile(join(podDir(dir), 'post.json'), 'utf8'));
    if (!post?.ok || !post.guard || !post.work_sha) return null;
    if (post.work_sha !== await sha256File(join(dir, 'transcript.work.json'))) return null;   // the transcript changed since the pod aligned to it
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
/** After tower's own alignment rewrote transcript.work.json from a VALID worker result, the result (its encodes) is valid for the new file. */
export async function resign(dir) {
  try {
    const f = join(podDir(dir), 'post.json'), post = JSON.parse(await readFile(f, 'utf8'));
    post.work_sha = await sha256File(join(dir, 'transcript.work.json'));
    await writeFile(f, JSON.stringify(post));
  } catch { /* no worker result */ }
}

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
  if (!raw?.ok || !raw.guard || !raw.work_sha) return { ok: false, why: `worker result not usable: ${raw?.why || 'no guard'}` };
  if ((raw.contract || 1) < CONTRACT.post) return { ok: false, stale_image: true, why: `worker image too old (result contract v${raw.contract || 1} < v${CONTRACT.post}): re-image the worker` };
  const post = await podPost(dir);
  if (!post) return { ok: false, why: 'transcript changed since the worker aligned to it' };
  if (post.held) return { ok: true, why: null };
  const missing = CONTRACT.requires.filter((k) => !post[k]);
  return missing.length ? { ok: false, why: `worker result missing ${missing.join(', ')}${post.why ? ` (${post.why})` : ''}` } : { ok: true, why: null };
}

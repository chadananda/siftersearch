// A restore/post job for ANY worker transport (home docker, gate, pod, queue): the post.py config, the input files, and tower's one intake.
// Was built three times (home-recording, gate-recording, the pod lane) and drifted (home/gate never sent hum_hz or max_fallback_pct). Deps: enhance, pod-post
import { join, extname } from 'node:path';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { safeChain, OGG_ARGS, OGG_ARGS_REMASTER, M4A_BITRATE_REMASTER } from './enhance.js';
import { sha256File, podVerdict, resultMatches } from './pod-post.js';
import { wordsKeyFile } from './words-key.js';

const SAFE = /^[a-z0-9_.-]+$/i;

/** post.py's job config. `full` (an accepted whole-capable image) adds quality assessment + trim; a legacy image only cleans up. */
export async function restoreCfg(it, m, { mode = 'restore', full = true } = {}) {
  const orig = (m.enhancement?.variants || []).find((v) => v.name === 'original') || {};
  const raw = m.quality?.raw || {}, hum = Math.max(raw.hum50_db ?? 0, raw.hum60_db ?? 0) >= 10 ? ((raw.hum50_db ?? 0) >= (raw.hum60_db ?? 0) ? 50 : 60) : null;
  return { mode, cleanup: !full, ...(full ? { assess_quality: true, trim: m.trim } : {}), bw_khz: raw.bandwidth_khz ?? null, hum_hz: hum,
    audio_s: m.duration_s || it.duration_s, af: safeChain(orig), max_fallback_pct: Number(process.env.MEDIA_REMASTER_MAX_FALLBACK_PCT) || 15,
    slug: m.slug || it.slug, words_key: await wordsKeyFile(join(it.dir, 'transcript.work.json')),
    work_sha: await sha256File(join(it.dir, 'transcript.work.json')),   // only so an older image answers 'image too old' by name, not 'work.json changed'
    ogg: ['-ac', '1', '-ar', '48000', ...OGG_ARGS_REMASTER], m4a: ['-ac', '1', '-ar', '48000', '-c:a', 'aac', '-b:a', M4A_BITRATE_REMASTER, '-movflags', '+faststart'],
    orig_ogg: ['-ac', '1', '-ar', '48000', ...OGG_ARGS], orig_m4a: ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart'] };
}

/** → [[local file, job name]] the worker needs: the original (unless `original:false`), the transcript, and for `post` the restored copy tower holds. */
export function restoreInputs(it, m, mode, { original = true } = {}) {
  const enh = (f) => join(it.dir, 'enhanced', f);
  return [
    ...(original ? [[join(it.dir, m.original), 'in' + extname(m.original).toLowerCase()]] : []),
    [join(it.dir, 'transcript.work.json'), 'work.json'],
    ...(mode === 'post' ? [[enh('unipase.cloud.flac'), 'out.flac'], [enh('unipase.asr.json'), 'asr.json'], [enh('unipase.asr_orig.json'), 'asr_orig.json']] : []),
    ...(mode === 'cleanup' ? [[join(it.dir, 'transcript.raw.json'), 'asr_orig.json']] : []),
  ].filter(([f, name]) => name !== 'asr_orig.json' || existsSync(f));
}

/** The worker files to fetch for a result: post/<f> → where it lands in the stage dir. */
export const resultFiles = (post) => [
  ...['unipase.flac', 'unipase.guard.json', ...(post.realign ? ['realign.json'] : []), ...(post.waveform_file ? [post.waveform_file] : [])].map((f) => [f, f]),
  ...Object.values(post.web || {}).map((f) => [f, join('web', f)]),
].map(([f, to]) => { if (!SAFE.test(f)) throw Error(`unsafe worker output path: ${f}`); return [f, to]; });

/** Tower's ONE intake: a stage dir holding post.json + the result files (web copies flat or under web/) becomes <talk>/enhanced/pod,
 *  only when podVerdict accepts it — otherwise it throws the named reason and the stage is discarded. */
export async function adoptRestoreResult(dir, stage) {
  const post = JSON.parse(await fs.readFile(join(stage, 'post.json'), 'utf8'));
  if (!post.ok || !await resultMatches(post, dir)) { await fs.rm(stage, { recursive: true, force: true }); throw Error(`stale or incomplete worker result (${post.ok ? 'transcript words changed' : `worker failed: ${post.why || 'no reason'}`})`); }
  await fs.mkdir(join(stage, 'web'), { recursive: true });
  for (const [f, to] of resultFiles(post)) if (to !== f && existsSync(join(stage, f)) && !existsSync(join(stage, to))) await fs.rename(join(stage, f), join(stage, to));
  const lost = (post.guard && !post.held ? resultFiles(post) : []).filter(([, to]) => !existsSync(join(stage, to))).map(([f]) => f);
  if (lost.length) { await fs.rm(stage, { recursive: true, force: true }); throw Error(`worker result missing files: ${lost.join(', ')}`); }
  const pd = join(dir, 'enhanced', 'pod');
  await fs.rm(pd, { recursive: true, force: true }); await fs.rename(stage, pd);
  const v = await podVerdict(dir);
  if (!v.ok) { await fs.rm(pd, { recursive: true, force: true }); const e = Error(`worker result refused: ${v.why}`); e.stale_image = !!v.stale_image; throw e; }
  return post;
}

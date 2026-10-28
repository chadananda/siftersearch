// Media supersede: replace a published talk's source audio with a better file, keeping slug/doc/title/speaker/tags/URL, the old
// original + meta + transcripts + web copies under <dir>/original-superseded/vN/ (revert restores vN). Light FS moves + repo calls
// only; the re-run is the normal media-item job from 'archive' (heavy stages go to workers). Plan: tmp/collection-08 quality notes.
import { readFile, writeFile, rename, mkdir, readdir, cp, rm, stat, realpath, link, copyFile, chmod } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename, relative, sep } from 'node:path';

export const SUPERSEDED_DIR = 'original-superseded';
const NO_SNAPSHOT = new Set([SUPERSEDED_DIR, 'original']);   // 'original' is moved, everything else copied
// fields of meta.json that describe the OLD audio (kept in the snapshot; the re-run rebuilds them)
const AUDIO_FIELDS = ['web_original', 'web_listening', 'web_codec', 'enhancement', 'aligned_to', 'remaster_tier', 'audio_alignment_version', 'audio_publish_pending',
  'enc_jobs', 'quality', 'qa', 'trim', 'peaks', 'asr', 'asr_lang', 'asr_loops_repaired'];

const words = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
const shingles = (w, n = 8) => { const s = new Set(); for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(' ')); return s; };
/** Share of the sample's 8-word shingles found in the held transcript (null when the sample is too short to say). */
export function sampleOverlap(sampleText, heldText) {
  const a = shingles(words(sampleText)); if (a.size < 15) return null;
  const b = shingles(words(heldText)); let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return Math.round((hit / a.size) * 100) / 100;
}

/** Is the new file the same talk? Needs evidence: its duration, and a transcript sample for the content check. force + reason overrides. */
export function supersedeGuard({ held = {}, next = {}, force = false, reason = '' } = {}) {
  const problems = [];
  const ratio = held.duration_s && next.duration_s ? Math.round((next.duration_s / held.duration_s) * 100) / 100 : null;
  const overlap = next.sample_text ? sampleOverlap(next.sample_text, held.text) : (next.overlap ?? null);
  if (ratio == null) problems.push('no duration evidence for the new file (evidence.duration_s)');
  else if (ratio < 0.5 || ratio > 2.2) problems.push(`duration ratio ${ratio} is outside 0.5 to 2.2`);
  if (overlap == null) problems.push('no transcript evidence (evidence.sample_text, or evidence.overlap) to show it is the same talk');
  else if (overlap < 0.4) problems.push(`transcript overlap ${overlap} is below 0.4: possibly a different talk`);
  const forced = problems.length > 0 && force && String(reason).trim().length >= 10;
  return { ok: problems.length === 0 || forced, forced, problems, ratio, overlap };
}

export const sha256Of = (path) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const readJson = async (p, d = null) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };
let seq = 0;
async function writeJson(p, v) { const t = `${p}.${process.pid}.${++seq}.tmp`; await writeFile(t, JSON.stringify(v, null, 1)); await rename(t, p); }
const inside = (root, p) => { const r = relative(root, p); return r && !r.startsWith('..') && !r.startsWith(sep); };
const versions = async (dir) => (await readdir(join(dir, SUPERSEDED_DIR)).catch(() => [])).map((x) => /^v(\d+)$/.exec(x)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);

/** Move the current original out and copy the rest of the item folder + meta.json into <dir>/original-superseded/v<n>/. */
export async function snapshotItem(dir, n) {
  const to = join(dir, SUPERSEDED_DIR, `v${n}`);
  await mkdir(to, { recursive: true });
  if (existsSync(join(to, 'original'))) throw new Error(`v${n} already exists`);
  for (const e of await readdir(dir)) {
    if (NO_SNAPSHOT.has(e) || e.endsWith('.tmp')) continue;
    await cp(join(dir, e), join(to, e), { recursive: true });
  }
  await rename(join(dir, 'original'), join(to, 'original'));
  await mkdir(join(dir, 'original'), { recursive: true });
  return to;
}

/** Put v<n> back: its original, meta and derived files replace the current ones (which are snapshotted first by the caller). */
export async function restoreSnapshot(dir, n) {
  const from = join(dir, SUPERSEDED_DIR, `v${n}`);
  if (!existsSync(join(from, 'meta.json'))) throw new Error(`no snapshot v${n} in ${dir}`);
  await rm(join(dir, 'original'), { recursive: true, force: true });
  await rename(join(from, 'original'), join(dir, 'original'));
  for (const e of await readdir(from)) {
    if (e === 'original') continue;
    await rm(join(dir, e), { recursive: true, force: true });
    await cp(join(from, e), join(dir, e), { recursive: true });
  }
}

const describeMeta = (m = {}) => ({ sha256: m.source?.sha256 || null, bytes: m.source?.bytes || null, duration_s: m.duration_s || null, path: m.source?.path || null,
  codec: m.source?.probe?.codec || m.source?.probe?.audio_codec || null, sample_rate: m.source?.probe?.sample_rate || null, bit_rate: m.source?.probe?.bit_rate || null, original: m.original || null });

/**
 * mediaSupersede({ action: 'plan'|'apply'|'revert'|'history', slug, newSource, reason, by, evidence, force, version, write })
 * plan (default, write=false) answers what apply would do and whether the guard passes; nothing changes. Idempotent: the same new
 * file twice is 'already'; revert of the current version is 'already'.
 */
export async function mediaSupersede(p = {}, deps = {}) {
  const { action = 'plan', slug, newSource = null, reason = '', by = 'ops', evidence = {}, force = false, version = null, write = false } = p;
  const repo = deps.repo || await import('../repos/media-repo.js');
  const item = slug ? await repo.getMediaBySlug(slug) : null;
  if (!item) return { status: 'refused', why: `no media item with slug ${slug}` };
  const dir = item.dir;
  if (!dir || !existsSync(join(dir, 'meta.json'))) return { status: 'refused', why: 'the talk has no archive folder' };
  const meta = await readJson(join(dir, 'meta.json'), {});
  const done = meta.supersedes || [];
  const have = await versions(dir);
  if (action === 'history') return { status: 'ok', slug, current: describeMeta(meta), supersedes: done, snapshots: have };
  if (item.state === 'excluded') return { status: 'refused', why: 'the talk is excluded' };
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const busy = (await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr'].map((n) => ops.pendingRuns(n)))).flat().some((r) => Number(r.params?.id) === item.id || r.params?.slug === slug);
  if (busy && write) return { status: 'refused', why: 'a run is queued or running on this talk; try again when it has finished' };
  const queue = deps.queue || (await import('../repos/ops-report-repo.js')).enqueue;
  const purge = deps.purge || (await import('./edge-purge.js')).purgeTalk;
  const now = (deps.now || (() => new Date().toISOString()))();

  if (action === 'revert') {
    const n = Number(version);
    if (!have.includes(n)) return { status: 'refused', why: `no snapshot v${version}; have ${have.map((x) => `v${x}`).join(', ') || 'none'}` };
    if (done.at(-1)?.reverted_to === n && done.at(-1)?.applied) return { status: 'already', reverted_to: n };
    const old = await readJson(join(dir, SUPERSEDED_DIR, `v${n}`, 'meta.json'), {});
    const plan = { action, restore: `v${n}`, restores: describeMeta(old), replaces: describeMeta(meta), snapshots_after: [...have, Math.max(...have) + 1] };
    if (!write) return { status: 'plan', ...plan };
    const keep = Math.max(...have) + 1;
    await snapshotItem(dir, keep);                       // the current state is never lost: it becomes the newest snapshot
    await restoreSnapshot(dir, n);
    const restored = await readJson(join(dir, 'meta.json'), {});
    restored.supersedes = [...done, { n: keep, at: now, by, reason: reason || `revert to v${n}`, reverted_to: n, applied: true, from: describeMeta(meta), to: describeMeta(restored) }];
    restored.audio_version = (meta.audio_version || meta.version || 1) + 1;   // new immutable audio key: the edge/R2 cannot serve the superseded bytes
    delete restored.supersede_pending;
    await writeJson(join(dir, 'meta.json'), restored);
    await repo.supersedeMediaSource(item.id, { source_ref: restored.source?.path || item.source_ref, sha256: restored.source?.sha256 || item.sha256, duration_s: restored.duration_s, expect_sha256: item.sha256 });
    await queue('media-item', { id: item.id, redo: ['ingest', 'catalog', 'update'] }, 'media-supersede');   // the transcript document follows the restored text
    await purge(slug);
    return { status: 'reverted', ...plan, snapshot: `v${keep}` };
  }

  if (action !== 'plan' && action !== 'apply') return { status: 'refused', why: `unknown action ${action}` };
  if (!newSource) return { status: 'refused', why: 'newSource is required' };
  const real = await realpath(newSource).catch(() => null);
  const roots = deps.roots || [(await import('./item.js')).mediaRoot(), (process.env.DEWEY_MEDIA_DIR || '/tank/dewey-ingest/media')];
  const rootsReal = (await Promise.all(roots.map((r) => realpath(r).catch(() => null)))).filter(Boolean);
  if (!real || !(await stat(real).catch(() => null))?.isFile()) return { status: 'refused', why: `newSource is not a file: ${newSource}` };
  if (!rootsReal.some((r) => inside(r, real))) return { status: 'refused', why: `newSource must be under ${rootsReal.join(' or ')}` };
  const sha = deps.sha256 ? await deps.sha256(real) : await sha256Of(real);
  const last = done.at(-1);
  if (item.sha256 === sha && !last?.reverted_to) return { status: 'already', why: 'the talk already uses this file', sha256: sha };
  if (last && last.to?.sha256 === sha && last.applied && !last.reverted_to) return { status: 'already', why: 'this file was already applied', sha256: sha, n: last.n };
  const heldText = await readFile(join(dir, 'transcript.md'), 'utf8').catch(() => '');
  const guard = supersedeGuard({ held: { duration_s: meta.duration_s || item.duration_s, text: heldText }, next: evidence, force, reason });
  const n = Math.max(0, ...have) + 1;
  const plan = { action, guard, from: describeMeta(meta), to: { path: real, sha256: sha, bytes: (await stat(real)).size, duration_s: evidence.duration_s || null }, snapshot: `v${n}`,
    keeps: ['slug', 'doc', 'title', 'speaker', 'tags', 'URL'], reruns: 'media-item from archive (worker path)' };
  if (!guard.ok) return { status: 'refused', why: guard.problems.join('; '), ...plan };
  if (!write || action === 'plan') return { status: 'plan', ...plan };
  if (String(reason).trim().length < 5) return { status: 'refused', why: 'a reason is required', ...plan };

  await snapshotItem(dir, n);
  const entry = { n, at: now, by, reason, forced: guard.forced, applied: true, guard: { ratio: guard.ratio, overlap: guard.overlap, problems: guard.problems }, from: describeMeta(meta), to: { path: real, sha256: sha, bytes: plan.to.bytes, duration_s: evidence.duration_s || null } };
  const next = { ...meta, supersedes: [...done, entry], supersede_pending: { n, at: now, sha256: sha }, audio_version: (meta.audio_version || meta.version || 1) + 1, audio_publish_pending: true, audio_alignment_version: null };
  for (const f of AUDIO_FIELDS) if (f !== 'audio_publish_pending' && f !== 'audio_alignment_version') delete next[f];
  next.stages = {};   // the run below redoes every stage from 'archive'
  await writeJson(join(dir, 'meta.json'), next);
  await repo.supersedeMediaSource(item.id, { source_ref: real, sha256: sha, duration_s: evidence.duration_s || null, expect_sha256: item.sha256 });
  await queue('media-item', { id: item.id, from: 'archive' }, 'media-supersede');
  await purge(slug);
  return { status: 'applied', ...plan };
}

/** The archive stage of a superseded talk (called by runItem when meta.supersede_pending): link the new original in, probe it, keep every
 *  identity field. Returns the fields to merge into meta. */
export async function archiveSuperseded({ item, meta, dir, tools }) {
  const src = item.source_ref;
  const original = join(dir, 'original', basename(src));
  if (!existsSync(original)) { try { await link(src, original); } catch { await copyFile(src, original); await chmod(original, 0o444).catch(() => {}); } }
  const sha = await sha256Of(original);
  if (meta.supersede_pending?.sha256 && sha !== meta.supersede_pending.sha256) throw new Error(`superseding file changed on disk (sha ${sha.slice(0, 12)} != ${meta.supersede_pending.sha256.slice(0, 12)})`);
  const probe = await tools.ffprobe(original);
  const source = { kind: 'file', path: src, sha256: sha, bytes: (await stat(original)).size, probe };
  return { probe, patch: { duration_s: probe.duration_s, has_video: !!probe.has_video, source, original: relative(dir, original) } };
}

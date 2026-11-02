// The typed chain's audio input (11-02): tower plans it (chain-input.mjs), cpu-prep makes it (phases.mjs chainInput) with tower's old args,
// typedJob carries the plan, adoptWholeResult checks the original by its own sha (or skips it for chains fed before 11-02).
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { OPUS_IN, opusArgs, demuxArgs, codecArgs, demuxExt, chainPlan, needsOpus, NAME_RE } from '../../scripts/media/worker/chain-input.mjs';
import { opusEncoder, audioDemuxer } from '../../api/lib/media/r2-stage.js';
import { typedJob } from '../../api/lib/media/stage-jobs.js';
import { fileSha, adoptWholeResult } from '../../api/lib/media/whole-result.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('chain-input.mjs: one source for tower and the worker image', () => {
  it('the Opus args are exactly the ones tower encoded with before 11-02', () => {
    expect(OPUS_IN).toEqual(['-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '96k', '-application', 'audio']);
    expect(opusArgs('/a/in.wav', '/b/out.opus')).toEqual(['-nostdin', '-y', '-v', 'error', '-i', '/a/in.wav', '-map', '0:a:0', '-vn', ...OPUS_IN, '/b/out.opus']);
    expect(demuxArgs('/v.mp4', '/t.m4a', 'm4a')).toEqual(['-nostdin', '-y', '-v', 'error', '-i', '/v.mp4', '-map', '0:a:0', '-vn', '-c:a', 'copy', '-movflags', '+faststart', '/t.m4a']);
    expect(demuxArgs('/v.mkv', '/t.ogg', 'ogg', 30)).toEqual(['-nostdin', '-y', '-v', 'error', '-i', '/v.mkv', '-map', '0:a:0', '-vn', '-t', '30', '-c:a', 'copy', '/t.ogg']);
    expect(demuxExt('aac\n')).toBe('m4a'); expect(demuxExt('pcm_s16le')).toBeNull(); expect(demuxExt('')).toBeNull();
  });
  it('r2-stage (the pod stager) still runs the same commands', async () => {
    const calls = [], run = async (cmd, args) => { calls.push([cmd, args]); return { stdout: cmd === 'ffprobe' ? 'opus\n' : '' }; };
    const o = await opusEncoder(run, '/tmp')('/x/in.wav', '/d');
    expect(calls[0]).toEqual(['ffmpeg', opusArgs('/x/in.wav', o.file)]);
    const a = await audioDemuxer(run, '/tmp')('/x/v.webm', '/d');
    expect(a.ext).toBe('ogg');
    expect(calls.slice(1)).toEqual([['ffprobe', codecArgs('/x/v.webm')], ['ffmpeg', demuxArgs('/x/v.webm', a.file, 'ogg', null)]]);
  });
  it('chainPlan: above 96 kbps → opus; a video → demux; anything else → the original', () => {
    expect(chainPlan('a.wav', 13_000 * 3600, 3600)).toEqual({ how: 'opus' });
    expect(chainPlan('a.MP4', 300e6, 3600)).toEqual({ how: 'opus' });   // a big video: Opus straight from it
    expect(chainPlan('a.mp4', 5e6, 3600)).toEqual({ how: 'demux' });
    expect(chainPlan('a.mp3', 5e6, 3600)).toBeNull();
    expect(chainPlan('a.wav', 100, 0)).toBeNull();   // no duration: no rate, no plan
    expect(needsOpus(12_001, 1)).toBe(true); expect(needsOpus(12_000, 1)).toBe(false);
    expect(NAME_RE.test('in.opus')).toBe(true); expect(NAME_RE.test('../in.opus')).toBe(false); expect(NAME_RE.test('in.')).toBe(false);
  });
});

describe('typedJob carries the plan to cpu-prep only', () => {
  it('chain_input on the prep body; never on gpu/finish; absent without a plan (old behaviour)', () => {
    const wj = { input: 'in.wav', input_sha: 'a'.repeat(64), meta: { slug: 's' }, chain_input: { how: 'opus' } };
    expect(typedJob('cpu-prep', { itemId: 1, fileId: 'f', wj }).job.chain_input).toEqual({ how: 'opus' });
    expect(typedJob('gpu', { itemId: 1, fileId: 'f', wj }).job.chain_input).toBeUndefined();
    const { chain_input, ...plain } = wj;
    expect('chain_input' in typedJob('cpu-prep', { itemId: 1, fileId: 'f', wj: plain }).job).toBe(false);
  });
});

describe('adoptWholeResult: the original is checked by its own sha', () => {
  async function fixture(ext = 'opus') {
    const root = await mkdtemp(join(tmpdir(), 'ci-adopt-')), dir = join(root, 'dest');
    await mkdir(join(root, 'item/web'), { recursive: true }); await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'orig.wav'), 'the original');
    const meta = { slug: 't', original: `original/in.${ext}`, stages: Object.fromEntries(['archive', 'grade', 'enhance', 'transcribe', 'diarize', 'remaster', 'web', 'trim'].map((s) => [s, { at: 'x' }])),
      remaster: { status: 'review' }, enhancement: { variants: [{ file: `original/in.${ext}` }] } };
    const files = [];
    for (const path of ['meta.json', 'transcript.raw.json', 'transcript.work.json', 'diarization.json', 'waveform.json', 'web/t.ogg', 'web/t.m4a']) {
      await writeFile(join(root, 'item', path), path === 'meta.json' ? JSON.stringify(meta) : 'x'); files.push({ path, sha256: await fileSha(join(root, 'item', path)) });
    }
    const opusSha = sha('the opus');
    await writeFile(join(root, 'result.json'), JSON.stringify({ v: 1, ok: true, input_sha: opusSha, slug: 't', meta, files }));
    return { root, dir, opusSha, old: { slug: 't', original: 'orig.wav', source: { kind: 'file' } } };
  }
  it('result on the chain input (Opus), original checked against originalSha; the worker\'s original/in.opus maps to tower\'s original', async () => {
    const { root, dir, opusSha, old } = await fixture();
    const m = await adoptWholeResult(root, dir, old, opusSha, null, undefined, fileSha, sha('the original'));
    expect(m.original).toBe('orig.wav'); expect(m.enhancement.variants[0].file).toBe('orig.wav');
  });
  it('an original changed since the feed is refused; null (a chain fed before 11-02) skips the check', async () => {
    let f = await fixture();
    await expect(adoptWholeResult(f.root, f.dir, f.old, f.opusSha, null, undefined, fileSha, sha('another'))).rejects.toThrow(/Original changed/);
    f = await fixture();
    await expect(adoptWholeResult(f.root, f.dir, f.old, f.opusSha)).rejects.toThrow(/Original changed/);   // the pre-11-02 call: Opus sha vs the WAV
    f = await fixture();
    expect((await adoptWholeResult(f.root, f.dir, f.old, f.opusSha, null, undefined, fileSha, null)).original).toBe('orig.wav');
  });
});

describe.skipIf(!hasFfmpeg)('phases.mjs chainInput: cpu-prep makes the chain input from tower\'s plan (real ffmpeg)', () => {
  async function job(plan, input = 'in.wav') {
    const jobDir = await mkdtemp(join(tmpdir(), 'ci-prep-')), dir = join(jobDir, 'item');
    await mkdir(dir, { recursive: true });
    execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-ac', '2', '-ar', '44100', join(jobDir, input)]);
    const input_sha = sha(await readFile(join(jobDir, input)));
    return { job: { input, input_sha, ...(plan ? { chain_input: plan } : {}) }, jobDir, dir, threads: 1, state: async () => {} };
  }
  const withHeavy = async (f) => { const was = process.env.MEDIA_TOWER_HEAVY; process.env.MEDIA_TOWER_HEAVY = '1'; try { return await f(); } finally { if (was === undefined) delete process.env.MEDIA_TOWER_HEAVY; else process.env.MEDIA_TOWER_HEAVY = was; } };
  it('opus: chain/in.opus (mono 48 kHz Opus), its sha and the original\'s; a resumed prep keeps the file it made', async () => {
    const { chainInput } = await import('../../scripts/media/whole-worker/phases.mjs');
    const ctx = await job({ how: 'opus' });
    const ci = await withHeavy(() => chainInput(ctx));
    expect(ci).toMatchObject({ name: 'in.opus', path: 'chain/in.opus', from_sha: ctx.job.input_sha, how: 'opus', args: OPUS_IN });
    expect(ci.sha256).toBe(sha(await readFile(join(ctx.dir, 'chain/in.opus'))));
    const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,channels,sample_rate', '-of', 'csv=p=0', join(ctx.dir, 'chain/in.opus')]).toString().trim();
    expect(probe).toBe('opus,48000,1');
    expect(existsSync(join(ctx.dir, 'chain/part.in.opus'))).toBe(false);
    expect((await withHeavy(() => chainInput(ctx))).sha256).toBe(ci.sha256);   // resume: not encoded again
  });
  it('no plan → null (the job runs on its input as before); a wrong input sha is refused', async () => {
    const { chainInput } = await import('../../scripts/media/whole-worker/phases.mjs');
    expect(await chainInput(await job(null))).toBeNull();
    const ctx = await job({ how: 'opus' }); ctx.job.input_sha = 'f'.repeat(64);
    await expect(withHeavy(() => chainInput(ctx))).rejects.toThrow(/hash mismatch/);
  });
  it('demux of an input with no stream-copyable audio (PCM) → null: the original stays the input', async () => {
    const { chainInput } = await import('../../scripts/media/whole-worker/phases.mjs');
    expect(await withHeavy(async () => chainInput(await job({ how: 'demux' })))).toBeNull();
  });
});

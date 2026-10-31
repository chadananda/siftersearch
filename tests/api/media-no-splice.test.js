// Ratchet + purify (Chad 10-31: "There is no reason to ever splice a remaster. That is not allowed."): no splice code exists; spliced legacy copies are deleted and rebuilt pure by a worker.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(async () => null), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { remasterJudgement, qualityOf } from '../../api/lib/media/remaster-quality.js';
import { rejudgeOne, rejudgePass, resetRejudge } from '../../api/lib/media/remaster-rejudge.js';

const ROOT = join(import.meta.dirname, '..', '..');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

describe('no splice code path exists', () => {
  const files = [...walk(join(ROOT, 'scripts', 'media')), ...walk(join(ROOT, 'api', 'lib', 'media'))].filter((f) => /\.(py|js|mjs)$/.test(f));
  it('no splice/crossfade audio function anywhere in the media code', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/def (splice|crossfade|swap_in|mix_dry)\b/);
      expect(src, f).not.toMatch(/\b(function|const) (spliceAudio|crossfade|swapInOriginal)\b/);
      expect(src, f).not.toMatch(/\bacrossfade\b/);
    }
  });
  it('the guard only measures: it reports swapped 0 and never mixes the original into its output', () => {
    const g = readFileSync(join(ROOT, 'scripts', 'media', 'remaster_guard.py'), 'utf8');
    expect(g).toMatch(/'swapped': 0/); expect(g).toMatch(/'fallback_sent_pct': 0\.0/);
    expect(g).not.toMatch(/\bdry\[|seg_d|np\.sqrt\(np\.clip/);
    expect(g).toMatch(/'-i',a\.unipase|'-i', a\.unipase/);   // the output is the UniPASE copy transcoded, nothing else
  });
  it('a copy with any original sentence in it is never publishable (verdict spliced)', () => {
    expect(qualityOf({ remaster: { status: 'done', swapped: 3, verdict: 'pass-auto', output_assessment: { passed: true } }, enhancement: { listening: 'unipase' } }).verdict).toBe('spliced');
  });
});

describe('the quiet pass is not a splice and stays', () => {
  it('quiet.py + quiet-repair exist and the worker contract still requires quiet before tower adopts a result', () => {
    expect(existsSync(join(ROOT, 'scripts', 'media', 'worker', 'quiet.py'))).toBe(true); expect(existsSync(join(ROOT, 'api', 'lib', 'media', 'quiet-repair.js'))).toBe(true);
    expect(JSON.parse(readFileSync(join(ROOT, 'scripts', 'media', 'worker', 'result-contract.json'), 'utf8')).post.requires ?? JSON.parse(readFileSync(join(ROOT, 'scripts', 'media', 'worker', 'result-contract.json'), 'utf8')).requires).toContain('quiet');
  });
  it('quiet.py never reads the original recording (it attenuates the remaster\'s own gaps)', () => {
    expect(readFileSync(join(ROOT, 'scripts', 'media', 'worker', 'quiet.py'), 'utf8')).not.toMatch(/in\.(wav|mp3|m4a)|\boriginal\b.*(read|load|open)/i);
  });
});

describe('word comparison is assessment only', () => {
  const CHECKS = { finite_scores: true, quality_gain: true, overall_no_regression: true, speech_no_material_regression: true, consistent_gain: true, no_bad_excerpt: true, no_material_clipping: true, duration_preserved: true };
  const a = { passed: true, checks: CHECKS, reference: { nisqa: [2] }, restored: { nisqa: [3] }, technical: { duration_s: 100 } };
  it('a high word mismatch holds with listen-to-check wording, never "replaced by the original"', () => {
    const j = remasterJudgement({ duration_s: 100, remaster: { flagged_sent_pct: 43.6, swapped: 0, fallback_sent_pct: 0, output_assessment: a } });
    expect(j.action).toBe('hold'); expect(j.problems).toEqual(['word_fallback']);
    expect(j.reason).toMatch(/differ from the original transcript in 43\.6 %/); expect(j.reason).not.toMatch(/replaced by the original/);
  });
  it('without a quality assessment the check is re-run (rerun), not held', () => {
    expect(remasterJudgement({ duration_s: 100, remaster: { flagged_sent_pct: 43.6, swapped: 0 } }).action).toBe('rerun');
  });
});

describe('purify a spliced legacy talk', () => {
  let dir, queue, repo;
  const mk = async (id, r = {}, { cloud = true } = {}) => {
    const d = join(dir, String(id)), enh = join(d, 'enhanced'); await mkdir(join(d, 'held'), { recursive: true }); await mkdir(enh, { recursive: true });
    const meta = { title: 'T', duration_s: 100, enhancement: { listening: 'unipase', listening_before: { name: 'safe' }, variants: [{ name: 'original' }, { name: 'unipase', file: 'enhanced/unipase.flac' }] }, remaster_tier: 'heavy',
      remaster: { status: 'done', verdict: 'pass-auto', swapped: 89, swapped_pct: 30, fallback_sent_pct: 43.6, sentences: 204, output_assessment: { passed: true }, ...r }, qa: { remaster: { output_assessment: { passed: true } } } };
    await writeFile(join(d, 'meta.json'), JSON.stringify(meta));
    await writeFile(join(enh, 'unipase.flac'), Buffer.alloc(4096)); await writeFile(join(enh, 'unipase.guard.json'), '{}'); await writeFile(join(d, 'held', 'remaster-1-2.m4a'), 'x');
    if (cloud) { await writeFile(join(enh, 'unipase.cloud.flac'), Buffer.alloc(4096)); await writeFile(join(enh, 'unipase.asr.json'), Buffer.alloc(4096)); }
    return { id, slug: `t${id}`, dir: d };
  };
  const meta = async (it) => JSON.parse(await readFile(join(it.dir, 'meta.json'), 'utf8'));
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'purify-')); queue = vi.fn(async () => ({})); repo = { setIndex: vi.fn(), getMediaItem: vi.fn(), getMediaBySlug: vi.fn(), heldCandidates: vi.fn() }; resetRejudge(); });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('deletes the spliced master + guard json + cached clips, clears the swap fields, keeps the word mismatch as assessment, queues a worker post job', async () => {
    const it = await mk(1);
    expect(await rejudgeOne(it, await meta(it), { repo, queue })).toBe('purified');
    const m = await meta(it);
    expect(existsSync(join(it.dir, 'enhanced', 'unipase.flac'))).toBe(false); expect(existsSync(join(it.dir, 'enhanced', 'unipase.guard.json'))).toBe(false); expect(existsSync(join(it.dir, 'held'))).toBe(false);
    expect(existsSync(join(it.dir, 'enhanced', 'unipase.cloud.flac'))).toBe(true);
    expect(m.remaster).toMatchObject({ status: 'waiting', swapped: 0, fallback_sent_pct: 0, flagged_sent_pct: 43.6 }); expect(m.remaster.output_assessment).toBeUndefined(); expect(m.qa.remaster.output_assessment).toBeUndefined();
    expect(m.enhancement.listening).toBe('safe'); expect(m.enhancement.variants.find((v) => v.name === 'unipase')).toBeUndefined();
    expect(queue).toHaveBeenCalledWith('media-cloud-order', { mode: 'post', ids: [1], redo: true }, 'media-remaster-rejudge');
  });
  it('no UniPASE output on tower: a full restore order instead', async () => {
    const it = await mk(2, {}, { cloud: false });
    expect(await rejudgeOne(it, await meta(it), { repo, queue })).toBe('purified');
    expect(queue).toHaveBeenCalledWith('media-cloud-order', { mode: 'restore', ids: [2], redo: true }, 'media-remaster-rejudge');
  });
  it('the paced pass picks up a done+spliced talk and counts it', async () => {
    const it = await mk(3);
    repo.heldCandidates.mockResolvedValue([it]);
    const r = await rejudgePass({ repo, queue, limit: 3, countsFile: join(dir, 'c.json') });
    expect(r.purified).toBe(1);
  });
});

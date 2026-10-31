// The remaster judge + re-judge pass + Chad's held-page decisions (Chad 10-31: worse = held for review; same or better = published with the remaster; archived leaves every queue).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(async () => null), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { remasterJudgement, qualityOf } from '../../api/lib/media/remaster-quality.js';
import { isComplete, COMPLETE_STAGES } from '../../api/lib/media/item.js';
import { quietAudit, rejudgeOne, rejudgePass, resetRejudge, heldList, excerptsOf } from '../../api/lib/media/remaster-rejudge.js';
import { mediaRemasterDecideJob } from '../../api/lib/ops/media-jobs.js';

const CHECKS = { finite_scores: true, quality_gain: true, overall_no_regression: true, speech_no_material_regression: true, consistent_gain: true, no_bad_excerpt: true, no_material_clipping: true, duration_preserved: true };
const assessment = (o = {}, checks = {}) => ({ passed: false, checks: { ...CHECKS, ...checks }, reference: { nisqa: [2.0], dnsmos: [3, 3, 3, 3] }, restored: { nisqa: [3.0], dnsmos: [3, 3.1, 3, 3.1] }, technical: { duration_s: 5651.59, clip_pct: 0 },
  samples: [{ start_s: 100, reference: { nisqa: [2] }, restored: { nisqa: [3] } }, { start_s: 500, reference: { nisqa: [2] }, restored: { nisqa: [1.5] } }], ...o });
const talk = (a = assessment(), r = {}, o = {}) => ({ title: 'T', speaker: 'S', duration_s: 5651.59, quality: { overall: 'C' }, enhancement: { listening: 'safe', variants: [{ name: 'unipase', file: 'enhanced/unipase.flac', shifts_time: true }] },
  remaster: { status: 'review', fallback_sent_pct: 0, swapped: 0, sentences: 100, output_assessment: a, ...r }, ...o });

describe('remasterJudgement', () => {
  it('the dunbar case: only the duration check failed (the MP3 header estimate was 8 s short of the decoded length) → publish', () => {
    const j = remasterJudgement(talk(assessment({}, { duration_preserved: false })));
    expect(j.action).toBe('publish');
  });
  it('a real length mismatch against the decoded duration → hold', () => {
    const j = remasterJudgement(talk(assessment({ technical: { duration_s: 5660, clip_pct: 0 } })));
    expect(j).toMatchObject({ action: 'hold', problems: ['duration'] }); expect(j.reason).toMatch(/8\.4 s longer/);
  });
  it('same (no quality gain alone, consistent_gain false) is publish', () => {
    expect(remasterJudgement(talk(assessment({}, { quality_gain: false, consistent_gain: false }))).action).toBe('publish');
  });
  it('every regression is a hold with its plain reason', () => {
    for (const [c, code] of [['overall_no_regression', 'overall_regression'], ['speech_no_material_regression', 'speech_regression'], ['no_bad_excerpt', 'bad_excerpt'], ['no_material_clipping', 'clipping']]) {
      expect(remasterJudgement(talk(assessment({}, { [c]: false })))).toMatchObject({ action: 'hold', problems: [code] });
    }
    const down = remasterJudgement(talk(assessment({ restored: { nisqa: [1.8], dnsmos: [3, 3, 3, 3] } })));
    expect(down).toMatchObject({ action: 'hold', problems: ['nisqa_down'] }); expect(down.scores.nisqa).toEqual([2, 1.8]);
    expect(remasterJudgement(talk(assessment({ restored: { nisqa: [1.95], dnsmos: [3, 3, 3, 3] } }))).action).toBe('publish');   // a dip of 0.05 is within "the same"
  });
  it('word fallback: 0 % is not > 15 (the old bug); 20 % is held; any original sentence mixed in is held', () => {
    expect(remasterJudgement(talk(assessment(), { fallback_sent_pct: 0, why: '0 % of sentences fell back (> 15 %)' })).action).toBe('publish');
    expect(remasterJudgement(talk(assessment(), { fallback_sent_pct: 20, swapped: 20 }))).toMatchObject({ action: 'hold', problems: ['word_fallback'] });
    expect(remasterJudgement(talk(assessment(), { fallback_sent_pct: 3, swapped: 3 }))).toMatchObject({ action: 'hold', problems: ['spliced'] });
  });
  it('a failed realign is a pipeline failure, not audio: rerun once, then held', () => {
    const r = { why: 'realign placed 0 of 9000 words — still playing the original audio' };
    expect(remasterJudgement(talk(assessment(), r))).toMatchObject({ action: 'rerun', stages: ['realign', 'web', 'trim', 'update'] });
    expect(remasterJudgement(talk(assessment(), { ...r, rerun_n: 1 }))).toMatchObject({ action: 'hold', problems: ['realign_failed'] });
  });
  it('no stored assessment is a rerun of the remaster', () => {
    const m = talk(null); delete m.remaster.output_assessment;
    expect(remasterJudgement(m)).toMatchObject({ action: 'rerun', stages: ['remaster'] });
  });
});

describe('never the original', () => {
  const stages = Object.fromEntries([...COMPLETE_STAGES, 'web'].map((k) => [k, { at: 1 }]));
  it('a talk whose listening copy is the original is never complete, whatever the remaster says', () => {
    for (const status of ['review', 'kept', 'deferred', 'skipped', 'waiting', 'archived', 'done']) expect(isComplete({ stages, enhancement: { listening: 'safe' }, remaster: { status, output_assessment: { passed: true } } })).toBe(false);
  });
});

describe('re-judge pass, publish, archive', () => {
  let dir, queue, indexed, repo;
  const mk = async (id, meta, { flac = true } = {}) => {
    const d = join(dir, String(id)); await mkdir(join(d, 'enhanced'), { recursive: true });
    await writeFile(join(d, 'meta.json'), JSON.stringify(meta));
    if (flac) await writeFile(join(d, 'enhanced', 'unipase.flac'), Buffer.alloc(4096));
    return { id, slug: `t${id}`, dir: d };
  };
  const meta = async (it) => JSON.parse(await readFile(join(it.dir, 'meta.json'), 'utf8'));
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rejudge-')); queue = vi.fn(async () => ({})); indexed = [];
    repo = { setIndex: vi.fn(async (id, f) => indexed.push([id, f])), getMediaItem: vi.fn(), getMediaBySlug: vi.fn(), heldCandidates: vi.fn(), heldRows: vi.fn(async () => []) };
    resetRejudge();
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('publish without a quiet pass: flipped, but the quiet repair runs FIRST (then the web redo); not on air until quiet is recorded', async () => {
    const it = await mk(11, talk(assessment({}, { duration_preserved: false })));
    expect(await rejudgeOne(it, await meta(it), { repo, queue })).toBe('publish');
    expect(queue).toHaveBeenCalledWith('media-quiet-repair', { ids: [11], redo: ['realign', 'web', 'trim', 'update'] }, 'media-remaster-rejudge');
    expect(queue).not.toHaveBeenCalledWith('media-item', expect.anything(), expect.anything());
    const m = await meta(it), full = Object.fromEntries([...COMPLETE_STAGES, 'web'].map((k) => [k, { at: 1 }]));
    expect(isComplete({ ...m, stages: full, web_listening: 'unipase' })).toBe(false);
    expect(isComplete({ ...m, stages: full, web_listening: 'unipase', remaster: { ...m.remaster, quiet: { v: 1 } } })).toBe(true);
  });
  it('quiet audit: counts published remasters with / without the quiet record and queues the repair for the missing ones on fix', async () => {
    const withQ = await mk(12, talk(assessment(), { status: 'done', verdict: 'pass-judged', judged: { action: 'publish' }, quiet: { v: 1 } }));
    const noQ = await mk(13, talk(assessment(), { status: 'done', verdict: 'pass-judged', judged: { action: 'publish' } }));
    const old = await mk(14, talk(assessment(), { status: 'done', verdict: 'pass-auto' }));
    repo.heldRows.mockResolvedValue([withQ, noQ, old]);
    const r = await quietAudit({ repo, queue, fix: true });
    expect(r).toMatchObject({ published: 3, with_quiet: 1, missing: 2, judged_published: 2, judged_missing: ['t13'], other_missing: ['t14'], queued: 2 });
    expect(queue).toHaveBeenCalledWith('media-quiet-repair', { ids: [13, 14], limit: 2 }, 'media-remaster-rejudge');
  });
  it('publish: the remaster becomes the listening copy, status done, web/update redone; the talk is not on air until the web copy is encoded from it', async () => {
    const it = await mk(1, talk(assessment({}, { duration_preserved: false }), { quiet: { v: 1 } }));
    expect(await rejudgeOne(it, await meta(it), { repo, queue })).toBe('publish');
    const m = await meta(it);
    expect(m.remaster).toMatchObject({ status: 'done', verdict: 'pass-judged' }); expect(m.enhancement.listening).toBe('unipase'); expect(m.audio_publish_pending).toBe(true);
    expect(queue).toHaveBeenCalledWith('media-item', { id: 1, remaster: true, redo: ['realign', 'web', 'trim', 'update'] }, 'media-remaster-rejudge');
    expect(qualityOf(m).verdict).toBe('usable');
    const full = Object.fromEntries([...COMPLETE_STAGES, 'web'].map((k) => [k, { at: 1 }]));
    expect(isComplete({ ...m, stages: full })).toBe(false);                                   // web copy still the original
    expect(isComplete({ ...m, stages: full, web_listening: 'unipase' })).toBe(true);          // re-encoded from the remaster: on air
  });
  it('hold: stays held (status review) with the reason, and a second pass leaves it alone', async () => {
    const it = await mk(2, talk(assessment({}, { no_bad_excerpt: false })));
    expect(await rejudgeOne(it, await meta(it), { repo, queue })).toBe('hold');
    const m = await meta(it);
    expect(m.remaster).toMatchObject({ status: 'review', judged: { action: 'hold' } }); expect(queue).not.toHaveBeenCalled();
    expect(await rejudgeOne(it, m, { repo, queue })).toBe('unchanged');
  });
  it('rerun (realign failed): flips and redoes the stages; a second failure holds', async () => {
    const it = await mk(3, talk(assessment(), { why: 'realign placed 0 of 50 words — still playing the original audio' }));
    expect(await rejudgeOne(it, await meta(it), { repo, queue })).toBe('rerun');
    let m = await meta(it); expect(m.remaster.rerun_n).toBe(1);
    m.remaster = { ...m.remaster, status: 'review', why: 'realign placed 0 of 50 words — still playing the original audio' };   // the realign stage failed again
    expect(await rejudgeOne(it, m, { repo, queue })).toBe('hold');
  });
  it('kept/deferred without an assessment go back into the remaster queue (waiting), in normal order', async () => {
    const m0 = talk(null, { status: 'kept', verdict: 'keep-human' }); delete m0.remaster.output_assessment;
    const it = await mk(4, m0);
    expect(await rejudgeOne(it, await meta(it), { repo, queue })).toBe('requeued');
    expect((await meta(it)).remaster.status).toBe('waiting');
    expect(indexed.at(-1)[1].restored).toBe(0);
  });
  it('a publish whose remaster file is not on tower is requeued, not flipped', async () => {
    const it = await mk(5, talk(), { flac: false });
    expect(await rejudgeOne(it, await meta(it), { repo, queue })).toBe('requeued');
    expect((await meta(it)).enhancement.listening).toBe('safe');
  });
  it('the paced pass judges a few per tick, counts them, and rescans later', async () => {
    const items = [await mk(1, talk()), await mk(2, talk(assessment({}, { no_bad_excerpt: false }))), await mk(3, talk()), await mk(4, talk())];
    repo.heldCandidates.mockImplementation(async (after) => items.filter((x) => x.id > after));
    const countsFile = join(dir, 'counts.json');
    const r1 = await rejudgePass({ repo, queue, limit: 3, countsFile });
    expect(r1).toMatchObject({ judged: 3, publish: 2, hold: 1 });
    const r2 = await rejudgePass({ repo, queue, limit: 3, countsFile });
    expect(r2.publish).toBe(1);
    expect(JSON.parse(await readFile(countsFile, 'utf8'))).toMatchObject({ publish: 3, hold: 1 });
  });
  it('Chad publishes a held pure remaster: on air after the redo, verdict pass-human-full; Archive: status archived, out of every queue, files kept', async () => {
    const a = await mk(6, talk(assessment({}, { no_bad_excerpt: false }), { judged: { action: 'hold' }, quiet: { v: 1 } }));
    const b = await mk(7, talk(assessment({}, { no_bad_excerpt: false })));
    repo.getMediaBySlug.mockImplementation(async (s) => ({ t6: a, t7: b })[s]);
    const out = await mediaRemasterDecideJob({ picks: [{ slug: 't6', choice: 'publish', by: 'chad@x' }, { slug: 't7', choice: 'archive' }] }, { repo, queue, tools: {} });
    expect(out).toMatchObject({ published: ['t6'], archived: ['t7'] });
    const ma = await meta(a), mb = await meta(b);
    expect(ma.remaster).toMatchObject({ status: 'done', verdict: 'pass-human-full', decided_by: 'chad@x' }); expect(ma.enhancement.listening).toBe('unipase');
    expect(queue).toHaveBeenCalledWith('media-item', expect.objectContaining({ id: 6, redo: ['realign', 'web', 'trim', 'update'] }), 'media-remaster-decide');
    expect(mb.remaster.status).toBe('archived'); expect(mb.enhancement.listening).toBe('safe');
    expect(qualityOf(mb).verdict).toBe('archived');
    expect(isComplete({ ...mb, stages: Object.fromEntries([...COMPLETE_STAGES, 'web'].map((k) => [k, { at: 1 }])) })).toBe(false);
    // an archived talk is not re-judged and not offered to the queue
    expect(await rejudgePass({ repo: { ...repo, heldCandidates: async () => [b] }, queue, limit: 3, countsFile: join(dir, 'c.json') })).toMatchObject({ judged: 0 });
  });
  it('the held list: held with reason, scores, A/B clip URLs at the worst excerpt first; archived apart; unjudged counted', async () => {
    const h = await mk(8, talk(assessment({}, { no_bad_excerpt: false }), { status: 'review', judged: { action: 'hold', reason: 'Held: x.', problems: ['bad_excerpt'] } }));
    const g = await mk(9, talk(assessment(), { status: 'archived' }));
    const u = await mk(10, talk(assessment(), { status: 'review' }));
    repo.heldRows.mockResolvedValue([h, g, u].map((x) => ({ ...x, title: 'x' })));
    const l = await heldList({ repo, sign: (slug, which, a, b) => `sig=${which}-${a}-${b}` });
    expect(l.counts).toMatchObject({ held: 1, archived: 1, unjudged: 1 });
    expect(l.held[0]).toMatchObject({ slug: 't8', reason: 'Held: x.' }); expect(l.held[0].scores.nisqa).toEqual([2, 3]);
    expect(l.held[0].excerpts[0]).toMatchObject({ start_s: 500 });   // the worst excerpt first
    expect(l.held[0].excerpts[0].original_url).toBe('/api/media/admin/held/t8/clip/original?sig=original-500-520');
    expect(excerptsOf(talk()).length).toBe(2);
  });
});

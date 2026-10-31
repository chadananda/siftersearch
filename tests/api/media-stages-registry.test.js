// The stage registry (api/lib/media/stages.js, Chad 10-31): a new task is ONE declaration with optional `after`; queueing, staleness,
// re-runs and dependent un-ticks are generic. Throwaway example stages prove it (topics: llm after transcribe; radio: cpu after quiet + transcribe).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { REG, STAGE_DEFS, buildRegistry, withDependents, rerunSet, markStale, missingStages, isStale, withRecords, recordFor, fpOf, CLASSES, towerMay, AUDIO_JOBS, PROFILES, profilesFor, profileJobs } from '../../api/lib/media/stages.js';
import { STAGES, COMPLETE_STAGES, DEPENDENTS, indexFields, isComplete, runItem } from '../../api/lib/media/item.js';
import { nextJobs, TYPE_STAGES, effectiveDone } from '../../api/lib/media/stage-jobs.js';
import { mediaLanesFeedPass, mediaRerunJob } from '../../api/lib/ops/media-jobs.js';

const OLD_STAGES = ['archive', 'grade', 'enhance', 'remaster', 'verify', 'realign', 'quiet', 'web', 'transcribe', 'preview', 'diarize', 'trim', 'correct', 'clean', 'describe', 'thumb', 'render', 'ingest', 'catalog', 'headings', 'quotes', 'links', 'assess', 'update'];
const OLD_COMPLETE = ['remaster', 'verify', 'quiet', 'transcribe', 'diarize', 'correct', 'headings', 'quotes', 'links', 'assess', 'ingest', 'catalog'];

// the throwaway examples: one declaration each
const TOPICS = { name: 'topics', class: 'llm', after: ['transcribe'], feed: true, tool: 'llm:media-topics', settings: { model: 'haiku-5-5' }, run: vi.fn(async () => ({ n: 3 })) };
const RADIO = { name: 'radio', class: 'cpu', after: ['quiet', 'transcribe'], tool: 'radio-splits', settings: { min_gap: 2 } };
const withEx = (...ex) => buildRegistry([...STAGE_DEFS, ...ex]);

const allTicked = (reg = REG) => Object.fromEntries(reg.STAGES.map((s) => [s, { at: 'x', ...recordFor(s, {}, reg) }]));
const onAir = (stages) => ({ stages, enhancement: { listening: 'unipase' }, web_listening: 'unipase', remaster: { status: 'done', verdict: 'pass-auto', swapped: 0, output_assessment: { passed: true }, quiet: { v: 1 } }, qa: {} });

describe('the registry reproduces the checklist exactly (no behaviour change)', () => {
  it('STAGES, COMPLETE_STAGES, DEPENDENTS, TYPE_STAGES derive from it', () => {
    expect(STAGES).toEqual(OLD_STAGES);
    expect([...COMPLETE_STAGES].sort()).toEqual([...OLD_COMPLETE].sort());   // (now in run order)
    expect([...REG.AIR_STAGES].sort()).toEqual([...OLD_COMPLETE].sort());   // every stage that blocked air still does
    expect(DEPENDENTS).toEqual({ remaster: ['verify', 'realign', 'quiet'], realign: ['quiet'], quiet: ['web', 'trim', 'update'] });
    expect(TYPE_STAGES).toEqual({ intake: ['archive'], 'cpu-prep': ['grade'], gpu: ['enhance', 'transcribe', 'diarize'], 'cpu-finish': ['remaster', 'verify', 'realign', 'quiet', 'web', 'trim'],
      text: ['preview', 'correct', 'clean', 'describe', 'headings', 'quotes', 'links', 'assess'], publish: ['thumb', 'render', 'ingest', 'catalog', 'update'] });
  });
  it('the feed completes only opt-in stages (quiet, as before); everything else waits for a campaign', () => {
    expect(REG.FEED_STAGES).toEqual(['quiet']);
  });
});

describe('resource classes', () => {
  const contract = JSON.parse(readFileSync(join(process.cwd(), 'scripts/media/worker/job-types.json'), 'utf8'));
  it('every stage declares gpu | cpu | llm; a declaration without one is refused', () => {
    for (const s of REG.STAGES) expect(Object.keys(CLASSES)).toContain(REG.BY[s].class);
    expect(() => buildRegistry([...STAGE_DEFS, { name: 'x', tool: 't', settings: {} }])).toThrow(/class/);
  });
  it('a bundle never mixes classes, and each typed bundle runs where job-types.json says', () => {
    for (const [t, spec] of Object.entries(contract.types)) expect(REG.JOB_CLASS[t]).toBe(spec.needs);
    expect(() => buildRegistry([...STAGE_DEFS, { name: 'mix', class: 'llm', job: 'cpu-finish', tool: 't', settings: {} }])).toThrow(/mixes classes/);
  });
  it('job-types.json lists every registry stage of a typed bundle', () => {
    for (const [t, spec] of Object.entries(contract.types)) {
      const base = new Set(spec.stages.map((x) => x.split(':')[0]));
      for (const s of REG.TYPE_STAGES[t]) expect(base.has(s), `${t} lacks ${s}`).toBe(true);
    }
  });
  it('tower runs llm stages only; gpu/cpu wait for a worker', () => {
    expect(towerMay('quotes')).toBe(true); expect(towerMay('ingest')).toBe(true);
    expect(towerMay('transcribe')).toBe(false); expect(towerMay('quiet')).toBe(false);
    expect(CLASSES.llm.concurrency).toBeGreaterThan(CLASSES.cpu.concurrency);
  });
  it('worker profiles: gpu | cpu+llm | llm; the contract mirrors them; every class has a profile', () => {
    const { _, ...cp } = contract.profiles;
    expect(cp).toEqual(PROFILES);
    for (const c of Object.keys(CLASSES)) expect(profilesFor(c).length, c).toBeGreaterThan(0);
    expect(profilesFor('llm')).toEqual(['cpu+llm', 'llm']); expect(profilesFor('gpu')).toEqual(['gpu']);
    expect(profileJobs('gpu')).toEqual(['gpu']);
    expect(profileJobs('cpu+llm')).toEqual(['intake', 'cpu-prep', 'cpu-finish', 'text', 'publish']);
    expect(profileJobs('llm')).toEqual(['intake', 'text', 'publish']);
    expect(() => profileJobs('everything')).toThrow(/unknown worker profile/);
  });
  it('the agent\'s profile → claim types (contract needs) = the registry\'s profile → jobs, restricted to queued types', () => {
    for (const p of Object.keys(PROFILES)) {
      const agent = Object.keys(contract.types).filter((t) => contract.profiles[p].includes(contract.types[t].needs));
      expect(agent, p).toEqual(profileJobs(p).filter((t) => contract.types[t]));
    }
  });
  it('a new stage\'s class decides which profiles take it', () => {
    const r = withEx(TOPICS, RADIO);
    expect(profileJobs('llm', r)).toContain(r.BY.topics.job);
    expect(profileJobs('llm', r)).not.toContain(r.BY.radio.job);
    expect(profileJobs('cpu+llm', r)).toContain(r.BY.radio.job);
  });
  it('a class picks the bundle when job is left out', () => {
    const r = withEx(TOPICS, RADIO);
    expect(r.BY.topics.job).toBe('text'); expect(r.BY.radio.job).toBe('cpu-finish');
  });
});

describe('a text fix never reaches audio', () => {
  it('no llm/text stage has an audio dependent', () => {
    for (const s of REG.STAGES.filter((x) => !AUDIO_JOBS.includes(REG.BY[x].job))) for (const d of withDependents([s])) expect(AUDIO_JOBS).not.toContain(REG.BY[d].job);
  });
  it('the registry refuses an audio stage after a text stage', () => {
    expect(() => buildRegistry([...STAGE_DEFS, { name: 'bad', class: 'cpu', after: ['quotes'], tool: 't', settings: {} }])).toThrow(/audio stage cannot depend/);
    expect(() => buildRegistry([...STAGE_DEFS, { name: 'bad', class: 'llm', after: ['nope'], tool: 't', settings: {} }])).toThrow(/not a stage/);
  });
});

describe('adding a stage queues only that stage', () => {
  const reg = withEx(TOPICS, RADIO);
  it('a talk complete before the declaration now misses only the new stages; it stays on air (blocksAir false)', () => {
    const m = onAir(allTicked(REG));
    expect(missingStages(m, undefined, reg)).toEqual(['topics', 'radio'].sort((a, b) => reg.STAGES.indexOf(a) - reg.STAGES.indexOf(b)));
    expect(indexFields(m, reg)).toMatchObject({ restored: 1, stages_missing: 2 });
    expect(isComplete(m, reg)).toBe(true);
  });
  it('the next job is only the new stage\'s bundle', () => {
    const topicsOnly = buildRegistry([...STAGE_DEFS, TOPICS]), radioOnly = buildRegistry([...STAGE_DEFS, RADIO]);
    expect(nextJobs({ stages: allTicked(REG) }, topicsOnly)).toEqual(['text']);
    expect(nextJobs({ stages: allTicked(REG), have: { gpu: true } }, radioOnly)).toEqual(['cpu-finish']);
  });
  it('runItem with the registry runs only the new stage, through its declared run, and records its tool', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reg-')); mkdirSync(join(dir, 'enhanced'), { recursive: true });
    const r1 = buildRegistry([...STAGE_DEFS, TOPICS]);
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ slug: 'x', original: 'o.mp3', ...onAir(allTicked(REG)) }));
    const tools = { ffmpeg: vi.fn(), ffprobe: vi.fn(), tool: vi.fn(), asr: vi.fn(), remasterGuard: vi.fn() };
    const out = await runItem({ id: 1, dir, state: 'done', source_kind: 'file' }, {}, { reg: r1, tools, llm: {}, repo: { updateMediaItem: async () => ({}), getMediaItem: async () => ({ state: 'done' }) }, draining: async () => false, loadVocab: async () => ({}), now: () => 't' });
    expect(out.done).toEqual(['topics']);
    expect(TOPICS.run).toHaveBeenCalledTimes(1);
    for (const t of Object.values(tools)) expect(t).not.toHaveBeenCalled();
    const m = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    expect(m.stages.topics).toMatchObject({ at: 't', n: 3, tool: 'llm:media-topics', settings: { model: 'haiku-5-5' }, fp: fpOf('llm:media-topics', { model: 'haiku-5-5' }) });
  });
  it('a cpu stage is never run on tower: WorkerWait', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reg-')); mkdirSync(join(dir, 'enhanced'), { recursive: true });
    const run = vi.fn(async () => ({}));
    const r1 = buildRegistry([...STAGE_DEFS, { ...RADIO, run }]);
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ slug: 'x', original: 'o.mp3', ...onAir(allTicked(REG)) }));
    const d = { reg: r1, tools: {}, llm: {}, repo: { updateMediaItem: async () => ({}), getMediaItem: async () => ({ state: 'done' }) }, draining: async () => false, loadVocab: async () => ({}), now: () => 't' };
    await expect(runItem({ id: 1, dir, state: 'done', source_kind: 'file' }, {}, d)).rejects.toMatchObject({ code: 'WORKER_WAIT' });
    expect(run).not.toHaveBeenCalled();
  });
  it('the feed queues the new llm stage, paced by its class', async () => {
    const queue = vi.fn(), by = vi.fn(async (s) => (s === 'topics' ? [{ id: 5 }, { id: 6 }] : []));
    await mediaLanesFeedPass({ repo: { nextToProcess: async () => [], nextTranscribed: async () => [], updateMediaItem: vi.fn(), nextToDownload: async () => [], youtubeHeldSince: async () => ({ n: 0 }), nextByStage: by },
      ops: { pendingRuns: async () => [] }, queue, computeDepth: 0, acceptedWorker: null, feedStages: buildRegistry([...STAGE_DEFS, TOPICS]).FEED_STAGES });
    expect(queue.mock.calls.filter((c) => c[0] === 'media-item').map((c) => c[1])).toEqual([{ id: 5, remaster: true, stage_feed: 'topics' }, { id: 6, remaster: true, stage_feed: 'topics' }]);
  });
  it('a stage without feed is worked only on the talks a campaign marked (never every talk lacking it)', async () => {
    const queue = vi.fn(), by = vi.fn(async () => [{ id: 9 }]);
    const ledger = { campaignStages: async () => ['quotes', 'transcribe'], staleByStage: vi.fn(async (s) => (s === 'quotes' ? [{ id: 7 }] : [{ id: 8 }])) };
    await mediaLanesFeedPass({ repo: { nextToProcess: async () => [], nextTranscribed: async () => [], updateMediaItem: vi.fn(), nextToDownload: async () => [], youtubeHeldSince: async () => ({ n: 0 }), nextByStage: by },
      ops: { pendingRuns: async () => [] }, queue, computeDepth: 0, acceptedWorker: null, ledger });
    expect(queue.mock.calls.filter((c) => c[0] === 'media-item').map((c) => c[1])).toEqual([{ id: 9, remaster: true, stage_feed: 'quiet' }, { id: 7, remaster: true, stage_feed: 'quotes' }]);
    expect(by.mock.calls.map((c) => c[0])).toEqual(['quiet']);   // a transcribe campaign is never worked on tower
  });
});

describe('changing a tool or its settings re-runs only that stage and its dependents', () => {
  const reg = withEx(TOPICS, RADIO);
  it('a new setting makes only that stage stale', () => {
    const m = { stages: allTicked(reg) };
    const reg2 = withEx({ ...TOPICS, settings: { model: 'sonnet-5-5' } }, RADIO);
    expect(reg2.STAGES.filter((s) => isStale(m, s, reg2))).toEqual(['topics']);
    expect(reg.STAGES.filter((s) => isStale(m, s, reg))).toEqual([]);
  });
  it('re-running it marks it (and its dependents) stale, never an earlier stage; the talk stays on air meanwhile', () => {
    const m = onAir(allTicked(reg));
    expect(markStale(m, 'topics', {}, reg)).toEqual(['topics']);
    expect(m.stages.transcribe.stale).toBeUndefined();
    expect(missingStages(m, undefined, reg)).toEqual(['topics']);
    expect(indexFields(m, reg)).toMatchObject({ restored: 1, next_stage: 'topics' });
    expect(nextJobs({ stages: m.stages }, reg)).toEqual(['text']);
  });
  it('a dependency\'s re-run cascades: quiet → radio (and web/trim/update), transcribe → topics + radio', () => {
    expect(rerunSet('quiet', {}, reg)).toEqual(['quiet', 'web', 'trim', 'radio', 'update'].sort((a, b) => reg.STAGES.indexOf(a) - reg.STAGES.indexOf(b)));
    expect(rerunSet('transcribe', {}, reg).sort()).toEqual(['radio', 'topics', 'transcribe']);
    const m = { stages: allTicked(reg) }; markStale(m, 'transcribe', {}, reg);
    expect(effectiveDone(m.stages, reg).has('topics')).toBe(false);
    expect(nextJobs({ stages: m.stages, have: { prep: true } }, reg)).toEqual(['gpu']);
  });
  it('a published talk\'s re-run also re-renders (update)', () => {
    expect(rerunSet('quotes', { published: true })).toEqual(['quotes', 'update']);
  });
});

describe('tool records', () => {
  it('a tick records tool, settings, fp (the stage\'s own report wins)', () => {
    expect(recordFor('quiet', { tool: 'quiet.py', settings: { v: 1 } })).toEqual({ tool: 'quiet.py', settings: { v: 1 }, fp: fpOf('quiet.py', { v: 1 }) });
    expect(recordFor('quotes').tool).toMatch(/^llm:media-quotes/);
  });
  it('backfill infers records for stages ticked before records existed; unknown stays unrecorded', () => {
    const m = onAir({ quiet: { at: 'x' }, remaster: { at: 'x' }, quotes: { at: 'x' } });
    withRecords(m);
    expect(m.stages.quiet).toMatchObject({ tool: 'quiet.py', settings: { v: 1 }, fp: fpOf('quiet.py', { v: 1 }) });
    expect(m.stages.remaster.tool).toBe('unipase');
    expect(m.stages.quotes.fp).toBeUndefined();
  });
});

describe('the rerun campaign (ops: media rerun)', () => {
  const cands = [{ id: 1, dir: '/d/1', duration_s: 3600, state: 'done', published_at: 'p' }, { id: 2, dir: '/d/2', duration_s: 1800, state: 'done', published_at: null }];
  const deps = (over = {}) => ({ ledger: { rerunCandidates: vi.fn(async () => cands), stageUsd: vi.fn(async () => [0.01, 0.02, 0.03, 0.04]), syncItemStages: vi.fn() }, ops: { pendingRuns: async () => [] }, repo: { setIndex: vi.fn() },
    readMeta: vi.fn(async () => onAir(allTicked(REG))), writeMeta: vi.fn(), ...over });
  it('dry run: talks, audio hours, est $ (p75 per audio hour); writes nothing', async () => {
    const d = deps(), r = await mediaRerunJob({ stage: 'quotes', where: 'fp!=current', mode: 'dry' }, d);
    expect(r).toMatchObject({ stage: 'quotes', redoes: ['quotes', 'update'], talks: 2, audio_h: 1.5 });
    expect(r.est_usd).toBeCloseTo(1.5 * 0.0325, 3);
    expect(d.writeMeta).not.toHaveBeenCalled(); expect(d.repo.setIndex).not.toHaveBeenCalled();
    expect(d.ledger.rerunCandidates.mock.calls[0][0]).toMatchObject({ stage: 'quotes', where: { fp_not: REG.BY.quotes.fp } });
  });
  it('canary marks stale on N talks and re-indexes them (the feed paces the work); a stage the feed cannot run is refused', async () => {
    const d = deps(), r = await mediaRerunJob({ stage: 'quotes', mode: 'canary', limit: 1 }, d);
    expect(r.marked).toEqual([1]);
    const meta = d.writeMeta.mock.calls[0][1];
    expect(meta.stages.quotes.stale).toBeTruthy(); expect(meta.stages.update.stale).toBeTruthy(); expect(meta.stages.transcribe.stale).toBeUndefined();
    expect(d.repo.setIndex.mock.calls[0][1]).toMatchObject({ next_stage: 'quotes', restored: 1 });
    await expect(mediaRerunJob({ stage: 'transcribe', mode: 'dry' }, deps())).rejects.toThrow(/feed/);
  });
});

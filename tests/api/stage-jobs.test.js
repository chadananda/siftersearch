// Typed media jobs, tower side (planning/stage-queue-20261031.md §2-4): nextJobs from the checklist, per-type adoption, feed order, split fraction.
import { describe, it, expect } from 'vitest';
import { STAGES, DEPENDENTS } from '../../api/lib/media/item.js';
import { nextJobs, effectiveDone, AUDIO_TYPES, JOB_TYPES, typedShare, typedEligible, pickNext, bandOf, fpOf, validateTyped, typedJob, stampTools, requiredFiles, haveOf, CONTRACT, chainNext, stepOf } from '../../api/lib/media/stage-jobs.js';

const tick = (list, extra = {}) => Object.fromEntries(list.map((s) => [s, { at: 1, ...extra }]));
const ALL = tick(STAGES);
const without = (...drop) => tick(STAGES.filter((s) => !drop.includes(s)));
const TEXT = ['preview', 'correct', 'clean', 'describe', 'headings', 'quotes', 'links', 'assess'];
const PUBLISH = ['thumb', 'render', 'ingest', 'catalog', 'update'];

describe('nextJobs: which typed job a talk needs next, from its ticked stages', () => {
  it('a complete talk needs nothing', () => expect(nextJobs({ stages: ALL })).toEqual([]));
  it('nothing archived → tower intake only', () => expect(nextJobs({ stages: {} })).toEqual(['intake']));
  it('a new talk (archived only) → cpu-prep first', () => expect(nextJobs({ stages: tick(['archive']) })).toEqual(['cpu-prep']));
  it('prep delivered → gpu; gpu delivered → cpu-finish', () => {
    const st = tick(['archive', 'grade']);
    expect(nextJobs({ stages: st, have: { prep: true } })).toEqual(['gpu']);
    expect(nextJobs({ stages: tick(['archive', 'grade', 'enhance', 'transcribe', 'diarize']), have: { prep: true, gpu: true } })).toEqual(['cpu-finish', 'text']);
  });
  it('a remaster of a published talk (remaster unticked) re-derives prep → gpu → finish, and its dependents are not trusted', () => {
    const st = without('remaster');   // verify/realign/quiet/web/trim/update are still ticked from the OLD remaster
    expect(nextJobs({ stages: st })).toEqual(['cpu-prep']);
    expect(nextJobs({ stages: st, have: { prep: true } })).toEqual(['gpu']);
    expect(nextJobs({ stages: st, have: { prep: true, gpu: true } })).toEqual(['cpu-finish']);
  });
  it('only finish stages missing (e.g. published before the quiet stage) → cpu-finish from the STORED pure remaster, never the gpu again (§7)', () => {
    for (const miss of [['quiet'], ['web'], ['quiet', 'web', 'trim', 'update'], ['verify']]) {
      expect(nextJobs({ stages: without(...miss) })).toEqual(['cpu-finish']);
      expect(nextJobs({ stages: without(...miss), have: { gpu: true } })).toEqual(['cpu-finish']);
    }
  });
  it('the gpu re-runs only when the remaster itself is missing or its pure output is truly gone', () => {
    expect(nextJobs({ stages: without('quiet'), have: { pure: false } })).toEqual(['cpu-prep']);
    expect(nextJobs({ stages: without('quiet'), have: { pure: false, prep: true } })).toEqual(['gpu']);
    expect(nextJobs({ stages: without('remaster') })).toEqual(['cpu-prep']);
  });
  it('dependents are honoured: a stale stage unticks everything made from it, never earlier stages', () => {
    const d = effectiveDone({ ...ALL, realign: { at: 1, stale: true } });
    for (const s of ['realign', 'quiet', 'web', 'trim', 'update']) expect(d.has(s)).toBe(false);
    for (const s of ['remaster', 'verify', 'transcribe', 'quotes']) expect(d.has(s)).toBe(true);
    expect(effectiveDone(without('remaster')).has('quiet')).toBe(false);
    expect(effectiveDone(without('quiet')).has('remaster')).toBe(true);
  });
  it('text-only gaps NEVER yield an audio job (every text and publish stage, alone and together)', () => {
    for (const s of [...TEXT, ...PUBLISH]) {
      const jobs = nextJobs({ stages: without(s) });
      expect(jobs.filter((j) => AUDIO_TYPES.includes(j)), s).toEqual([]);
      expect(jobs.length, s).toBe(1);
    }
    expect(nextJobs({ stages: without(...TEXT, ...PUBLISH) })).toEqual(['text']);
    expect(nextJobs({ stages: without('quotes', 'links') })).toEqual(['text']);
    expect(nextJobs({ stages: without('ingest') })).toEqual(['publish']);
  });
  it('every single missing stage maps to exactly one job type, and audio stages to an audio job', () => {
    for (const s of STAGES) {
      const jobs = nextJobs({ stages: without(s), have: { prep: true, gpu: true } });
      expect(jobs.length, s).toBeGreaterThan(0);
      for (const j of jobs) expect(JOB_TYPES, s).toContain(j);
    }
    for (const s of ['grade']) expect(nextJobs({ stages: without(s) })).toEqual(['cpu-prep']);
    for (const s of ['verify', 'realign', 'web', 'trim']) expect(nextJobs({ stages: without(s), have: { gpu: true } }), s).toEqual(['cpu-finish']);
  });
  it('no text stage has a dependency edge into audio (text re-runs never touch audio)', () => {
    const reach = (s, seen = new Set()) => { for (const d of DEPENDENTS[s] || []) if (!seen.has(d)) { seen.add(d); reach(d, seen); } return seen; };
    for (const s of TEXT) for (const d of reach(s)) expect(['remaster', 'verify', 'realign', 'quiet', 'web', 'trim']).not.toContain(d);
  });
  it('held for Chad / archived: no audio job (terminal until Chad decides), text still runs', () => {
    for (const status of ['review', 'archived', 'kept', 'deferred']) {
      expect(nextJobs({ stages: without('remaster'), remaster_status: status })).toEqual([]);
      expect(nextJobs({ stages: without('remaster', 'quotes'), remaster_status: status })).toEqual(['text']);
    }
  });
});

describe('feed order: priority is ORDER, never a filter', () => {
  const items = { 1: { kind: 'whole' }, 2: { mode: 'restore', published: true }, 3: { mode: 'restore', rerun: true }, 4: { kind: 'whole' }, 5: { mode: 'restore', published: true } };
  it('bands: new talk 0 < remaster of published 1 < re-run 2', () => {
    expect([1, 2, 3].map((id) => bandOf({ items }, id))).toEqual([0, 1, 2]);
  });
  it('best band first, but 1 claim in 5 goes to the oldest lower band, and every talk is eventually taken', () => {
    const its = { ...items, 6: { kind: 'whole' }, 8: { kind: 'whole' }, 9: { kind: 'whole' } };
    const st = { items: its, queue: [3, 2, 1, 4, 6, 8, 9], picks: 0 }, order = [];
    while (st.queue.length) { const i = pickNext(st, () => true); order.push(st.queue.splice(i, 1)[0]); }
    expect(order).toEqual([1, 4, 6, 8, 3, 9, 2]);   // 5th claim: the oldest talk in a lower band (3, queued first)
    const st2 = { items, queue: [3, 1, 4, 2], picks: 0 }, o2 = [];
    while (st2.queue.length) { const i = pickNext(st2, () => true); o2.push(st2.queue.splice(i, 1)[0]); }
    expect(o2).toEqual([1, 4, 2, 3]);
  });
  it('skips what no engaged host can run without dropping it', () => {
    const st = { items, queue: [2, 1], picks: 0 };
    expect(pickNext(st, (id) => id !== 1)).toBe(0);
    expect(st.queue).toEqual([2, 1]);
    expect(pickNext({ items, queue: [1], picks: 0 }, () => false)).toBe(-1);
  });
});


describe('split fraction: the whole path keeps working while typed jobs prove out', () => {
  it('0 → none typed, 1 → all typed, 0.5 → a stable per-talk half', () => {
    const ids = Array.from({ length: 400 }, (_, i) => i + 1);
    expect(ids.filter((id) => typedShare(id, 0)).length).toBe(0);
    expect(ids.filter((id) => typedShare(id, 1)).length).toBe(400);
    const half = ids.filter((id) => typedShare(id, 0.5)).length;
    expect(half).toBeGreaterThan(150); expect(half).toBeLessThan(250);
    expect(ids.map((id) => typedShare(id, 0.5))).toEqual(ids.map((id) => typedShare(id, 0.5)));
  });
  it('eligible = exactly the talks the whole kind takes (remasters of published talks keep restore/post: the gpu step re-transcribes)', () => {
    const st = { items: { 1: { kind: 'whole' }, 2: { kind: 'restore' }, 3: { kind: 'post' } } };
    expect([1, 2, 3, 4].map((id) => typedEligible(st, id))).toEqual([true, false, false, false]);
  });
  it('haveOf reads the chain: only ADOPTED steps count', () => {
    expect(haveOf({})).toEqual({ prep: false, gpu: false });
    expect(haveOf({ 'cpu-prep': { adopted: 1 }, gpu: { id: 'g' } })).toEqual({ prep: true, gpu: false });
  });
});

const H = (c) => c.repeat(64);
const result = (type, over = {}) => ({ v: 1, type, contract: CONTRACT.contract, ok: true, input_sha: 'abc', slug: 't',
  files: requiredFiles(type).map((path, i) => ({ path, sha256: H('0123456789abcdef'[i % 16]) })), meta: { remaster: {} }, ...over });

describe('validateTyped: each step against job-types.json (B), never splice, quiet before complete', () => {
  it('the contract names fixed outputs for every audio type', () => {
    expect(requiredFiles('cpu-prep')).toEqual(expect.arrayContaining(['meta.json', 'enhanced/light.flac', 'waveform.json']));
    expect(requiredFiles('gpu')).toEqual(expect.arrayContaining(['meta.json', 'transcript.raw.json']));
    for (const t of AUDIO_TYPES) for (const f of requiredFiles(t)) expect(f).not.toMatch(/[{…]/);
  });
  it('a good prep / gpu result passes; uploads must cover every listed file', () => {
    for (const t of ['cpu-prep', 'gpu']) {
      const r = result(t);
      expect(validateTyped(t, r, { inputSha: 'abc', slug: 't', outputs: r.files.map((f) => 'item/' + f.path) })).toBe(r);
      expect(() => validateTyped(t, r, { outputs: [] })).toThrow(/not uploaded/);
    }
  });
  it('refusals name the reason: wrong type, contract, original, slug, worker failure, missing or unsafe file', () => {
    expect(() => validateTyped('gpu', result('cpu-prep'))).toThrow(/type/);
    expect(() => validateTyped('gpu', result('gpu', { contract: 99 }))).toThrow(/re-image/);
    expect(() => validateTyped('gpu', result('gpu'), { inputSha: 'zzz' })).toThrow(/different original/);
    expect(() => validateTyped('gpu', result('gpu'), { slug: 'u' })).toThrow(/slug/);
    expect(() => validateTyped('gpu', result('gpu', { ok: false, why: 'OOM' }))).toThrow(/OOM/);
    const r = result('cpu-prep'); r.files = r.files.filter((f) => f.path !== 'enhanced/light.flac');
    expect(() => validateTyped('cpu-prep', r)).toThrow(/light\.flac/);
    const u = result('cpu-prep'); u.files.push({ path: '../etc/x', sha256: H('a') });
    expect(() => validateTyped('cpu-prep', u)).toThrow(/unsafe/);
    const o = result('cpu-prep'); o.files.push({ path: 'original/x.mp3', sha256: H('a') });
    expect(() => validateTyped('cpu-prep', o)).toThrow(/unsafe/);
  });
  it('never splice: any original sentence in the remaster is refused at every step', () => {
    for (const t of AUDIO_TYPES) {
      expect(() => validateTyped(t, result(t, { meta: { remaster: { swapped: 2, quiet: { v: 1 } } } }))).toThrow(/splice/);
      expect(() => validateTyped(t, result(t, { meta: { remaster: { fallback_sent_pct: 1, quiet: { v: 1 } } } }))).toThrow(/splice/);
      expect(() => validateTyped(t, result(t, { meta: { remaster: { quiet: { v: 1 } }, qa: { remaster: { verdict: 'spliced' } } } }))).toThrow(/splice/);
    }
  });
  it('cpu-finish needs the quiet pass, except a held talk (measured regression → Chad decides)', () => {
    expect(() => validateTyped('cpu-finish', result('cpu-finish', { meta: { remaster: { swapped: 0 } } }))).toThrow(/quiet/);
    expect(validateTyped('cpu-finish', result('cpu-finish', { meta: { remaster: { swapped: 0, quiet: { v: 1 } } } })).ok).toBe(true);
    expect(validateTyped('cpu-finish', result('cpu-finish', { meta: { remaster: { status: 'review' } } })).ok).toBe(true);
  });
});

describe('typedJob: the next step\'s queue job', () => {
  const wj = { input: 'in.mp3', input_sha: 'abc', threads: 4, meta: { slug: 't' } };
  it('cpu-prep carries tower meta and only the original (file_id); typed, banded, contract-tagged', () => {
    const j = typedJob('cpu-prep', { itemId: 7, fileId: 'f-abc', wj, band: 0 });
    expect(j).toMatchObject({ type: 'cpu-prep', file_id: 'f-abc', item_id: 7, contract: CONTRACT.contract, band: 0, inputs: [] });
    expect(j.id).toMatch(/^cpu-prep-7-[0-9a-f]{12}$/);
    expect(j.job).toMatchObject({ v: 1, type: 'cpu-prep', id: 7, input: 'in.mp3', input_sha: 'abc', meta: { slug: 't' } });
  });
  it('later steps take the previous result\'s files from the results store (sha-checked), no tower meta', () => {
    const prev = { id: 'cpu-prep-7-x', files: [{ path: 'meta.json', sha256: H('a') }, { path: 'enhanced/light.flac', sha256: H('b') }] };
    const j = typedJob('gpu', { itemId: 7, fileId: 'f-abc', wj, prev });
    expect(j.inputs).toEqual([
      { name: 'item/meta.json', store: 'results', id: 'cpu-prep-7-x', path: 'item/meta.json', sha256: H('a') },
      { name: 'item/enhanced/light.flac', store: 'results', id: 'cpu-prep-7-x', path: 'item/enhanced/light.flac', sha256: H('b') }]);
    expect(j.job.meta).toBeUndefined();
    expect(j.need.vram_mb).toBeGreaterThan(0);
    expect(typedJob('gpu', { itemId: 7, fileId: 'f', wj, prev: { ...prev, id: 'other' } }).id).not.toBe(j.id);
  });
});

describe('stampTools: each ticked audio stage records tool, settings, fp, host and job', () => {
  it('fp = short stable hash of tool + settings', () => {
    expect(fpOf('unipase', { a: 1, b: 2 })).toBe(fpOf('unipase', { b: 2, a: 1 }));
    expect(fpOf('unipase', { a: 1 })).not.toBe(fpOf('unipase', { a: 2 }));
    expect(fpOf('x', {})).toMatch(/^[0-9a-f]{12}$/);
  });
  it('stamps from the step that did the stage; text stages untouched', () => {
    const meta = { stages: { ...tick(['grade', 'transcribe', 'remaster', 'quiet']), quotes: { at: 1, tool: 'q' } }, remaster: { quiet: { v: 1 } } };
    stampTools(meta, { 'cpu-prep': { id: 'p', host: 'boss' }, gpu: { id: 'g', host: 'aorus', tools: { transcribe: { tool: 'whisper-large-v3', settings: { b: 5 } } } }, 'cpu-finish': { id: 'f', host: 'boss' } });
    expect(meta.stages.transcribe).toMatchObject({ at: 1, tool: 'whisper-large-v3', settings: { b: 5 }, fp: fpOf('whisper-large-v3', { b: 5 }), host: 'aorus', job: 'g' });
    expect(meta.stages.grade).toMatchObject({ host: 'boss', job: 'p' });
    expect(meta.stages.remaster).toMatchObject({ tool: 'unipase', job: 'f' });
    expect(meta.stages.quiet).toMatchObject({ tool: 'quiet.py', settings: { v: 1 } });
    expect(meta.stages.quotes).toEqual({ at: 1, tool: 'q' });
  });
});

describe('chainNext: the next audio step from tower meta + the adopted steps', () => {
  const m = { stages: tick(['archive']) };
  it('new talk → cpu-prep → gpu → cpu-finish → none', () => {
    expect(chainNext(m, {})).toBe('cpu-prep');
    const prep = stepOf({ id: 'p', host: 'boss' }, { files: [], meta: { stages: tick(['archive', 'grade']) } });
    expect(prep).toMatchObject({ id: 'p', host: 'boss', ticks: { grade: { at: 1 } } });
    expect(chainNext(m, { 'cpu-prep': prep })).toBe('gpu');
    const gpu = stepOf({ id: 'g' }, { files: [], meta: { stages: tick(['archive', 'grade', 'enhance', 'transcribe', 'diarize']) } });
    expect(chainNext(m, { 'cpu-prep': prep, gpu })).toBe('cpu-finish');
    expect(chainNext({ stages: without() }, { 'cpu-prep': prep, gpu })).toBe(null);
  });
  it('a gpu step that ticked nothing asks for gpu again (the feeder refuses it rather than loop)', () => {
    const prep = stepOf({ id: 'p' }, { meta: { stages: tick(['grade']) } });
    expect(chainNext(m, { 'cpu-prep': prep, gpu: stepOf({ id: 'g' }, { meta: { stages: {} } }) })).toBe('gpu');
  });
});

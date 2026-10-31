// Duplicate talks (Chad 10-31: "duplicate talks should merge metadata and eliminate all but the best"): the best copy by
// MEASURED quality (remaster when every copy has one, else the original) and completeness — never by length or bitrate —
// metadata merged into it (gaps filled, conflicts recorded, every provenance kept), the rest off air with terminal outcome
// 'duplicate', search documents removed, runs cancelled, files kept, slugs redirected to the best.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(async () => ({})), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { copyQuality, pickBest, mergeMeta, groupsFromRows, intakeDedupe, mediaDedupeJob, NOISE } from '../../api/lib/media/dedupe.js';

const DONE = ['remaster', 'verify', 'quiet', 'transcribe', 'diarize', 'correct', 'headings', 'quotes', 'links', 'assess', 'ingest', 'catalog', 'web'];
const stages = (list) => Object.fromEntries(list.map((s) => [s, { at: '2026-10-30T00:00:00Z' }]));
const onAirMeta = (extra = {}) => ({ stages: stages(DONE), remaster: { status: 'done', quiet: { v: 99 }, output_assessment: { passed: true, restored: { nisqa: [3.6] }, reference: { nisqa: [2.4] } } },
  enhancement: { listening: 'unipase' }, web_listening: 'unipase', qa: { remaster: { verdict: 'usable' } }, quality: { overall: 'C', raw: { nisqa: { mos: 2.4 }, bandwidth_khz: 4 } }, ...extra });
const srcMeta = (mos, extra = {}) => ({ stages: stages(['archive', 'grade', 'transcribe']), quality: { overall: 'D', raw: { nisqa: { mos }, bandwidth_khz: 4 } }, ...extra });

describe('the best copy', () => {
  it('measures the original when not every copy has a remaster; length and bitrate never decide', () => {
    const long = { id: 1, slug: 'long', meta: srcMeta(1.42, { duration_s: 3700, source: { probe: { bit_rate: 128000 } } }) };
    const short = { id: 2, slug: 'short', meta: srcMeta(2.47, { duration_s: 3500, source: { probe: { bit_rate: 24000 } } }) };
    const r = pickBest([long, short]);
    expect(r.best.slug).toBe('short');
    expect(r.basis).toBe('original');
    expect(r.ambiguous).toBe(false);
    expect(r.reason).toMatch(/original NISQA 2\.47 vs 1\.42/);
  });
  it('compares the remasters when every copy has one', () => {
    const a = { id: 1, slug: 'a', meta: onAirMeta() };
    const b = { id: 2, slug: 'b', meta: onAirMeta({ remaster: { ...onAirMeta().remaster, output_assessment: { passed: true, restored: { nisqa: [3.1] } } } }) };
    expect(pickBest([b, a])).toMatchObject({ basis: 'remaster', best: { slug: 'a' }, ambiguous: false });
  });
  it('scores within noise → the more complete copy wins and the group is listed as ambiguous (never blocks)', () => {
    const live = { id: 5, slug: 'live', meta: onAirMeta({ quality: { overall: 'D', raw: { nisqa: { mos: 2.40 } } } }) };
    const fresh = { id: 9, slug: 'fresh', meta: srcMeta(2.40 + NOISE / 2) };
    const r = pickBest([fresh, live]);
    expect(r.best.slug).toBe('live');
    expect(r.ambiguous).toBe(true);
    expect(r.reason).toMatch(/within noise/);
  });
  it('a copy without a folder (same file recorded, never processed) never wins over a measured copy', () => {
    const r = pickBest([{ id: 1, slug: null, meta: null }, { id: 2, slug: 'x', meta: srcMeta(1.2) }]);
    expect(r.best.id).toBe(2);
  });
  it('copyQuality reads NISQA in/out, grade and completeness', () => {
    expect(copyQuality(onAirMeta())).toMatchObject({ remaster: 3.6, original: 2.4, grade: 'C', on_air: true, missing: 0 });
    expect(copyQuality(srcMeta(2))).toMatchObject({ remaster: null, original: 2, on_air: false });
  });
});

describe('metadata merge', () => {
  it('fills what the best lacks, records conflicts without overwriting, keeps every provenance, never touches the transcript', () => {
    const best = { id: 1, slug: 'best', meta: { title: 'Revelation, Motive Power of Civilization', speaker: 'Khan, J.', date: '1992-11-11', place: null, summary: 'kept',
      source: { path: '/tank/media/collection-08/BWC/Khan - Revelation.mp3' }, collection: 'BWC', provenance: [{ label: 'Donated by Hunt and Noghiu' }] } };
    const other = { id: 2, slug: 'other', meta: { title: 'Divine Revelation', speaker: 'Peter Khan', date: '1992-11-11', place: 'Haifa', occasion: 'BWC staff talk', summary: 'other summary',
      source: { path: '/tank/media/collection-09/Talks/Khan - Divine Revelation.mp3' }, collection: 'Talks', provenance: [{ label: 'Donated by the Smith family' }] } };
    const twin = { id: 3, slug: null, source_ref: '/tank/media/collection-10/Khan copy.mp3', meta: null };
    const r = mergeMeta(best, [other, twin]);
    expect(r.patch.place).toBe('Haifa');
    expect(r.patch.occasion).toBe('BWC staff talk');
    expect(r.patch.speaker).toBeUndefined();
    expect(r.patch.summary).toBeUndefined();
    expect(r.conflicts).toContainEqual(expect.objectContaining({ field: 'speaker', kept: 'Khan, J.', other: 'Peter Khan', from: 'other' }));
    expect(r.merged).toContainEqual({ field: 'place', value: 'Haifa', from: 'other' });
    expect(r.patch.alt_titles).toEqual(['Divine Revelation']);
    const labels = r.patch.provenance.map((p) => p.label).filter(Boolean);
    expect(labels).toEqual(expect.arrayContaining(['Donated by Hunt and Noghiu', 'Donated by the Smith family']));
    expect(r.patch.provenance.map((p) => p.path)).toEqual(expect.arrayContaining(['/tank/media/collection-09/Talks/Khan - Divine Revelation.mp3', '/tank/media/collection-10/Khan copy.mp3']));
    // idempotent: merged again → nothing new
    const again = mergeMeta({ ...best, meta: { ...best.meta, ...r.patch } }, [other, twin]);
    expect(again.changed).toBe(false);
  });
});

describe('metadata merge: dates agree', () => {
  it('a year that contradicts the best\'s date is a conflict, never a fill', () => {
    const r = mergeMeta({ slug: 'b', meta: { date: '2022-07-07' } }, [{ slug: 'o', meta: { year: 2011, place: 'Canada' } }, { slug: 'p', meta: { year: 2022 } }]);
    expect(r.patch.year).toBe(2022);
    expect(r.conflicts).toContainEqual(expect.objectContaining({ field: 'year', other: 2011, from: 'o' }));
    expect(r.patch.place).toBe('Canada');
  });
});

describe('groups', () => {
  it('joins copies by dup_group, Dewey\'s "duplicate of <slug>", "same file as item N" and meta.dedup.of', () => {
    const rows = [
      { id: 10, slug: 'a', state: 'done' },
      { id: 11, slug: 'b', state: 'duplicate', why: 'Dewey duplicate of a (opening-and-middle-text, score 0.62)' },
      { id: 12, slug: null, state: 'duplicate', why: 'same file as item 11 (b)' },
      { id: 20, slug: 'c', state: 'done', dup_group: 20 },
      { id: 21, slug: 'd', state: 'duplicate', dup_group: 20 },
      { id: 30, slug: 'e', state: 'duplicate', why: 'superseded' },
    ];
    const g = groupsFromRows(rows).map((x) => x.map((r) => r.id).sort((p, q) => p - q));
    expect(g).toContainEqual([10, 11, 12]);
    expect(g).toContainEqual([20, 21]);
    expect(g.find((x) => x.includes(30))).toBeUndefined();
  });
});

describe('intake (preview stage): the dedupe check for every new talk', () => {
  const held = { id: 1, slug: 'held', state: 'done', dup_group: null, dir: '/d/held' };
  it('a new copy that measures worse is the duplicate; both join one group', async () => {
    const r = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(1.4, { slug: 'new' }), verdict: { verdict: 'duplicate', of: 'held' } },
      { repo: { getMediaBySlug: async () => held }, readMeta: async () => onAirMeta() });
    expect(r).toMatchObject({ action: 'duplicate', best: 'held', group: 1 });
  });
  it('a new copy that measures better goes on through the pipeline; the held copy stays on air until it is complete', async () => {
    const r = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(3.5, { slug: 'new' }), verdict: { verdict: 'duplicate', of: 'held' } },
      { repo: { getMediaBySlug: async () => held }, readMeta: async () => onAirMeta() });
    expect(r).toMatchObject({ action: 'best', best: 'new', group: 1 });
    expect(r.reason).toMatch(/original NISQA 3\.5 vs 2\.4/);
  });
  it('a copy the group already chose as best is never marked duplicate again on a re-run', async () => {
    const r = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(1, { dedup: { verdict: 'best', group: 1 } }), verdict: { verdict: 'duplicate', of: 'held' } }, { repo: {}, readMeta: async () => null });
    expect(r.action).toBe('best');
  });
});

describe('media-dedupe job', () => {
  const mk = () => {
    const rows = [
      { id: 10, slug: 'live', state: 'done', restored: 1, dir: '/d/live', doc_id: 100, dup_group: null },
      { id: 11, slug: 'worse', state: 'duplicate', restored: 0, dir: '/d/worse', doc_id: 101, why: 'Dewey duplicate of live (x)' },
    ];
    const metas = { '/d/live': onAirMeta({ slug: 'live', title: 'T', speaker: 'S', place: null }), '/d/worse': srcMeta(1.1, { slug: 'worse', title: 'T alt', speaker: 'S', place: 'Haifa' }) };
    const writes = {}, calls = { marked: [], groups: [], revived: [], deleted: [], purged: [], cancelled: [], queued: [] };
    const deps = {
      repo: { dedupeRows: async () => rows, setDupGroup: async (ids, g) => calls.groups.push([ids, g]), markDuplicateItems: async (ids, why, g) => calls.marked.push({ ids, why, g }),
        reviveItem: async (id, why, g) => calls.revived.push({ id, why, g }) },
      readMeta: async (dir) => metas[dir], writeMeta: async (dir, m) => { writes[dir] = m; },
      ops: { pendingRuns: async () => [], cancel: async (id) => calls.cancelled.push(id) },
      docs: { softDeleteDocs: async (ids) => { calls.deleted.push(...ids); return { deleted: ids.length, refused: [] }; } },
      allowWrite: true, purge: async (s) => { calls.purged.push(s); return true; }, queue: async (n, p) => calls.queued.push([n, p]), now: () => 'T0',
    };
    return { rows, metas, writes, calls, deps };
  };
  it('dry run: groups, the best + why, merged fields — and no writes', async () => {
    const { deps, writes, calls } = mk();
    const r = await mediaDedupeJob({}, deps);
    expect(r.groups).toBe(1);
    expect(r.sample[0]).toMatchObject({ best: 'live', basis: 'original', eliminate: ['worse'], merged: [{ field: 'place', value: 'Haifa', from: 'worse' }] });
    expect(r.sample[0].reason).toMatch(/NISQA/);
    expect(Object.keys(writes)).toHaveLength(0);
    expect(calls.marked).toHaveLength(0);
  });
  it('write: the best gets the merge (and an update run), the rest go off air, out of search and out of every queue; files kept', async () => {
    const { deps, writes, calls } = mk();
    const r = await mediaDedupeJob({ write: true }, deps);
    expect(writes['/d/live'].place).toBe('Haifa');
    expect(writes['/d/live'].dedup_best).toMatchObject({ basis: 'original', duplicates: ['worse'] });
    expect(writes['/d/worse'].dedup).toMatchObject({ verdict: 'duplicate', best: 'live' });
    expect(calls.marked[0]).toMatchObject({ ids: [11], g: 10 });
    expect(calls.marked[0].why).toMatch(/duplicate of live/);
    expect(calls.deleted).toEqual([101]);
    expect(calls.purged).toContain('worse');
    expect(calls.queued).toContainEqual(['media-item', { id: 10, redo: ['update'] }]);
    expect(r.eliminated).toBe(1);
  });
  it('a better copy not yet complete is revived into the pipeline; the on-air copy stays on air until the best is complete', async () => {
    const { deps, metas, calls } = mk();
    metas['/d/worse'] = srcMeta(4.2, { slug: 'worse' });
    const r = await mediaDedupeJob({ write: true }, deps);
    expect(calls.revived).toEqual([expect.objectContaining({ id: 11, g: 10 })]);
    expect(calls.marked).toHaveLength(0);
    expect(calls.deleted).toHaveLength(0);
    expect(r.pending).toBe(1);
  });
  it('copies not yet graded are left until they are (no flip-flop once measured)', async () => {
    const { deps, metas, calls } = mk();
    delete metas['/d/live'].quality; delete metas['/d/worse'].quality;
    deps.repo.dedupeRows = async () => [{ id: 10, slug: 'live', state: 'queued', dir: '/d/live' }, { id: 11, slug: 'worse', state: 'duplicate', dir: '/d/worse', why: 'Dewey duplicate of live (x)' }];
    metas['/d/live'] = srcMeta(null); metas['/d/worse'] = srcMeta(null);
    const r = await mediaDedupeJob({ write: true }, deps);
    expect(r.unmeasured).toBe(1);
    expect(calls.marked).toHaveLength(0);
    expect(calls.revived).toHaveLength(0);
  });
  it('a second pass changes nothing and rewrites no meta.json', async () => {
    const { deps, rows, metas, writes, calls } = mk();
    await mediaDedupeJob({ write: true }, deps);
    Object.assign(metas, writes);
    for (const r of rows) { r.dup_group = 10; if (r.id === 11) r.state = 'duplicate'; r.doc_id = r.id === 11 ? null : r.doc_id; }
    for (const k of Object.keys(writes)) delete writes[k];
    calls.marked.length = 0; calls.queued.length = 0;
    const r = await mediaDedupeJob({ write: true }, deps);
    expect(r).toMatchObject({ eliminated: 0, already: 1 });
    expect(Object.keys(writes)).toHaveLength(0);
    expect(calls.marked).toHaveLength(0);
    expect(calls.queued).toHaveLength(0);
  });
  it('a group with a run in hand is left for the next pass', async () => {
    const { deps, calls } = mk();
    deps.ops.pendingRuns = async (n) => (n === 'media-item' ? [{ id: 7, params: { id: 10 } }] : []);
    const r = await mediaDedupeJob({ write: true }, deps);
    expect(r.busy).toBe(1);
    expect(calls.marked).toHaveLength(0);
  });
});

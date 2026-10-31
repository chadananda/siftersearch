// Duplicate talks (Chad 10-31: "duplicate talks should merge metadata and eliminate all but the best"): the best copy by
// MEASURED quality (remaster when every copy has one, else the original) and completeness — never by length or bitrate —
// metadata merged into it (gaps filled, conflicts recorded, every provenance kept), the rest off air with terminal outcome
// 'duplicate', search documents removed, runs cancelled, files kept, slugs redirected to the best.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(async () => ({})), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { copyQuality, pickBest, mergeMeta, groupsFromRows, intakeDedupe, mediaDedupeJob, NOISE, gramSet, overlap, datesAgree, confirmPair, gateGroup, undoPlan } from '../../api/lib/media/dedupe.js';

// a deterministic "speech": n distinct words from a seed (no 5-gram shared between seeds)
const speech = (seed, n = 400, from = 0) => Array.from({ length: n }, (_, i) => `w${seed}x${i + from}`).join(' ');
const TALK = speech('a'), OTHER = speech('b');

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
  const readText = async () => TALK;
  it('a new copy that measures worse is the duplicate; both join one group', async () => {
    const r = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(1.4, { slug: 'new' }), verdict: { verdict: 'duplicate', of: 'held' }, text: TALK },
      { repo: { getMediaBySlug: async () => held }, readMeta: async () => onAirMeta(), readText });
    expect(r).toMatchObject({ action: 'duplicate', best: 'held', group: 1 });
  });
  it('a new copy that measures better goes on through the pipeline; the held copy stays on air until it is complete', async () => {
    const r = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(3.5, { slug: 'new' }), verdict: { verdict: 'duplicate', of: 'held' }, text: TALK },
      { repo: { getMediaBySlug: async () => held }, readMeta: async () => onAirMeta(), readText });
    expect(r).toMatchObject({ action: 'best', best: 'new', group: 1 });
    expect(r.reason).toMatch(/original NISQA 3\.5 vs 2\.4/);
  });
  it('a copy the group already chose as best is never marked duplicate again on a re-run', async () => {
    const r = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(1, { dedup: { verdict: 'best', group: 1 } }), verdict: { verdict: 'duplicate', of: 'held' } }, { repo: {}, readMeta: async () => null });
    expect(r.action).toBe('best');
  });
  it('the label is only a candidate: a different speech is its own talk, never a duplicate', async () => {
    const r = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(1.4, { slug: 'new' }), verdict: { verdict: 'duplicate', of: 'held' }, text: OTHER },
      { repo: { getMediaBySlug: async () => held }, readMeta: async () => onAirMeta(), readText });
    expect(r).toMatchObject({ action: 'new', group: null });
    expect(r.reason).toMatch(/transcripts differ/);
  });
  it('the same speech on different dates is ONE talk: dates are metadata, never a gate (Chad 10-31)', async () => {
    const r = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(1.4, { slug: 'new', date: '2022-07-07' }), verdict: { verdict: 'duplicate', of: 'held' }, text: TALK },
      { repo: { getMediaBySlug: async () => held }, readMeta: async () => onAirMeta({ date: '2011-03-01' }), readText, candidates: [] });
    expect(r.action).toBe('duplicate');
    expect(r.check.dates_agree).toBe(false);
  });
  it('the content index finds the same speech Dewey never labelled (any length, title or date)', async () => {
    const other = { id: 7, slug: 'elsewhere', state: 'done', dir: '/d/elsewhere' };
    const r = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(1.4, { slug: 'new', title: 'Another title', date: '1999' }), verdict: { verdict: 'new' }, text: speech('a', 330, 70) },
      { repo: { getMediaItem: async (id) => (id === 7 ? other : { id, state: 'duplicate' }) }, readMeta: async () => onAirMeta(), readText, candidates: [9, 7] });
    expect(r).toMatchObject({ action: 'duplicate', of: 'elsewhere', best: 'elsewhere', group: 7 });
    expect(r.check.from).toBe('content index');
  });
  it('a content-index candidate that is a different speech leaves the talk new', async () => {
    const r = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(1.4), verdict: { verdict: 'new' }, text: OTHER },
      { repo: { getMediaItem: async () => ({ id: 7, slug: 'x', state: 'done', dir: '/d/x' }) }, readMeta: async () => onAirMeta(), readText, candidates: [7] });
    expect(r.action).toBe('new');
    expect(r.tried[0]).toMatchObject({ with: 'x', by: 'transcripts differ' });
  });
  it('no transcript on the held copy, or the held copy missing → content unconfirmed → not a duplicate', async () => {
    const a = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(1.4), verdict: { verdict: 'duplicate', of: 'held' }, text: TALK },
      { repo: { getMediaBySlug: async () => held }, readMeta: async () => onAirMeta(), readText: async () => '', candidates: [] });
    expect(a.action).toBe('new');
    const b = await intakeDedupe({ item: { id: 2 }, meta: srcMeta(1.4), verdict: { verdict: 'duplicate', of: 'gone' }, text: TALK }, { repo: { getMediaBySlug: async () => null }, readMeta: async () => null, candidates: [] });
    expect(b.action).toBe('new');
  });
});

describe('the content gate', () => {
  it('overlap: a trimmed intro still contains the shorter copy; different talks share nothing', () => {
    const full = gramSet(TALK), trimmed = gramSet(speech('a', 330, 70));
    const o = overlap(trimmed, full);
    expect(o.containment).toBe(1);
    expect(o.coverage).toBeGreaterThan(0.8);
    expect(overlap(full, gramSet(OTHER)).containment).toBe(0);
    expect(overlap(gramSet(''), full)).toBeNull();
  });
  it('dates agree: equal, or missing on one side; a year must match a full date', () => {
    expect(datesAgree({ date: '2020-05-01' }, { date: '2020-05-01' })).toBe(true);
    expect(datesAgree({ date: '2022-07-07' }, { date: '2011-07-07' })).toBe(false);
    expect(datesAgree({ date: '2020-05-01' }, { date: '2018' })).toBe(false);
    expect(datesAgree({ date: '2020-05-01' }, {})).toBe(true);
    expect(datesAgree({ year: 2020 }, { date: '2020-05-01' })).toBe(true);
    expect(datesAgree({ date: '2020-05-01' }, { date: '2020-06-01' })).toBe(false);
  });
  it('confirmPair: same audio file confirms without text; no text → unconfirmed; too short → unconfirmed', () => {
    const sha = { source: { sha256: 'abc' } };
    expect(confirmPair({ meta: sha, text: null }, { meta: sha, text: null })).toMatchObject({ same: true, by: 'same file (sha256)' });
    // a folderless "same file as item N" row carries the hash on the row itself
    expect(confirmPair({ sha256: 'f1', meta: null, text: null }, { sha256: 'f1', meta: {}, text: null })).toMatchObject({ same: true, by: 'same file (sha256)' });
    expect(confirmPair({ meta: {}, text: null }, { meta: {}, text: gramSet(TALK) })).toMatchObject({ same: false, by: expect.stringMatching(/unconfirmed/) });
    expect(confirmPair({ meta: {}, text: gramSet(speech('a', 60)) }, { meta: {}, text: gramSet(TALK) }).same).toBe(false);
    expect(confirmPair({ meta: {}, text: gramSet(TALK) }, { meta: {}, text: gramSet(speech('a', 330, 70)) })).toMatchObject({ same: true, by: 'transcript overlap' });
  });
  it('confirmPair: the same speech with dates that disagree is the same talk (dates reported, never a gate)', () => {
    const r = confirmPair({ meta: { date: '2022-07-07' }, text: gramSet(TALK) }, { meta: { date: '2011-01-01' }, text: gramSet(TALK) });
    expect(r).toMatchObject({ same: true, by: 'transcript overlap', dates_agree: false });
    expect(confirmPair({ sha256: 'f', meta: { year: 1990 } }, { sha256: 'f', meta: { year: 1992 } })).toMatchObject({ same: true, dates_agree: false });
  });
  it('gateGroup: a chained group splits — the matching pair stays, the stranger is dissolved', () => {
    const c = (id, t, meta = {}) => ({ id, slug: `s${id}`, meta, text: t ? gramSet(t) : null });
    const r = gateGroup([c(1, TALK), c(2, speech('a', 350, 30)), c(3, OTHER)]);
    expect(r.components.map((x) => x.map((y) => y.id))).toEqual([[1, 2]]);
    expect(r.dissolved.map((x) => x.id)).toEqual([3]);
  });
});

describe('media-dedupe job', () => {
  const mk = () => {
    const rows = [
      { id: 10, slug: 'live', state: 'done', restored: 1, dir: '/d/live', doc_id: 100, dup_group: null },
      { id: 11, slug: 'worse', state: 'duplicate', restored: 0, dir: '/d/worse', doc_id: 101, why: 'Dewey duplicate of live (x)' },
    ];
    const metas = { '/d/live': onAirMeta({ slug: 'live', title: 'T', speaker: 'S', place: null }), '/d/worse': srcMeta(1.1, { slug: 'worse', title: 'T alt', speaker: 'S', place: 'Haifa' }) };
    const texts = { '/d/live': TALK, '/d/worse': speech('a', 380, 10) };
    const writes = {}, calls = { marked: [], groups: [], revived: [], deleted: [], purged: [], cancelled: [], queued: [], undone: [], cleared: [], restoredDocs: [] };
    const deps = {
      repo: { dedupeRows: async () => rows, setDupGroup: async (ids, g) => calls.groups.push([ids, g]), markDuplicateItems: async (ids, why, g) => calls.marked.push({ ids, why, g }),
        reviveItem: async (id, why, g) => calls.revived.push({ id, why, g }), undoDuplicate: async (id, st, why) => calls.undone.push({ id, st, why }), clearDupGroup: async (ids) => calls.cleared.push(...ids) },
      readMeta: async (dir) => metas[dir], writeMeta: async (dir, m) => { writes[dir] = m; },
      ops: { pendingRuns: async () => [], cancel: async (id) => calls.cancelled.push(id) },
      docs: { softDeleteDocs: async (ids) => { calls.deleted.push(...ids); return { deleted: ids.length, refused: [] }; } },
      allowWrite: true, purge: async (s) => { calls.purged.push(s); return true; }, queue: async (n, p) => calls.queued.push([n, p]), now: () => 'T0',
      textStamp: async (dir) => `${dir}@1`, readText: async (dir) => texts[dir], prior: { since: 'T-1', prior: {}, merged: [] }, pairCache: new Map(),
      content: { restoreRetiredDocs: async (ids) => { calls.restoredDocs.push(...ids); return { restored: ids.length }; } },
    };
    return { rows, metas, texts, writes, calls, deps };
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
  it('a group the content gate dissolves is not settled, and the distribution is reported', async () => {
    const { deps, texts, calls } = mk();
    texts['/d/worse'] = OTHER;
    const r = await mediaDedupeJob({ write: true }, deps);
    expect(r).toMatchObject({ groups: 0, dissolved_groups: 1, eliminated: 0 });
    expect(r.measure.by['transcripts differ']).toBe(1);
    expect(r.measure.containment['0.00-0.05']).toBe(1);
    const c = await mediaDedupeJob({ controls: true }, { ...deps, pairCache: new Map() });
    expect(c.control.pairs).toBe(0);   // one group: nothing to compare against
    expect(calls.marked).toHaveLength(0);
  });
  it('reversal: an elimination the gate dissolves goes back to its prior state, search doc restored, page re-rendered, link cleared', async () => {
    const { deps, rows, metas, texts, calls, writes } = mk();
    texts['/d/worse'] = OTHER;
    rows[1].state = 'duplicate'; rows[1].why = 'duplicate of live: original NISQA'; rows[1].dup_group = 10; rows[0].dup_group = 10; rows[1].restored = 1;   // was on air
    metas['/d/worse'].dedup = { verdict: 'duplicate', best: 'live', group: 10 };
    metas['/d/live'].dedup_best = { group: 10, duplicates: ['worse'] }; metas['/d/live'].place = 'Haifa'; metas['/d/live'].alt_titles = ['T alt'];
    deps.prior = { since: 'T-1', prior: { worse: 'done', live: 'done' }, merged: [{ group: 10, best: 'live', field: 'place', value: 'Haifa', from: 'worse' }] };
    const r = await mediaDedupeJob({ write: true }, deps);
    expect(calls.undone).toEqual([expect.objectContaining({ id: 11, st: 'done' })]);
    expect(calls.restoredDocs).toEqual([101]);
    expect(calls.queued).toContainEqual(['media-item', { id: 11, redo: ['update'] }]);
    expect(calls.cleared).toContain(10);
    expect(writes['/d/live'].place).toBeUndefined();
    expect(writes['/d/live'].alt_titles).toBeUndefined();
    expect(writes['/d/live'].dedup_best).toBeUndefined();
    expect(writes['/d/worse'].dedup.verdict).toBe('dissolved');
    expect(r.restored.to['duplicate→done']).toBe(1);
    // a second pass finds nothing left to undo
    Object.assign(metas, writes); rows[1].state = 'done'; rows[1].dup_group = null; rows[0].dup_group = null; rows[1].why = 'media-dedupe reversed';
    calls.undone.length = 0;
    const again = await mediaDedupeJob({ write: true }, deps);
    expect(calls.undone).toHaveLength(0);
    expect(again.dissolved_copies).toBe(0);
  });
  it('a copy Dewey already held as a duplicate stays held with its Dewey label unless revive is asked', async () => {
    const plan = undoPlan({ id: 11, slug: 'w', state: 'duplicate', why: 'duplicate of live: x', meta: { dedup: { verdict: 'duplicate', of: 'live', by: 'opening-and-middle-text', score: 0.6, best: 'live' } } }, { prior: { prior: { w: 'duplicate' } } });
    expect(plan).toMatchObject({ to: 'duplicate', doc: null });
    expect(plan.why).toMatch(/^Dewey duplicate of live .*not confirmed/);
    expect(undoPlan({ id: 11, slug: 'w', state: 'duplicate', why: 'duplicate of live: x', meta: {} }, { prior: { prior: { w: 'duplicate' } }, revive: true }).to).toBe('queued');
    // a copy that was not on air goes back to its state without a re-render
    expect(undoPlan({ id: 11, slug: 'w', state: 'duplicate', why: 'duplicate of live: x', restored: 0, meta: {} }, { prior: { prior: { w: 'done' } } })).toMatchObject({ to: 'done', republish: false });
  });
  it('a Dewey-held copy media-dedupe revived as best, group dissolved, not yet started → held again', async () => {
    const plan = undoPlan({ id: 12, slug: 'b', state: 'scheduled', meta: { dedup: { verdict: 'best', of: 'x', by: 'opening-and-middle-text', score: 0.7, group: 3 }, dedup_best: { group: 3, duplicates: ['x'] } } },
      { others: [{ id: 13, slug: 'x', meta: {} }], prior: { prior: { b: 'duplicate' } } });
    expect(plan).toMatchObject({ to: 'duplicate', unrevive: true });
    expect(plan.why).toMatch(/^Dewey duplicate of x/);
    expect(plan.meta.dedup.verdict).toBe('duplicate');
    expect(plan.meta.dedup_best).toBeUndefined();
    // already running → left alone (only the metadata marks go)
    expect(undoPlan({ id: 12, slug: 'b', state: 'running', meta: { dedup: { verdict: 'best' } } }, { prior: { prior: { b: 'duplicate' } } }).to).toBeNull();
  });
});

describe('dates are metadata (Chad 10-31): every date kept with its source on the survivor', () => {
  it('mergeMeta keeps each copy\'s date and year with where it came from', () => {
    const r = mergeMeta({ slug: 'b', meta: { date: '2011-03-01' } }, [{ slug: 'o', meta: { date: '2022-07-07' } }, { slug: 'p', meta: { year: 1990 } }]);
    expect(r.patch.dates).toEqual([{ field: 'date', value: '2011-03-01', from: 'b' }, { field: 'date', value: '2022-07-07', from: 'o' }, { field: 'year', value: 1990, from: 'p' }]);
    // nothing new on a second pass
    expect(mergeMeta({ slug: 'b', meta: { date: '2011-03-01', dates: r.patch.dates } }, [{ slug: 'o', meta: { date: '2022-07-07' } }, { slug: 'p', meta: { year: 1990 } }]).patch.dates).toBeUndefined();
  });
});

describe('the library-wide content index', async () => {
  const ci = await import('../../api/lib/media/content-index.js');
  const long = (seed, n = 3000, from = 0) => speech(seed, n, from);
  it('candidate pairs: the same speech (trimmed, retitled) is found; different talks are not', () => {
    const sk = new Map([[1, ci.sketch(long('a'))], [2, ci.sketch(long('a', 2600, 300))], [3, ci.sketch(long('b'))], [4, ci.sketch(long('c'))]]);
    const pairs = ci.candidatePairs(sk);
    expect(pairs.map((p) => [p.a, p.b])).toEqual([[1, 2]]);
    expect(ci.candidatesFor(ci.sketch(long('c', 2000, 500)), sk, ci.postingsOf(sk), { excludeId: 9 }).map((c) => c.id)).toEqual([4]);
  });
  it('a gram in more than RARE talks is a common phrase, not evidence', () => {
    const shared = speech('q', 400);
    const sk = new Map(Array.from({ length: ci.RARE + 1 }, (_, i) => [i + 1, ci.sketch(`${shared} ${long(`t${i}`, 600)}`)]));
    expect(ci.candidatePairs(sk)).toEqual([]);
  });
  it('persists and reloads the sketches', async () => {
    const { mkdtemp } = await import('fs/promises'); const { tmpdir } = await import('os'); const { join } = await import('path');
    const file = join(await mkdtemp(join(tmpdir(), 'ci-')), 's.json');
    await ci.saveSketches(new Map([[5, { stamp: 'x@1', hs: ci.sketch(long('a')) }]]), file);
    const { items } = await ci.loadSketches(file);
    expect(items.get(5).stamp).toBe('x@1');
    expect([...items.get(5).hs]).toEqual([...ci.sketch(long('a'))]);
    expect((await ci.contentCandidates(long('a', 2000, 100), { file })).map((c) => c.id)).toEqual([5]);
    expect(await ci.contentCandidates(long('z'), { file })).toEqual([]);
  });
});

describe('media-dedupe job: the library-wide scan', () => {
  it('pairs Dewey never labelled are found by content, gated, and merged; a stranger is left alone', async () => {
    const { mkdtemp } = await import('fs/promises'); const { tmpdir } = await import('os'); const { join } = await import('path');
    const sketchFile = join(await mkdtemp(join(tmpdir(), 'ci-')), 's.json');
    const long = (seed, n = 3000, from = 0) => speech(seed, n, from);
    const rows = [
      { id: 20, slug: 'amatul-baha-bwc-1987', state: 'done', restored: 1, dir: '/d/a', doc_id: 200 },
      { id: 21, slug: 'amatul-baha-bwc-staff-1989', state: 'done', restored: 1, dir: '/d/b', doc_id: 201 },
      { id: 22, slug: 'unrelated', state: 'done', restored: 1, dir: '/d/c', doc_id: 202 },
    ];
    const texts = { '/d/a': long('a'), '/d/b': long('a', 2700, 200), '/d/c': long('c') };
    const metas = { '/d/a': onAirMeta({ slug: 'amatul-baha-bwc-1987', date: '1987' }), '/d/b': onAirMeta({ slug: 'amatul-baha-bwc-staff-1989', date: '1989', quality: { overall: 'C', raw: { nisqa: { mos: 2.0 } } }, remaster: { status: 'done', output_assessment: { restored: { nisqa: [3.0] } } } }), '/d/c': onAirMeta({ slug: 'unrelated' }) };
    const calls = { marked: [], deleted: [] }, writes = {};
    const deps = {
      repo: { dedupeRows: async () => [], contentScanRows: async () => rows, setDupGroup: async () => {}, markDuplicateItems: async (ids, why, g) => calls.marked.push({ ids, why, g }) },
      readMeta: async (dir) => metas[dir], writeMeta: async (dir, m) => { writes[dir] = m; }, readSidecar: async () => null,
      ops: { pendingRuns: async () => [], cancel: async () => {} }, docs: { softDeleteDocs: async (ids) => { calls.deleted.push(...ids); return { deleted: ids.length }; } },
      purge: async () => true, queue: async () => {}, now: () => 'T0', textStamp: async (dir) => `${dir}@1`, readText: async (dir) => texts[dir],
      prior: { prior: {}, merged: [] }, pairCache: new Map(), sketchFile,
    };
    const r = await mediaDedupeJob({ write: true }, deps);
    expect(r.scan).toMatchObject({ talks: 3, sketched: 3, reread: 3, candidate_pairs: 1, beyond_dewey: 1, confirmed_beyond_dewey: 1 });
    expect(r.groups).toBe(1);
    expect(calls.marked).toEqual([expect.objectContaining({ ids: [21], g: 20 })]);
    expect(calls.deleted).toEqual([201]);
    expect(writes['/d/a'].dates).toEqual([{ field: 'date', value: '1987', from: 'amatul-baha-bwc-1987' }, { field: 'date', value: '1989', from: 'amatul-baha-bwc-staff-1989' }]);
    // the second pass re-reads nothing
    const r2 = await mediaDedupeJob({}, deps);
    expect(r2.scan.reread).toBe(0);
  });
});

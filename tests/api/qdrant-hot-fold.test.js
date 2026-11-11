// RAM write tier fold (Chad 11-10): hot → main in bulk with the optimizer paused, verify-then-delete, clean pass for the
// 11-07 leftovers, crash-safe pause, the fold loop's verdicts, the indexer's hot-full follow-up, and the drive-wear report.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { classify, canon, qdrantHotFoldJob, hotFoldPass, foldable, loadState, saveState } from '../../api/lib/ops/qdrant-hot-fold.js';
import { afterHotFull, followUps, markFoldWanted, isHotFull, HOT_RETRY_MAX } from '../../api/lib/ops/phrase-index-job.js';
import { driveWear, toSample, driveWearReport } from '../../api/lib/ops/drive-wear.js';
import { REPORTS, LANES } from '../../api/lib/ops/reports.js';
import { SOURCE_LABELS } from '../../api/lib/ops/maintenance.js';

const MAIN = 'http://main', HOT = 'http://hot';
const tmp = () => mkdtempSync(join(tmpdir(), 'fold-'));
const P = (id, doc = 1, extra = {}) => ({ id, payload: { doc_id: doc, paragraph_id: Math.floor(id / 1000), ...extra } });

/** In-memory main (`phrases` aliased to phrases_f16) + hot; records the optimizer threads over time and every call. */
function fakeQd({ main = [], hot = [], failUpsertOnce = false, dropOnUpsert = [] } = {}) {
  const s = { main: new Map(main.map((p) => [p.id, p])), hot: new Map(hot.map((p) => [p.id, p])), threads: 4, log: [], calls: [], status: 'green' };
  let failed = !failUpsertOnce;
  const qd = async (base, method, path, body) => {
    const b = typeof body === 'string' ? JSON.parse(body) : body;
    s.calls.push(`${method} ${base}${path}`);
    const m = base === HOT ? s.hot : s.main;
    if (path === '/aliases') return { result: { aliases: [{ alias_name: 'phrases', collection_name: 'phrases_f16' }] } };
    if (path.endsWith('/exists')) return { result: { exists: true } };
    if (method === 'GET' && /^\/collections\/[^/]+$/.test(path)) return { result: { status: s.status, config: { optimizer_config: { max_optimization_threads: s.threads } } } };
    if (method === 'PATCH') { s.threads = b.optimizers_config.max_optimization_threads; s.log.push(s.threads); return { result: true }; }
    if (path.endsWith('/points/scroll')) {
      const ids = [...m.keys()].sort((x, y) => x - y).filter((id) => b.offset == null || id >= b.offset);
      const page = ids.slice(0, b.limit);
      return { result: { points: page.map((id) => m.get(id)), next_page_offset: ids[b.limit] ?? null } };
    }
    if (method === 'POST' && path.endsWith('/points')) return { result: b.ids.filter((id) => m.has(id)).map((id) => m.get(id)) };
    if (method === 'PUT') {
      if (!failed) { failed = true; throw new Error('boom mid-copy'); }
      for (const p of b.points) if (!dropOnUpsert.includes(p.id)) m.set(p.id, { id: p.id, payload: p.payload });
      return { result: { status: 'completed' } };
    }
    if (path.includes('/points/delete')) { for (const id of b.points) m.delete(id); return { result: true }; }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { s, qd };
}
const vecs = (dead = []) => async (ids) => new Map(ids.filter((id) => !dead.includes(id)).map((id) => [id, Buffer.alloc(4)]));
const deps = (q, extra = {}) => ({ qd: q.qd, stateFile: join(tmp(), 'state.json'), vectors: vecs(), excluded: async () => [], draining: async () => false,
  env: { QDRANT_URL: MAIN, QDRANT_HOT_URL: HOT }, pollMs: 1, ...extra });

describe('fold: classify (pure)', () => {
  const main = new Map([[1000, { doc_id: 1, a: 1, b: 2 }], [2000, { doc_id: 1, a: 1 }]]);
  const pts = [P(1000, 1, { b: 2, a: 1 }), P(2000, 1, { a: 9 }), P(3000), P(4000), P(5000, 7)];
  for (const p of pts) delete p.payload.paragraph_id;
  const live = new Set([1000, 2000, 3000, 5000]);
  it('fold: same payload → drop only; changed or new → copy; no unit or excluded doc → zombie dropped', () => {
    const c = classify(pts, { main, live, excluded: new Set([7]), mode: 'fold' });
    expect(c.drop.sort()).toEqual([1000, 4000, 5000]);
    expect(c.copy.map((p) => p.id)).toEqual([2000, 3000]);
    expect([c.same, c.zombies]).toEqual([1, 2]);
  });
  it('clean: anything main holds is dropped (main is newer), hot-only points are kept, nothing copied', () => {
    const c = classify(pts, { main, live, excluded: new Set([7]), mode: 'clean' });
    expect(c.copy).toEqual([]);
    expect(c.drop.sort()).toEqual([1000, 2000, 4000, 5000]);
    expect(c.keep).toEqual([3000]);
  });
  it('canon ignores key order', () => expect(canon({ b: [1, { y: 1, x: 2 }], a: null })).toBe(canon({ a: null, b: [1, { x: 2, y: 1 }] })));
});

describe('fold: the job', () => {
  it('copies hot → main with the optimizer paused, verifies, deletes from hot, resumes once', async () => {
    const q = fakeQd({ main: [P(1000)], hot: [P(1000), P(2000), P(3000)] });
    const d = deps(q);
    saveState({ cleaned: { phrases_hot: 'x' } }, d.stateFile);
    const out = await qdrantHotFoldJob('phrases', {}, d);
    expect(out).toMatchObject({ mode: 'fold', main: 'phrases_f16', scanned: 3, copied: 2, same: 1, dropped: 3, unverified: 0 });
    expect(q.s.hot.size).toBe(0);
    expect([...q.s.main.keys()].sort()).toEqual([1000, 2000, 3000]);
    expect(q.s.log).toEqual([0, 4]);   // paused, then restored to the recorded value
    expect(q.s.calls.filter((c) => c.startsWith('PATCH')).every((c) => c.endsWith('/collections/phrases_f16'))).toBe(true);   // the alias's real name
    expect(loadState(d.stateFile).paused?.phrases_f16).toBeUndefined();
  });
  it('a point that did not land in main is NOT deleted from hot', async () => {
    const q = fakeQd({ hot: [P(1000), P(2000)], dropOnUpsert: [2000] });
    const d = deps(q); saveState({ cleaned: { phrases_hot: 'x' } }, d.stateFile);
    const out = await qdrantHotFoldJob('phrases', {}, d);
    expect(out.unverified).toBe(1);
    expect([...q.s.hot.keys()]).toEqual([2000]);
  });
  it('an uncleaned phrases_hot gets the clean pass first (no copy); an explicit fold before the clean is refused', async () => {
    const q = fakeQd({ main: [P(1000, 1, { stamp: 'new' })], hot: [P(1000, 1, { stamp: 'old' }), P(2000)] });
    const d = deps(q);
    await expect(qdrantHotFoldJob('phrases', { mode: 'fold' }, d)).rejects.toThrow(/clean/);
    const out = await qdrantHotFoldJob('phrases', {}, d);
    expect(out).toMatchObject({ mode: 'clean', copied: 0, dropped: 1, keptOnlyInHot: 1 });
    expect(q.s.main.get(1000).payload.stamp).toBe('new');   // main's newer payload untouched
    expect(q.s.log).toEqual([]);                             // nothing copied → optimizer never paused
    expect(loadState(d.stateFile).cleaned.phrases_hot).toBeTruthy();
    const next = await qdrantHotFoldJob('phrases', {}, d);   // now a routine fold
    expect(next).toMatchObject({ mode: 'fold', copied: 1 });
  });
  it('a crash mid-copy still resumes the optimizer; a pause left by a dead run is undone at the next start', async () => {
    const q = fakeQd({ hot: [P(1000)], failUpsertOnce: true });
    const d = deps(q); saveState({ cleaned: { phrases_hot: 'x' } }, d.stateFile);
    await expect(qdrantHotFoldJob('phrases', {}, d)).rejects.toThrow(/boom/);
    expect(q.s.threads).toBe(4);
    expect(q.s.hot.size).toBe(1);   // nothing deleted
    // a killed process (no finally): marker on disk, main left at 0
    q.s.threads = 0; saveState({ cleaned: { phrases_hot: 'x' }, paused: { phrases_f16: { prev: 4 } } }, d.stateFile);
    const out = await qdrantHotFoldJob('phrases', {}, d);
    expect(out.copied).toBe(1);
    expect(q.s.threads).toBe(4);
  });
  it('hype folds without a clean gate; off when its hot collection is unset; stops on drain', async () => {
    const q = fakeQd({ hot: [P(1000)] });
    expect(await qdrantHotFoldJob('hype', {}, deps(q, { env: { QDRANT_HOT_URL: HOT }, hotColl: 'hype_hot' }))).toMatchObject({ mode: 'fold', copied: 1 });
    await expect(qdrantHotFoldJob('hype', {}, deps(q, { env: { QDRANT_HOT_URL: HOT }, hotColl: '' }))).rejects.toThrow(/hot tier is off/);
    const q2 = fakeQd({ hot: [P(1000)] });
    expect((await qdrantHotFoldJob('hype', {}, deps(q2, { hotColl: 'hype_hot', draining: async () => true }))).stoppedFor).toBe('drain');
    expect(q2.s.hot.size).toBe(1);
  });
  it('never folds without the exclusion list', async () => {
    const q = fakeQd({ hot: [P(1000)] });
    await expect(qdrantHotFoldJob('hype', {}, deps(q, { hotColl: 'hype_hot', excluded: async () => { throw new Error('db busy'); } }))).rejects.toThrow(/db busy/);
  });
});

describe('fold loop: when to fold', () => {
  const GB = 1e9;
  const pass = (r, { hour = 12, wanted = null, env = {} } = {}) => {
    const dir = tmp(), wantedFile = join(dir, 'wanted.json'), queued = [];
    if (wanted) writeFileSync(wantedFile, JSON.stringify(wanted));
    const now = new Date(2026, 10, 10, hour);
    return hotFoldPass({ env: { QDRANT_HOT_URL: HOT, QDRANT_HOT_HYPE: 'hype_hot', ...env }, now,
      deps: { read: () => r, enqueue: async (j) => queued.push(j), wantedFile } }).then((res) => ({ res, queued, wantedFile }));
  };
  // 64 GB tmpfs, 60 GB MemAvailable, 6 GB minFree: room = min(free, 54); capacity = min(total − 6, total / 2)
  it('over 2/3 of the live capacity → fold now, both collections', async () => {
    const { res, queued } = await pass({ free: 24 * GB, used: 40 * GB, memAvail: 60 * GB });
    expect(res.verdict).toBe('fold-now');
    expect(queued).toEqual(['phrase-hot-fold', 'hype-hot-fold']);
  });
  it('between 1/3 and 2/3: wait for the quiet hours, then fold', async () => {
    const r = { free: 44 * GB, used: 20 * GB, memAvail: 60 * GB };
    expect((await pass(r)).res.verdict).toBe('wait-quiet');
    expect((await pass(r, { hour: 3 })).queued).toEqual(['phrase-hot-fold', 'hype-hot-fold']);
  });
  it('less RAM available shrinks the capacity: the same data folds sooner', async () => {
    expect((await pass({ free: 44 * GB, used: 20 * GB, memAvail: 60 * GB })).res.fill).toBeLessThan(2 / 3);
    expect((await pass({ free: 44 * GB, used: 20 * GB, memAvail: 20 * GB })).res.verdict).toBe('fold-now');
  });
  it('a big run asked for a fold → it runs in the quiet hours even when small, and the request is cleared', async () => {
    const r = { free: 60 * GB, used: 2 * GB, memAvail: 60 * GB };
    expect((await pass(r, { wanted: { phrases: 'x' } })).queued).toEqual([]);
    const q = await pass(r, { hour: 4, wanted: { phrases: 'x' } });
    expect(q.res.verdict).toBe('fold-after-run');
    expect(JSON.parse(readFileSync(q.wantedFile, 'utf8'))).toEqual({});
  });
  it('wherever the indexer would stop for space, the fold is now (stop rule and fold rule agree, 11-11)', async () => {
    // 64 GB tmpfs, 33 GB used: fill ~0.6 (< 2/3) outside quiet hours, yet free 31 GB < max(6, data 33) → indexer 'full'
    const r = { free: 31 * GB, used: 33 * GB, memAvail: 120 * GB };
    const { res, queued } = await pass(r);
    expect(res.full).toBe(true);
    expect(res.verdict).toBe('fold-now');
    expect(queued).toEqual(['phrase-hot-fold', 'hype-hot-fold']);
    const ok = await pass({ free: 44 * GB, used: 10 * GB, memAvail: 120 * GB });
    expect(ok.res.full).toBe(false);
    expect(ok.res.verdict).not.toBe('fold-now');
  });
  it('a snapshot copy in tmp is not data', async () => {
    const { res } = await pass({ free: 24 * GB, used: 40 * GB, tmp: 30 * GB, memAvail: 60 * GB });
    expect(res.data_gb).toBe(10);
    expect(res.verdict).not.toBe('fold-now');
  });
  it('off without QDRANT_HOT_URL; hype only when QDRANT_HOT_HYPE is set', async () => {
    expect(await hotFoldPass({ env: {} })).toEqual({ off: true });
    expect(foldable({ QDRANT_HOT_URL: HOT }).map(([c]) => c)).toEqual(['phrases']);
    expect(foldable({ QDRANT_HOT_URL: HOT, QDRANT_HOT_HYPE: 'h' }).map(([c]) => c)).toEqual(['phrases', 'hype']);
  });
});

describe('indexer hot-full → fold, never a stall', () => {
  const full = (upserted = 10) => ({ phase: 'stopped', reason: 'hot RAM disk has 1.0 GB free: fold into main before indexing more', upserted });
  it('recognises the stop', () => {
    expect(isHotFull(full())).toBe(true);
    expect(isHotFull({ phase: 'stopped', reason: 'budget' })).toBe(false);
    expect(isHotFull({ phase: 'done' })).toBe(false);
  });
  it('queues the fold, then continues the same run in the same lane', async () => {
    const q = [];
    const r = await afterHotFull({ tier: 'core', maxUsd: 5 }, full(), async (n, p) => q.push([n, p]));
    expect(r).toEqual({ fold: 'phrase-hot-fold', continued: true });
    expect(q).toEqual([['phrase-hot-fold', {}], ['phrase-index', { tier: 'core', maxUsd: 5, hotRetry: 0, hotRound: 1 }]]);
  });
  it('the continuation differs from the running job, so the queue cannot dedupe it away (11-11, run 1393285)', async () => {
    const running = { tier: 'supplemental', maxUsd: 20, budgetKey: 'phrase-supplemental-1110', hotRetry: 0 };
    const live = [['phrase-index', JSON.stringify(running)]], made = [];
    // dedupes like ENQUEUE_SAME_SQL: an identical queued/running run is reused, not created
    const enq = async (n, p) => { const k = JSON.stringify(p ?? null); if (live.some(([ln, lp]) => ln === n && lp === k)) return; live.push([n, k]); made.push(n); };
    expect((await afterHotFull(running, full(), enq)).continued).toBe(true);
    expect(made).toEqual(['phrase-hot-fold', 'phrase-index']);
    // and a second round differs again from the first continuation
    const next = []; await afterHotFull({ ...running, hotRound: 1 }, full(), async (n, p) => next.push(p));
    expect(next[1].hotRound).toBe(2);
  });
  it('a hot-full stop whose continuation is queued is not "stopped short"; a real stop still is', async () => {
    const { stoppedShort } = await import('../../api/lib/ops/service-worker.js');
    const last = full();
    expect(stoppedShort({ code: 0, last })).toMatch(/hot RAM disk/);
    expect(stoppedShort({ code: 0, last, hotFull: { fold: 'phrase-hot-fold', continued: true } })).toBeNull();
    expect(stoppedShort({ code: 0, last: { phase: 'stopped', reason: 'budget x would pass $20' } })).toMatch(/budget/);
  });
  it('followUps returns the hot-full outcome (continued) for the job result', async () => {
    const r = await followUps({ tier: 'core', maxUsd: 5 }, full(), null, { enqueue: async () => {}, log: async () => {}, wantedFile: join(tmp(), 'w.json') });
    expect(r).toEqual({ fold: 'phrase-hot-fold', continued: true });
  });
  it('a docs run that embedded and sent nothing marks its documents unyielding BEFORE the re-measure; a productive or hype run does not', async () => {
    const order = [], mark = async (ids) => order.push(['mark', ids]), enqueue = async (n) => order.push([n]);
    const done = (x = {}) => ({ phase: 'done', paragraphs: 438, units: 0, embedded: 0, upserted: 0, ...x });
    await followUps({ docs: [285226, 285227], maxUsd: 1 }, done(), null, { enqueue, markUnyielding: mark, wantedFile: join(tmp(), 'w.json') });
    expect(order).toEqual([['mark', [285226, 285227]], ['coverage-refresh']]);
    order.length = 0;
    await followUps({ docs: [1], maxUsd: 1 }, done({ upserted: 3 }), null, { enqueue, markUnyielding: mark, wantedFile: join(tmp(), 'w.json') });
    await followUps({ docs: [1], maxUsd: 1, field: 'hype' }, done(), null, { enqueue, markUnyielding: mark, wantedFile: join(tmp(), 'w.json') });
    await followUps({ docs: [1], maxUsd: 1 }, { phase: 'stopped', reason: 'budget', units: 0 }, null, { enqueue, markUnyielding: mark, wantedFile: join(tmp(), 'w.json') });
    expect(order.filter((o) => o[0] === 'mark')).toEqual([]);
  });
  it('logs one activity line (visible, not an alarm)', async () => {
    const logs = [];
    await afterHotFull({ tier: 'core', maxUsd: 5 }, full(), async () => {}, async (m) => logs.push(m));
    expect(logs).toEqual(['RAM tier full → phrase-hot-fold queued, indexing resumes after']);
  });
  it('hype/follow runs: fold only (the follow loop re-queues); no progress past the retry limit stops loudly', async () => {
    const q = [], logs = [];
    expect(await afterHotFull({ field: 'hype', follow: true }, full(), async (n) => q.push(n))).toEqual({ fold: 'hype-hot-fold', continued: false });
    expect(q).toEqual(['hype-hot-fold']);
    const r = await afterHotFull({ tier: 'core', hotRetry: HOT_RETRY_MAX }, full(0), async (n) => q.push(n), async (m) => logs.push(m));
    expect(r.continued).toBe(false);
    expect(logs.at(-1)).toMatch(/still full/);
    expect(await afterHotFull({}, { phase: 'done' }, async () => { throw new Error('no'); })).toBeNull();
  });
  it('the continuation is queued BEFORE the job resolves (a draining service exits on resolve — 11-10 lost two tier runs)', async () => {
    const q = [];
    const slow = (n, p) => new Promise((r) => setTimeout(() => { q.push([n, p]); r(); }, 20));
    await followUps({ tier: 'core', maxUsd: 5 }, full(), null, { enqueue: slow, log: async () => {}, wantedFile: join(tmp(), 'w.json') });
    expect(q).toEqual([['phrase-hot-fold', {}], ['phrase-index', { tier: 'core', maxUsd: 5, hotRetry: 0, hotRound: 1 }]]);
    const pre = [];
    await followUps({ tier: 'core' }, full(), ['prebuilt'], { enqueue: async (n) => pre.push(n) });
    expect(pre).toEqual([]);
  });
  it('a big finished run marks a quiet-hours fold; a docs run or an off tier does not', () => {
    const f = join(tmp(), 'w.json'), env = { QDRANT_HOT_URL: HOT };
    expect(markFoldWanted({ docs: [1] }, { phase: 'done', upserted: 5 }, f, env)).toBe(false);
    expect(markFoldWanted({ tier: 'core' }, { phase: 'done', upserted: 5 }, f, {})).toBe(false);
    expect(markFoldWanted({ field: 'hype' }, { phase: 'done', upserted: 5 }, f, env)).toBe(false);   // hype not layered here
    expect(markFoldWanted({ tier: 'core' }, { phase: 'done', upserted: 5 }, f, env)).toBe(true);
    expect(Object.keys(JSON.parse(readFileSync(f, 'utf8')))).toEqual(['phrases']);
  });
});

describe('drive-wear report', () => {
  const T0 = Date.parse('2026-11-01T00:00:00Z'), DAY = 86400000;
  const d = (written_bytes, life_left_pct = 50, dev = 'nvme1n1') => ({ dev, written_bytes, life_left_pct });
  it('TB/day from the delta vs the previous sample, percentage_used, years to rated TBW', () => {
    const prev = toSample([d(14.7e12, 99)], T0);
    const [r] = driveWear(prev, [d(16.5e12, 98)], T0 + 2 * DAY);
    expect(r).toMatchObject({ dev: 'nvme1n1', tb_per_day: 0.9, since_days: 2, percentage_used: 2, used_delta: 1, rated_tbw: 2000 });
    expect(r.years_left_at_rate).toBeCloseTo((2000 - 16.5) / 0.9 / 365, 1);
  });
  it('first sample (no baseline), a new drive, or a counter that went backwards → no rate', () => {
    expect(driveWear(null, [d(1e12)], T0)[0].tb_per_day).toBeNull();
    expect(driveWear(toSample([d(5e12)], T0), [d(1e12)], T0 + DAY)[0].tb_per_day).toBeNull();
    expect(driveWear(toSample([d(5e12, 50, 'sdb')], T0), [d(6e12)], T0 + DAY)[0].tb_per_day).toBeNull();
    expect(driveWear(null, [{ dev: 'sdd', written_bytes: null }], T0)).toEqual([]);   // HDD: no counter
  });
  it('stores the sample, queues one weekly item per drive with a rate', async () => {
    const file = join(tmp(), 'dw.json'), queued = [];
    const run = (now, bytes) => driveWearReport({}, { file, now, drives: () => [d(bytes)], queue: (x) => queued.push(x) });
    const first = await run(T0, 10e12);
    expect(first.baseline).toBeNull();
    expect(queued).toEqual([]);
    expect(existsSync(file)).toBe(true);
    const second = await run(T0 + DAY, 10.5e12);
    expect(second.drives[0].tb_per_day).toBe(0.5);
    expect(queued[0]).toMatchObject({ source: 'drive-wear', key: 'drive-wear:nvme1n1' });
    const merged = queued[0].merge(null, queued[0].data);
    expect(queued[0].render(merged).title).toMatch(/0.5 TB\/day/);
  });
  it('is a registered quick report with a weekly-email label', () => {
    expect(REPORTS['drive-wear']).toBeTypeOf('function');
    expect(LANES.quick).toContain('drive-wear');
    expect(SOURCE_LABELS['drive-wear']).toMatch(/Drive wear/);
  });
});

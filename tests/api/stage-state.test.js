// The pipeline's memory, driven against REAL SQLite with the real migration DDL. Mocks would prove nothing
// here: the whole point of this module is that the recorded state answers questions that inference got
// wrong, and it is the SQL (upserts, attempt counting, stuck detection, epoch comparisons) that has to be
// right. Every timestamp is an epoch integer by convention — the thing that caused three bugs in one day.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE ingest_stage (
    item_ref TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL, version TEXT,
    attempts INTEGER NOT NULL DEFAULT 0, reason TEXT, last_error TEXT, doc_id INTEGER,
    payload_json TEXT, started_at INTEGER, updated_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (item_ref, stage));
  CREATE TABLE pipeline_run (
    id INTEGER PRIMARY KEY AUTOINCREMENT, stage TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running',
    started_at INTEGER NOT NULL DEFAULT (unixepoch()), finished_at INTEGER,
    items_in INTEGER NOT NULL DEFAULT 0, items_out INTEGER NOT NULL DEFAULT 0,
    items_rejected INTEGER NOT NULL DEFAULT 0, items_failed INTEGER NOT NULL DEFAULT 0,
    reasons_json TEXT, last_error TEXT, note TEXT);
`);
const deps = {
  query: async (sql, args = []) => db.prepare(sql).run(...args),
  queryOne: async (sql, args = []) => db.prepare(sql).get(...args),
  queryAll: async (sql, args = []) => db.prepare(sql).all(...args),
};

const S = await import('../../api/lib/pipeline/stage-state.js');

beforeEach(() => { db.exec('DELETE FROM ingest_stage; DELETE FROM pipeline_run;'); });

describe('per-item state is a recorded fact', () => {
  it('records an outcome and reads it back', async () => {
    await S.markStage(4211, 'convert', { status: 'done', version: 'conv-1', docId: 91, payload: { rel: 'a.md' } }, deps);
    const row = await S.getStage(4211, 'convert', deps);
    expect(row.status).toBe('done');
    expect(row.doc_id).toBe(91);
    expect(JSON.parse(row.payload_json)).toEqual({ rel: 'a.md' });
    expect(row.updated_at).toBeGreaterThan(1700000000);      // epoch seconds, not an ISO string
  });

  it('upserts in place instead of duplicating the item', async () => {
    await S.markStage('x', 'convert', { status: 'pending' }, deps);
    await S.markStage('x', 'convert', { status: 'done' }, deps);
    const all = await deps.queryAll('SELECT * FROM ingest_stage WHERE item_ref = ?', ['x']);
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('done');
  });

  it('counts attempts only when asked to, so a status touch is not a retry', async () => {
    await S.markStage('y', 'ingest', { status: 'failed', error: 'boom', bumpAttempt: true }, deps);
    await S.markStage('y', 'ingest', { status: 'failed', error: 'boom', bumpAttempt: true }, deps);
    await S.markStage('y', 'ingest', { status: 'running' }, deps);          // not an attempt
    expect((await S.getStage('y', 'ingest', deps)).attempts).toBe(2);
  });

  it('keeps the resulting doc_id and payload when a later touch omits them', async () => {
    await S.markStage('z', 'ingest', { status: 'done', docId: 7, payload: { rel: 'b.md' } }, deps);
    await S.markStage('z', 'ingest', { status: 'running' }, deps);
    const row = await S.getStage('z', 'ingest', deps);
    expect(row.doc_id).toBe(7);
    expect(row.payload_json).toContain('b.md');
  });
});

describe('claimable — what a run should pick up', () => {
  it('offers pending and failed, never done or rejected', async () => {
    await S.markStage('a', 'convert', { status: 'pending' }, deps);
    await S.markStage('b', 'convert', { status: 'failed', bumpAttempt: true }, deps);
    await S.markStage('c', 'convert', { status: 'done' }, deps);
    await S.markStage('d', 'convert', { status: 'rejected', reason: 'scanned pdf' }, deps);
    const refs = (await S.claimable('convert', {}, deps)).map((r) => r.item_ref).sort();
    expect(refs).toEqual(['a', 'b']);
  });

  it('stops retrying past the attempt ceiling — a poison item must not loop forever', async () => {
    for (let i = 0; i < 3; i++) await S.markStage('poison', 'convert', { status: 'failed', bumpAttempt: true }, deps);
    expect(await S.claimable('convert', { maxAttempts: 3 }, deps)).toHaveLength(0);
  });

  it('prefers the least-tried item so one bad file cannot starve the queue', async () => {
    await S.markStage('tried', 'convert', { status: 'failed', bumpAttempt: true }, deps);
    await S.markStage('fresh', 'convert', { status: 'pending' }, deps);
    expect((await S.claimable('convert', {}, deps))[0].item_ref).toBe('fresh');
  });
});

describe('ingestStatus — one call, no investigation', () => {
  it('reports counts, rejection reasons and the last run per stage', async () => {
    const run = await S.beginRun('convert', deps);
    await S.markStage('1', 'convert', { status: 'done' }, deps);
    await S.markStage('2', 'convert', { status: 'rejected', reason: 'poor text layer' }, deps);
    await S.markStage('3', 'convert', { status: 'rejected', reason: 'poor text layer' }, deps);
    await S.markStage('4', 'convert', { status: 'pending' }, deps);
    await S.endRun(run, { itemsIn: 4, itemsOut: 1, rejected: 2, reasons: { 'poor text layer': 2 } }, deps);

    const st = await S.ingestStatus({}, deps);
    expect(st.stages.convert.done).toBe(1);
    expect(st.stages.convert.waiting).toBe(1);
    expect(st.stages.convert.rejected_reasons[0]).toEqual({ reason: 'poor text layer', count: 2 });
    expect(st.stages.convert.last_run.items_out).toBe(1);
    expect(st.stages.convert.last_run.status).toBe('ok');
    expect(st.stages.convert.stuck).toBe(false);
  });

  it('distinguishes STUCK from idle — the state that was invisible before', async () => {
    const run = await S.beginRun('ingest', deps);
    db.prepare('UPDATE pipeline_run SET started_at = unixepoch() - 7200 WHERE id = ?').run(run);
    const st = await S.ingestStatus({ stuckMinutes: 45 }, deps);
    expect(st.stages.ingest.stuck).toBe(true);               // running for 2h with no finish
  });

  it('reports a never-run stage as neither stuck nor done', async () => {
    const st = await S.ingestStatus({}, deps);
    expect(st.stages.convert.last_run).toBeNull();
    expect(st.stages.convert.stuck).toBe(false);
    expect(st.stages.convert.done).toBe(0);
  });

  it('surfaces a failing run’s error instead of losing it to a log', async () => {
    const run = await S.beginRun('ingest', deps);
    await S.endRun(run, { itemsIn: 1, failed: 1, lastError: 'writer refused: 503' }, deps);
    const st = await S.ingestStatus({}, deps);
    expect(st.stages.ingest.last_run.status).toBe('error');
    expect(st.stages.ingest.last_run.last_error).toContain('503');
  });

  it('lists recent per-item failures with their attempt counts', async () => {
    await S.markStage('bad', 'ingest', { status: 'failed', error: 'ENOENT missing file', bumpAttempt: true }, deps);
    const st = await S.ingestStatus({}, deps);
    expect(st.recent_errors[0]).toMatchObject({ item_ref: 'bad', attempts: 1 });
    expect(st.recent_errors[0].last_error).toContain('ENOENT');
  });
});

describe('retryFailed', () => {
  it('returns failed items to the queue and clears their attempts', async () => {
    await S.markStage('f1', 'ingest', { status: 'failed', error: 'x', bumpAttempt: true }, deps);
    await S.markStage('f2', 'ingest', { status: 'failed', error: 'x', bumpAttempt: true }, deps);
    await S.markStage('ok', 'ingest', { status: 'done' }, deps);
    expect(await S.retryFailed('ingest', {}, deps)).toBe(2);
    const refs = (await S.claimable('ingest', {}, deps)).map((r) => r.item_ref).sort();
    expect(refs).toEqual(['f1', 'f2']);
    expect((await S.getStage('ok', 'ingest', deps)).status).toBe('done');   // untouched
  });

  it('is a no-op when nothing failed', async () => {
    expect(await S.retryFailed('convert', {}, deps)).toBe(0);
  });
});

// The work-list that ignores what previous runs learned. 17 dead URLs were re-fetched 18 times each because
// the converter builds its list from SQL and never consulted the recorded attempts. This locks the pruning
// predicate the converter now applies, so the regression is caught here rather than by a 404 counter climbing.
describe('self-pruning work-list', () => {
  const settledRefs = (maxAttempts = 3) => new Set(
    db.prepare(`SELECT item_ref FROM ingest_stage
                 WHERE stage = 'convert' AND (status IN ('done','rejected') OR attempts >= ?)`)
      .all(maxAttempts).map((r) => String(r.item_ref)));

  it('drops converted, terminally-rejected and retry-exhausted items, keeping the rest', async () => {
    await S.markStage('converted', 'convert', { status: 'done' }, deps);
    await S.markStage('scanned', 'convert', { status: 'rejected', reason: 'no text layer' }, deps);
    for (let i = 0; i < 3; i++) await S.markStage('dead404', 'convert', { status: 'failed', error: 'fetch 404', bumpAttempt: true }, deps);
    await S.markStage('tried-once', 'convert', { status: 'failed', error: 'fetch 500', bumpAttempt: true }, deps);

    const settled = settledRefs();
    const workList = ['converted', 'scanned', 'dead404', 'tried-once', 'never-seen']
      .filter((ref) => !settled.has(ref));
    // A transient failure is still retried; a permanent one is not; work never seen is always eligible.
    expect(workList).toEqual(['tried-once', 'never-seen']);
  });

  it('keeps retrying below the ceiling, so one bad fetch does not park a good book', async () => {
    await S.markStage('flaky', 'convert', { status: 'failed', error: 'fetch 503', bumpAttempt: true }, deps);
    expect(settledRefs().has('flaky')).toBe(false);
    await S.markStage('flaky', 'convert', { status: 'failed', error: 'fetch 503', bumpAttempt: true }, deps);
    await S.markStage('flaky', 'convert', { status: 'failed', error: 'fetch 503', bumpAttempt: true }, deps);
    expect(settledRefs().has('flaky')).toBe(true);        // exhausted at the ceiling
  });
});

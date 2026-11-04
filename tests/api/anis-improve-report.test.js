// Live improvement report (Chad 11-04: "audits, their conclusions, the solutions"): improve-repo improveReportData on a real
// SQLite store (in-memory / temp file), the pure improveReport shaper, the worker keeping the deep conclusion, and the route.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { openImproveDb, recordForensic, saveJudge, saveDeepDone, applySuggestions, improveReportData, improveDigestData, setImprovementStatus } from '../../api/lib/repos/improve-repo.js';
import { improveReport, improveDigest, parseDeep, parseSuggestions, mergeSuggestions } from '../../api/lib/audit/improve.js';
import { inferTarget, targetClass } from '../../api/lib/audit/improve-targets.js';
import { work } from '../../api/workers/improve-worker.js';

vi.mock('../../api/lib/auth.js', () => ({ requireInternal: async (req) => {
  if (req.headers['x-internal-key'] === 'admin-jwt') { req.user = { sub: 'u1', email: 'a@b.c', tier: 'admin' }; return; }   // an admin, not the key
  if (req.headers['x-internal-key'] !== 'ik') throw Object.assign(new Error('Admin access required'), { statusCode: 401 });
  req.user = { sub: 'internal', email: 'internal@system', internal: true };
} }));
vi.mock('../../api/lib/spend-caps.js', async (orig) => ({ ...(await orig()),
  capStatus: async () => [{ group: 'anis', spent_usd: 3, cap_usd: 30 }, { group: 'improve', spent_usd: 1.25, cap_usd: 200, remaining_usd: 198.75, blocking: false }] }));

const NOW = Date.parse('2026-11-04T12:00:00Z');
const at = (msAgo) => new Date(NOW - msAgo).toISOString().slice(0, 19).replace('T', ' ');
const H = 3600_000;

/** pending reply, clean (pass) reply, weak reply with a recorded deep conclusion, weak search with a deep run from before
 *  deep_json (no conclusion text), and an old weak reply outside the 7-day window. */
function fixture(db) {
  const rec = (key, kind, askedMsAgo, extra = {}) => recordForensic(db, { key, kind, ref_id: key.split(':').pop(), session_id: 's1', turn_id: kind === 'reply' ? `s1:${key.at(-1)}` : null,
    question: `q ${key}`, route: 'research', asked_at: at(askedMsAgo), defects: [{ stage: 'RANK', class: 'cited-weaker-copy' }], ...extra });
  rec('reply:1', 'reply', 2 * H);
  rec('reply:2', 'reply', 3 * H); saveJudge(db, 'reply:2', { judge: { verdict: 'pass', classes: [] }, usd: 0.01 });
  rec('reply:3', 'reply', 4 * H); saveJudge(db, 'reply:3', { judge: { verdict: 'weak', stage: 'RANK', severity: 3, classes: ['authority-inversion'], why: 'commentary over Writings' }, usd: 0.01 });
  const sug = { stage: 'RANK', file: 'api/lib/search/doctrinal-rank.js', fn: 'rankCopies', change: 'rank copies by copy class', expected_effect: 'Writings lead', classes: ['authority-inversion'], severity: 3 };
  const ids = applySuggestions(db, mergeSuggestions([], [sug], 'reply:3'));
  saveDeepDone(db, 'reply:3', { usd: 0.05, deep: { diagnosis: 'A commentary was cited where the Writing ranked lower.', root_cause: 'rankCopies ignores copy class', improvement_ids: ids } });
  rec('search:t9', 'search', 5 * H); saveJudge(db, 'search:t9', { judge: { verdict: 'weak', stage: 'FIND', severity: 2, classes: ['missed-writing'], why: 'no Writing found' }, usd: 0.01 });
  const open = db.prepare('SELECT * FROM improvements').all();
  applySuggestions(db, mergeSuggestions(open, [{ ...sug, change: 'rank copies by copy class first' }], 'search:t9'));
  applySuggestions(db, mergeSuggestions(db.prepare('SELECT * FROM improvements').all(), [{ stage: 'FIND', file: 'api/lib/search/multi.js', fn: 'phraseFirst', change: 'search originals via phrase index', severity: 1 }], 'search:t9'));
  db.prepare("UPDATE forensics SET deep_state = 'done', deep_usd = 0.04 WHERE item_key = 'search:t9'").run();   // a deep run before deep_json
  rec('reply:4', 'reply', 30 * 24 * H); saveJudge(db, 'reply:4', { judge: { verdict: 'weak', stage: 'WRITER', severity: 1, classes: ['x'], why: 'old' }, usd: 0.02 });
  db.prepare("UPDATE forensics SET judged_at = ? WHERE item_key = 'reply:4'").run(at(30 * 24 * H));
  db.prepare("UPDATE forensics SET judged_at = ?, deep_at = ? WHERE item_key IN ('reply:2','reply:3')").run(at(10 * 60_000), at(10 * 60_000));
  db.prepare("UPDATE forensics SET judged_at = ?, deep_at = ? WHERE item_key = 'search:t9'").run(at(11 * 60_000), at(11 * 60_000));
}

describe('the store keeps the deep conclusion', () => {
  it('evolve() adds deep_json/judged_at/deep_at to a store created before them, idempotently', () => {
    const dir = mkdtempSync(join(tmpdir(), 'imp-')), path = join(dir, 'improve.db');
    const old = new Database(path);
    old.exec(`CREATE TABLE forensics (item_key TEXT PRIMARY KEY, kind TEXT NOT NULL, ref_id TEXT NOT NULL, session_id TEXT, asked_at TEXT, route TEXT,
      defects_json TEXT, payload_json TEXT, backfill INTEGER DEFAULT 0, judge_state TEXT DEFAULT 'pending', judge_json TEXT, judge_usd REAL DEFAULT 0,
      judge_tokens_json TEXT, deep_state TEXT DEFAULT 'none', deep_usd REAL DEFAULT 0, attempts INTEGER DEFAULT 0, error TEXT, priority INTEGER DEFAULT 3, created_at TEXT, updated_at TEXT)`);
    old.exec(`CREATE TABLE improvements (id INTEGER PRIMARY KEY AUTOINCREMENT, stage TEXT NOT NULL, file TEXT, fn TEXT, change TEXT NOT NULL, expected_effect TEXT,
      classes_json TEXT, severity INTEGER DEFAULT 2, evidence_n INTEGER DEFAULT 1, evidence_json TEXT, status TEXT DEFAULT 'open', status_note TEXT, status_at TEXT, first_seen TEXT, last_seen TEXT)`);
    old.prepare("INSERT INTO improvements (stage, file, change) VALUES ('RANK', 'api/lib/search/doctrinal-rank.js', 'a'), ('STRATEGY', NULL, 'b')").run();
    old.close();
    // read-only, before the worker ALTERs: the report reads the missing columns as NULL
    expect(improveReportData({ days: 7, now: NOW }, { db: new Database(path, { readonly: true }) }).conclusions).toEqual([]);
    for (let i = 0; i < 2; i++) openImproveDb(path).close();
    const cols = new Database(path).prepare('PRAGMA table_info(forensics)').all().map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['deep_json', 'judged_at', 'deep_at']));
    // the improvements table gains target (backfilled from stage + file) and reviewed_at/reviewed_by
    const imp = new Database(path);
    expect(imp.prepare('PRAGMA table_info(improvements)').all().map((c) => c.name)).toEqual(expect.arrayContaining(['target', 'reviewed_at', 'reviewed_by']));
    expect(imp.prepare('SELECT target FROM improvements ORDER BY id').all().map((r) => r.target)).toEqual(['index', 'strategy']);
    imp.close();
    rmSync(dir, { recursive: true, force: true });
  });
  it('parseDeep: diagnosis + root cause + suggestions; missing fields are null', () => {
    const d = parseDeep('{"diagnosis":"d","root_cause":"r","suggestions":[{"stage":"RANK","change":"c"}]}');
    expect(d).toMatchObject({ diagnosis: 'd', root_cause: 'r', suggestions: [{ stage: 'RANK', change: 'c' }] });
    expect(parseDeep('{"suggestions":[]}')).toMatchObject({ diagnosis: null, root_cause: null, suggestions: [] });
  });
  it('the worker stores the analysis with the ids of the fixes it produced', async () => {
    const db = openImproveDb(':memory:');
    recordForensic(db, { key: 'reply:9', kind: 'reply', ref_id: '9', asked_at: at(H), question: 'q', defects: [] });
    saveJudge(db, 'reply:9', { judge: { verdict: 'weak', stage: 'RANK', classes: [], why: 'w' }, usd: 0.01 });
    const call = async () => ({ text: '{"diagnosis":"dx","root_cause":"rc","suggestions":[{"stage":"RANK","file":"a.js","fn":"f","change":"do x","severity":2}]}', usd: 0.03 });
    expect(await work(db, { call, replay: async () => null })).toBe('done');
    const r = db.prepare("SELECT deep_state, deep_json, deep_at FROM forensics WHERE item_key = 'reply:9'").get();
    const id = db.prepare('SELECT id FROM improvements').get().id;
    expect(r.deep_state).toBe('done');
    expect(JSON.parse(r.deep_json)).toEqual({ diagnosis: 'dx', root_cause: 'rc', improvement_ids: [id] });
    expect(r.deep_at).toBeTruthy();
  });
});

describe('improveReportData + improveReport', () => {
  const db = openImproveDb(':memory:');
  fixture(db);
  const rep = improveReport(improveReportData({ days: 7, now: NOW }, { db }), { days: 7, cap: { spent_usd: 1.25, cap_usd: 200, remaining_usd: 198.75 } });

  it('pipeline: window counts, backlog, last-hour throughput, per kind and total', () => {
    expect(rep.pipeline.by_kind.reply).toMatchObject({ items: 3, judged: 2, weak: 1, deep_done: 1, judge_pending: 1, deep_pending: 1, judged_last_hour: 2 });
    expect(rep.pipeline.by_kind.search).toMatchObject({ items: 1, judged: 1, weak: 1, deep_done: 1, judged_last_hour: 1 });
    expect(rep.pipeline.total).toMatchObject({ items: 4, judged: 3, weak: 2, judge_pending: 1, weak_rate: 0.667 });
  });
  it('spend: today from the cap rollup, the cap, and the window from the store (the 30-day-old verdict excluded)', () => {
    expect(rep.spend).toMatchObject({ today_usd: 1.25, cap_usd: 200, remaining_usd: 198.75, blocking: false });
    expect(rep.spend.window_usd).toBeCloseTo(0.01 + 0.01 + 0.05 + 0.01 + 0.04, 6);
  });
  it('audits: the weak verdicts, newest first, with reasons, defects, links and the fixes they support', () => {
    expect(rep.audits.map((a) => a.item_key)).toEqual(['reply:3', 'search:t9', 'reply:4']);
    const a = rep.audits[0];
    expect(a).toMatchObject({ kind: 'reply', turn_id: 's1:3', question: 'q reply:3', stage: 'RANK', severity: 3, why: 'commentary over Writings',
      classes: ['authority-inversion'], defects: [{ class: 'cited-weaker-copy' }], deep_state: 'done' });
    expect(a.links).toEqual({ trace: '/api/admin/anis/turns/s1%3A3/trace', replay: '/api/admin/anis/turns/s1%3A3/replay', thread: '/admin/anis#threads:s1' });
    expect(rep.audits[1].links.trace).toBe('/api/admin/search-trace/t9');
    expect(rep.audits[1].improvement_ids).toHaveLength(2);
  });
  it('conclusions: the recorded diagnosis; a deep run before deep_json links its fixes through their evidence', () => {
    const [c3, c9] = [rep.conclusions.find((c) => c.item_key === 'reply:3'), rep.conclusions.find((c) => c.item_key === 'search:t9')];
    expect(c3).toMatchObject({ recorded: true, diagnosis: 'A commentary was cited where the Writing ranked lower.', root_cause: 'rankCopies ignores copy class', improvement_ids: [1] });
    expect(c9).toMatchObject({ recorded: false, diagnosis: null, root_cause: null, judge_why: 'no Writing found' });
    expect(c9.improvement_ids.sort()).toEqual([1, 2]);
  });
  it('solutions: ranked evidence × severity, each with its evidence audits', () => {
    expect(rep.solutions.map((s) => [s.id, s.score])).toEqual([[1, 6], [2, 1]]);
    expect(rep.solutions[0].evidence_audits.map((e) => [e.item_key, e.why])).toEqual([['reply:3', 'commentary over Writings'], ['search:t9', 'no Writing found']]);
    expect(rep.solutions[0].classes_json).toBeUndefined();
  });
  it('filters: kind, stage, status', () => {
    const f = (o) => improveReport(improveReportData({ days: 7, now: NOW, ...o }, { db }));
    expect(f({ kind: 'search' }).audits.map((a) => a.item_key)).toEqual(['search:t9']);
    expect(Object.keys(f({ kind: 'search' }).pipeline.by_kind)).toEqual(['search']);
    const st = f({ stage: 'FIND' });
    expect(st.audits.map((a) => a.item_key)).toEqual(['search:t9']);
    expect(st.solutions.map((s) => s.stage)).toEqual(['FIND']);
    expect(f({ status: 'done' }).solutions).toEqual([]);
  });
  it('filters: target code|data|<name> (rows carry target + target_class); since narrows solutions to rows seen since', () => {
    const f = (o) => improveReport(improveReportData({ days: 7, now: NOW, ...o }, { db }));
    expect(f({ target: 'code' }).solutions.map((s) => [s.id, s.target, s.target_class])).toEqual([[1, 'index', 'code'], [2, 'index', 'code']]);
    expect(f({ target: 'index' }).solutions).toHaveLength(2);
    expect(f({ target: 'data' }).solutions).toEqual([]);
    expect(f({ since: '2099-01-01T00:00:00Z' }).solutions).toEqual([]);
    expect(f({ since: '2000-01-01T00:00:00Z' }).solutions).toHaveLength(2);
  });
  it('no store yet → an empty, well-formed report', () => {
    expect(improveReport(null)).toMatchObject({ available: false, audits: [], conclusions: [], solutions: [], pipeline: { total: { items: 0 } } });
  });
});

describe('targets: who can apply an improvement', () => {
  it('inferTarget from file, then stage', () => {
    expect(inferTarget({ stage: 'SELECTION', file: 'api/lib/assistant/activities/lookup.js' })).toBe('activity');
    expect(inferTarget({ stage: 'RETRIEVAL', file: 'api/lib/assistant/tools.js' })).toBe('tool');
    expect(inferTarget({ stage: 'RANK', file: 'api/lib/search/doctrinal-rank.js' })).toBe('index');
    expect(inferTarget({ stage: 'RETRIEVAL', file: null })).toBe('index');
    expect(inferTarget({ stage: 'STRATEGY', file: 'api/lib/assistant/strategies.js' })).toBe('strategy');
    expect(inferTarget({ stage: 'STRATEGY' })).toBe('strategy');
    expect(inferTarget({ stage: 'WRITER', file: 'api/lib/assistant/prompt.js' })).toBe('writer-code');
    expect(inferTarget({ stage: 'LATENCY', file: 'api/lib/x.js' })).toBe('other-code');
    expect([targetClass('step'), targetClass('template'), targetClass('tool')]).toEqual(['data', 'data', 'code']);
  });
  it('the analyst names the target; an invalid or missing one is inferred; applySuggestions stores it', () => {
    const s = parseSuggestions('{"suggestions":[{"stage":"STRATEGY","target":"step","change":"a"},{"stage":"RANK","file":"api/lib/search/r.js","target":"bogus","change":"b"},{"stage":"WRITER","change":"c"}]}');
    expect(s.map((x) => x.target)).toEqual(['step', 'index', 'writer-code']);
    const db = openImproveDb(':memory:');
    applySuggestions(db, mergeSuggestions([], s, 'reply:1'));
    expect(db.prepare('SELECT target FROM improvements ORDER BY id').all().map((r) => r.target)).toEqual(['step', 'index', 'writer-code']);
  });
  it('setImprovementStatus records reviewed_at / reviewed_by', () => {
    const db = openImproveDb(':memory:');
    applySuggestions(db, mergeSuggestions([], [{ stage: 'RANK', change: 'x', severity: 2 }], 'reply:1'));
    expect(setImprovementStatus(1, 'accepted', 'will do', { db }, 'internal:claude-code')).toBe(1);
    expect(db.prepare('SELECT status, status_note, reviewed_by FROM improvements').get()).toEqual({ status: 'accepted', status_note: 'will do', reviewed_by: 'internal:claude-code' });
    expect(db.prepare('SELECT reviewed_at FROM improvements').get().reviewed_at).toBeTruthy();
  });
});

describe('improveDigestData + improveDigest (the daily read for Claude Code)', () => {
  const db = openImproveDb(':memory:');
  fixture(db);
  db.prepare('UPDATE improvements SET first_seen = ?, last_seen = ? WHERE id = 1').run(at(2 * H), at(10 * 60_000));   // grown
  db.prepare('UPDATE improvements SET first_seen = ?, last_seen = ? WHERE id = 2').run(at(30 * 60_000), at(30 * 60_000));   // new
  applySuggestions(db, { inserts: [{ stage: 'STRATEGY', target: 'strategy', change: 'route definitions to the lookup recipe', severity: 2, evidence: ['reply:3'] }] });
  db.prepare('UPDATE improvements SET first_seen = ? WHERE id = 3').run(at(20 * 60_000));
  setImprovementStatus(3, 'done', 'applied by the live loop', { db }, 'internal:improve-worker');
  applySuggestions(db, { inserts: [{ stage: 'WRITER', target: 'writer-code', change: 'old fix', severity: 1, evidence: ['reply:4'] }] });
  db.prepare('UPDATE improvements SET first_seen = ?, last_seen = ? WHERE id = 4').run(at(48 * H), at(48 * H));   // old: not in the digest
  const since = new Date(NOW - H).toISOString();
  const d = improveDigest(improveDigestData({ since }, { db }), { since, cap: { spent_usd: 1.25, cap_usd: 200 } });

  it('assessment: judged since, weak %, mean severity of weak verdicts, by stage, top classes, spend', () => {
    expect(d.assessment).toMatchObject({ judged: 3, weak: 2, weak_pct: 66.7, mean_severity: 2.5, by_stage: { RANK: 1, FIND: 1 }, cap_usd: 200, spent_today_usd: 1.25 });
    expect(d.assessment.top_classes).toEqual(expect.arrayContaining([{ class: 'authority-inversion', n: 1 }, { class: 'missed-writing', n: 1 }]));
    expect(d.assessment.spend_usd).toBeCloseTo(0.03 + 0.05 + 0.04, 6);
  });
  it('code: new or grown recommendations, ranked, with new-evidence count and 2 example turns linked to their traces', () => {
    expect(d.code.map((c) => [c.id, c.new, c.evidence_new])).toEqual([[1, false, 2], [2, true, 1]]);
    expect(d.code[0]).toMatchObject({ target: 'index', file: 'api/lib/search/doctrinal-rank.js', fn: 'rankCopies', evidence_n: 2, severity: 3 });
    expect(d.code[0].examples.map((e) => e.trace)).toEqual(['/api/admin/search-trace/t9', '/api/admin/anis/turns/s1%3A3/trace']);
  });
  it('data: proposed or applied since', () => {
    expect(d.data).toEqual([expect.objectContaining({ id: 3, state: 'applied', target: 'strategy', status_note: 'applied by the live loop' })]);
  });
  it('no store → empty digest', () => expect(improveDigest(null, { since })).toMatchObject({ available: false, code: [], data: [], assessment: { judged: 0 } }));
});

describe('GET /api/admin/anis/improve-report', () => {
  let app, dir;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'imp-route-'));
    process.env.IMPROVE_DB = join(dir, 'improve.db');
    const db = openImproveDb(process.env.IMPROVE_DB); fixture(db); db.close();
    const { default: anisRoutes } = await import('../../api/routes/assistant-admin.js');
    app = Fastify(); app.setErrorHandler((e, _r, reply) => reply.code(e.statusCode || 500).send({ error: e.message }));
    await app.register(anisRoutes, { prefix: '/api/admin' });
  });
  afterAll(() => { delete process.env.IMPROVE_DB; rmSync(dir, { recursive: true, force: true }); });
  const get = (url, key = 'ik') => app.inject({ method: 'GET', url: `/api/admin${url}`, headers: { 'x-internal-key': key } });

  it('needs the internal key', async () => expect((await get('/anis/improve-report', 'no')).statusCode).toBe(401));
  it('returns the whole report; spend from the improve cap group', async () => {
    const res = await get('/anis/improve-report?days=90');
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(Object.keys(b)).toEqual(['generated_at', 'days', 'filters', 'available', 'pipeline', 'spend', 'audits', 'conclusions', 'solutions']);
    expect(b).toMatchObject({ days: 90, available: true, spend: { today_usd: 1.25, cap_usd: 200 } });
    expect(b.solutions[0].evidence_audits).toHaveLength(2);
    expect(b.conclusions.length).toBe(2);
  });
  it('validates filters', async () => {
    expect((await get('/anis/improve-report?kind=bogus')).statusCode).toBe(400);
    expect((await get('/anis/improve-report?kind=search&stage=FIND')).json().filters).toEqual({ stage: 'FIND', status: null, kind: 'search', target: null, since: null });
    expect((await get('/anis/improve-report?target=bogus')).statusCode).toBe(400);
    expect((await get('/anis/improve-report?since=yesterdayish')).statusCode).toBe(400);
    const b = (await get('/anis/improve-report?target=code&since=2000-01-01')).json();
    expect(b.filters).toMatchObject({ target: 'code', since: '2000-01-01T00:00:00.000Z' });
    expect(b.solutions.length).toBeGreaterThan(0);
    expect(b.solutions.every((s) => s.target_class === 'code')).toBe(true);
  });
  it('GET /anis/improve-digest: terse shape; since ISO or relative; bad since → 400', async () => {
    const res = await get('/anis/improve-digest?since=2000-01-01T00:00:00Z');
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(Object.keys(b)).toEqual(['since', 'generated_at', 'available', 'assessment', 'code', 'data', 'proposals']);
    expect(b.code.map((c) => c.id)).toEqual([1, 2]);
    expect((await get('/anis/improve-digest')).statusCode).toBe(200);
    expect((await get('/anis/improve-digest?since=nope')).statusCode).toBe(400);
  });
  it('POST status records who reviewed it', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/anis/improvements/2/status', headers: { 'x-internal-key': 'ik' }, payload: { status: 'accepted', note: 'n', by: 'claude-code' } });
    expect(res.statusCode).toBe(200);
    const db = new Database(process.env.IMPROVE_DB, { readonly: true });
    expect(db.prepare('SELECT reviewed_by FROM improvements WHERE id = 2').get().reviewed_by).toBe('internal:claude-code');
    db.close();
  });
  it('POST status: an admin session (not the internal key) is refused — no human gate', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/anis/improvements/2/status', headers: { 'x-internal-key': 'admin-jwt' }, payload: { status: 'done' } });
    expect(res.statusCode).toBe(403);
  });
  it('GET /anis/improve-overview: headline, flow, changes, testing, waiting, spend; no question text', async () => {
    const res = await get('/anis/improve-overview');
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(Object.keys(b)).toEqual(['available', 'generated_at', 'headline', 'flow', 'decisions', 'changes', 'testing', 'waiting', 'spend']);
    expect(b.headline.daily).toHaveLength(30);
    expect(b.headline.status.sentence).toMatch(/code behaviour/);
    expect(b.spend).toMatchObject({ today_usd: 1.25, cap_usd: 200 });
    expect(JSON.stringify(b)).not.toMatch(/"q reply:|"q search:/);
  });
});

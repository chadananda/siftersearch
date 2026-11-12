// Question scores (1-5 per question, Implication browser) + the legacy-question fault report. Real in-memory SQLite, mocked db/auth, no network.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let raw;
vi.mock('../../api/lib/db.js', () => ({
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  queryOne: vi.fn(async (sql, p = []) => raw.prepare(sql).get(...p) ?? null),
  query: vi.fn(async (sql, p = []) => raw.prepare(sql).run(...p)),
  transaction: vi.fn(async (stmts) => { raw.transaction(() => { for (const s of stmts) raw.prepare(s.sql).run(...(s.args || [])); })(); }),
}));
let user = { sub: 1, email: 'chad@test', tier: 'admin' };
vi.mock('../../api/lib/auth.js', () => ({ requireAdmin: async (req) => { req.user = user; } }));
const repo = await import('../../api/lib/repos/question-score-repo.js');
const { default: routes } = await import('../../api/routes/implied-admin.js');
const { hypeQuestionFaultsJob } = await import('../../api/lib/ops/hype-question-faults-job.js');
const { migrations } = await import('../../api/lib/migrations/v72-v90.js');
const { default: Fastify } = await import('fastify');

const BAD = 'What concept does this paragraph explain about taxation?';
beforeEach(() => {
  user = { sub: 1, email: 'chad@test', tier: 'admin' };
  raw = new Database(':memory:');
  raw.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, slug TEXT);
    CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, external_para_id TEXT, paragraph_index INTEGER, text TEXT, original_text TEXT, hyp_questions TEXT, hyp_thesis TEXT, hyp_model TEXT, enhanced_synced INTEGER, updated_at TEXT, deleted_at TEXT);
    CREATE TABLE premise_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER, para_id INTEGER, external_para_id TEXT, premise TEXT, implies TEXT, questions_json TEXT, proof TEXT, concept TEXT, question TEXT, status TEXT, source TEXT, model TEXT, k INTEGER, created_at TEXT, updated_at TEXT, editor TEXT, note TEXT);
    CREATE TABLE question_scores (id INTEGER PRIMARY KEY AUTOINCREMENT, para_id INTEGER NOT NULL, question TEXT NOT NULL, q_fold TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'stated', implied_id INTEGER, score INTEGER NOT NULL, tags TEXT, note TEXT, rater TEXT NOT NULL DEFAULT '', created_at TEXT, updated_at TEXT, UNIQUE(para_id, q_fold, rater));`);
  raw.prepare(`INSERT INTO docs VALUES (7, 'Some Questioned Answers', 'Abdu''l-Baha', 'Baha''i', 'Core', 'saq')`).run();
  raw.prepare(`INSERT INTO content (id, doc_id, paragraph_index, text, hyp_questions) VALUES (1, 7, 3, 'text', ?)`).run(JSON.stringify([BAD, 'What is the soul?', { q: 'Is there life after death?', seeker: true }]));
  raw.prepare(`INSERT INTO content (id, doc_id, paragraph_index, text, hyp_questions) VALUES (2, 7, 4, 'more', ?)`).run(JSON.stringify(['According to this passage, what is taxation?', 'How is wealth shared?']));
});

describe('question-score-repo', () => {
  it('setScore upserts per (paragraph, folded question, rater); clearScore removes only that rater', async () => {
    await repo.setScore({ paraId: 1, question: BAD, kind: 'stated', score: 1, tags: ['self-reference'], note: 'dumb' }, 'a');
    const s = await repo.setScore({ paraId: 1, question: BAD.toUpperCase(), kind: 'stated', score: 2 }, 'a');
    expect(s).toMatchObject({ score: 2, tags: [], rater: 'a' });
    await repo.setScore({ paraId: 1, question: BAD, score: 5 }, 'b');
    expect(raw.prepare('SELECT COUNT(*) n FROM question_scores').get().n).toBe(2);
    expect((await repo.clearScore({ paraId: 1, question: BAD }, 'a')).removed).toBe(1);
    expect(raw.prepare('SELECT rater FROM question_scores').all()).toEqual([{ rater: 'b' }]);
  });
  it('rejects a bad score, kind or missing key (400)', async () => {
    for (const b of [{ paraId: 1, question: 'q', score: 0 }, { paraId: 1, question: 'q', score: 6 }, { paraId: 1, question: 'q', score: 2.5 }, { paraId: 1, question: '', score: 3 }, { paraId: 1, question: 'q', score: 3, kind: 'x' }])
      await expect(repo.setScore(b, 'a')).rejects.toMatchObject({ statusCode: 400 });
  });
  it('scoresFor is one lookup keyed by folded text, per rater', async () => {
    await repo.setScore({ paraId: 1, question: BAD, score: 1 }, 'a');
    await repo.setScore({ paraId: 2, question: 'How is wealth shared?', kind: 'implied', impliedId: 9, score: 4 }, 'a');
    const m = await repo.scoresFor([{ paraId: 1, question: BAD }, { paraId: 2, question: 'how is wealth shared' }], 'a');
    expect(m.get(repo.keyOf(1, BAD)).score).toBe(1);
    expect(m.get(repo.keyOf(2, 'How is wealth shared?')).score).toBe(4);
    expect((await repo.scoresFor([{ paraId: 1, question: BAD }], 'zz')).size).toBe(0);
  });
  it('listScores filters by max and kind, newest first; scoreStats counts by score/kind/tag', async () => {
    await repo.setScore({ paraId: 1, question: BAD, score: 1, tags: ['self-reference', 'vague'] }, 'a');
    await repo.setScore({ paraId: 1, question: 'What is the soul?', score: 5 }, 'a');
    await repo.setScore({ paraId: 2, question: 'How is wealth shared?', kind: 'implied', score: 2, tags: ['vague'] }, 'a');
    expect((await repo.listScores({ max: 2 })).rows.map((r) => r.score).sort()).toEqual([1, 2]);
    expect((await repo.listScores({ kind: 'implied' })).rows).toHaveLength(1);
    expect((await repo.listScores({ limit: 1 })).next).toBeTruthy();
    const st = await repo.scoreStats();
    expect(st).toMatchObject({ total: 3, byScore: { 1: 1, 2: 1, 3: 0, 4: 0, 5: 1 }, byKind: { stated: { n: 2, avg: 3 }, implied: { n: 1 } } });
    expect(st.topTags[0]).toEqual({ tag: 'vague', n: 2 });
    expect(st.worst).toHaveLength(2);
  });
  it('migration 203 creates the table with the unique key', async () => {
    raw.exec('DROP TABLE question_scores');
    await migrations[203]();
    raw.prepare(`INSERT INTO question_scores (para_id, question, q_fold, score, rater) VALUES (1, 'q', 'q', 3, 'a')`).run();
    expect(() => raw.prepare(`INSERT INTO question_scores (para_id, question, q_fold, score, rater) VALUES (1, 'Q', 'q', 3, 'a')`).run()).toThrow();
  });
});

describe('score routes', () => {
  const app = async (deps = {}) => { const f = Fastify(); await f.register(routes, { prefix: '/api/admin', deps }); return f; };
  it('PUT/DELETE /implied/score, GET /implied/scores and /stats (static paths beat /implied/:id)', async () => {
    const f = await app();
    const put = await f.inject({ method: 'PUT', url: '/api/admin/implied/score', payload: { paraId: 1, question: BAD, kind: 'stated', score: 1, tags: ['self-reference'] } });
    expect(put.statusCode).toBe(200);
    expect(put.json().score).toMatchObject({ score: 1, rater: 'chad@test', tags: ['self-reference'] });
    expect((await f.inject({ method: 'PUT', url: '/api/admin/implied/score', payload: { paraId: 1, question: BAD, score: 9 } })).statusCode).toBe(400);
    const list = (await f.inject({ method: 'GET', url: '/api/admin/implied/scores?max=2' })).json();
    expect(list.scores).toHaveLength(1);
    expect(list.scores[0]).toMatchObject({ question: BAD, doc: { title: 'Some Questioned Answers' } });
    expect(typeof list.scores[0].link).toBe('string');
    expect((await f.inject({ method: 'GET', url: '/api/admin/implied/scores?max=1' })).json().scores).toHaveLength(1);
    expect((await f.inject({ method: 'GET', url: '/api/admin/implied/scores/stats' })).json()).toMatchObject({ total: 1, byScore: { 1: 1 } });
    expect((await f.inject({ method: 'DELETE', url: `/api/admin/implied/score?paraId=1&question=${encodeURIComponent(BAD)}` })).json().removed).toBe(1);
    expect((await f.inject({ method: 'GET', url: '/api/admin/implied/scores' })).json().scores).toHaveLength(0);
  });
  it('search hits and the paragraph editor carry myScore (this rater only)', async () => {
    const f = await app({ search: async () => ({ hits: [{ paragraph_id: 1, doc_id: 7, score: 0.9, k: 0, implied: false }, { paragraph_id: 1, doc_id: 7, score: 0.8, k: 1, implied: false }] }) });
    await f.inject({ method: 'PUT', url: '/api/admin/implied/score', payload: { paraId: 1, question: BAD, score: 1 } });
    user = { sub: 2, email: 'other@test', tier: 'admin' };
    await f.inject({ method: 'PUT', url: '/api/admin/implied/score', payload: { paraId: 1, question: 'What is the soul?', score: 5 } });
    user = { sub: 1, email: 'chad@test', tier: 'admin' };
    const s = (await f.inject({ method: 'GET', url: '/api/admin/implied/search?q=tax&stated=1' })).json();
    expect(s.hits.map((h) => [h.stated.q, h.myScore])).toEqual([[BAD, 1], ['What is the soul?', null]]);
    const p = (await f.inject({ method: 'GET', url: '/api/admin/hype/paragraph/1' })).json();
    expect(p.stated.map((x) => x.myScore)).toEqual([1, null, null]);
  });
});

describe('hype-question-faults report', () => {
  it('runs questionFault over stated questions only: counts, byFault, samples with the doc title', async () => {
    const r = await hypeQuestionFaultsJob({}, { maxId: async () => 2, yieldTick: async () => {} });
    expect(r).toMatchObject({ scanned: 5, paragraphs: 2, faulty: 2, byFault: { selfReference: 2 } });
    expect(r.samples.map((s) => s.q).sort()).toEqual(['According to this passage, what is taxation?', BAD].sort());
    expect(r.samples[0]).toMatchObject({ doc: 'Some Questioned Answers', fault: 'selfReference' });
    expect(raw.prepare('SELECT COUNT(*) n FROM content WHERE hyp_questions LIKE ?').get('%this paragraph%').n).toBe(1);
  });
  it('samples are capped at 30 by reservoir', async () => {
    const many = JSON.stringify(Array.from({ length: 50 }, (_, i) => `What does this passage say about item ${i}?`));
    raw.prepare(`INSERT INTO content (id, doc_id, paragraph_index, text, hyp_questions) VALUES (3, 7, 5, 't', ?)`).run(many);
    const r = await hypeQuestionFaultsJob({}, { maxId: async () => 3, yieldTick: async () => {}, rand: () => 0.5 });
    expect(r.faulty).toBe(52);
    expect(r.samples).toHaveLength(30);
  });
});

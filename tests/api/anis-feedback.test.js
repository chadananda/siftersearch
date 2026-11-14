// Anís reply feedback (worker/anis/feedback.js + route in worker/anis/index.js): validation, upsert one vote per reply, withdraw. D1 = better-sqlite3 fake.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import worker from '../../worker/anis/index.js';
import { feedbackRow } from '../../worker/anis/feedback.js';

const mkEnv = () => {
  const db = new Database(':memory:'); db.exec(readFileSync('worker/d1/anis/0017_anis_feedback.sql', 'utf8'));
  return { db, ANIS_DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => db.prepare(sql).run(...a) }) }) } };
};
const post = (env, body, origin = 'https://anis.oceanlibrary.com') => worker.fetch(new Request('https://anis.test/api/chat/feedback',
  { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, { waitUntil() {} });

describe('feedbackRow', () => {
  it('accepts up / down / none and numeric votes', () => {
    expect(feedbackRow({ conversation_id: 't-abc', round: 2, vote: 'up' }, { now: 5 })).toEqual({ conversation_id: 't-abc', round: 2, vote: 1, question: null, site: null, at: 5 });
    expect(feedbackRow({ conversation_id: 't', round: 1, vote: 'down' }).vote).toBe(-1);
    expect(feedbackRow({ conversation_id: 't', round: 1, vote: 'none' }).vote).toBe(0);
    expect(feedbackRow({ conversation_id: 't', round: 1, vote: -1 }).vote).toBe(-1);
  });
  it('rejects a missing or odd conversation id, a bad round, an unknown vote', () => {
    expect(feedbackRow({ round: 1, vote: 'up' }).error).toMatch(/conversation_id/);
    expect(feedbackRow({ conversation_id: 'a b;drop', round: 1, vote: 'up' }).error).toMatch(/conversation_id/);
    expect(feedbackRow({ conversation_id: 'x'.repeat(65), round: 1, vote: 'up' }).error).toMatch(/conversation_id/);
    expect(feedbackRow({ conversation_id: 't', round: 0, vote: 'up' }).error).toMatch(/round/);
    expect(feedbackRow({ conversation_id: 't', round: 1.5, vote: 'up' }).error).toMatch(/round/);
    expect(feedbackRow({ conversation_id: 't', round: 1, vote: 'meh' }).error).toMatch(/vote/);
    expect(feedbackRow(null).error).toBeTruthy();
  });
  it('keeps the question to one line of at most 300 chars', () => {
    const r = feedbackRow({ conversation_id: 't', round: 1, vote: 'up', question: `  what\n is ${'x'.repeat(400)}` });
    expect(r.question.startsWith('what is x')).toBe(true);
    expect(r.question.length).toBe(300);
  });
});

describe('POST /api/chat/feedback', () => {
  it('stores one vote per reply; a second click replaces it; none withdraws it; the site is recorded', async () => {
    const env = mkEnv();
    let res = await post(env, { conversation_id: 't-1', round: 1, vote: 'up', question: 'What is prayer?' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, vote: 1 });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://anis.oceanlibrary.com');
    await post(env, { conversation_id: 't-1', round: 1, vote: 'down' });
    let rows = env.db.prepare('SELECT * FROM anis_feedback').all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ conversation_id: 't-1', round: 1, vote: -1, question: 'What is prayer?', site: 'anis.oceanlibrary.com' });
    await post(env, { conversation_id: 't-1', round: 2, vote: 'up' });
    await post(env, { conversation_id: 't-1', round: 1, vote: 'none' });
    rows = env.db.prepare('SELECT round, vote FROM anis_feedback ORDER BY round').all();
    expect(rows).toEqual([{ round: 1, vote: 0 }, { round: 2, vote: 1 }]);
  });
  it('a bad body → 400, nothing stored', async () => {
    const env = mkEnv();
    const res = await post(env, { conversation_id: 't-1', round: 1, vote: 'love' });
    expect(res.status).toBe(400);
    expect(env.db.prepare('SELECT count(*) n FROM anis_feedback').get().n).toBe(0);
  });
});

describe('site worker → feedback', () => {
  it('forwards POST /api/chat/feedback to the ANIS service whichever engine answered, before the tower proxy', () => {
    const w = readFileSync('worker/index.js', 'utf8');
    const at = w.indexOf("if (env.ANIS && url.pathname === '/api/chat/feedback' && request.method === 'POST') return env.ANIS.fetch(request);");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(w.indexOf('if (isApiPath(url.pathname))'));
  });
});

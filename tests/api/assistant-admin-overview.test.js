// The Anís hub data: activity, costs (unpriced flagged), assessment tallies, and Clef↔Jev agreement — in-memory stores.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { anisActivity, anisCosts, anisAssessment, anisSystem1 } from '../../api/lib/anis/admin-overview.js';

const main = new Database(':memory:');
main.exec(`CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, participant_id TEXT);
  CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, session_id TEXT, round_index INTEGER DEFAULT 0, role TEXT, content TEXT, status TEXT, channel TEXT, path_json TEXT, created_at TEXT, answered_at TEXT);
  CREATE TABLE ai_usage (id INTEGER PRIMARY KEY, timestamp TEXT, caller TEXT, provider TEXT, model TEXT, prompt_tokens INT, completion_tokens INT, estimated_cost_usd REAL);`);
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
main.exec(`INSERT INTO chat_sessions VALUES ('s1','p1'),('s2','p2');
  INSERT INTO chat_messages VALUES (1,'s1',0,'assistant','reply','answered','site-chat','{"gate":"research","recipe":"topic","format":{"id":"authority_layers"}}','${now}','${now}'),
    (2,'s2',0,'assistant','hi','canned','email','{"gate":"canned"}','${now}','${now}'), (3,'s1',0,'user','What does Bahá’u’lláh say about unity?',null,'site-chat',null,'${now}',null),
    (4,'s1',1,'assistant','old','answered','site-chat','{"gate":"research"}','2020-01-01 00:00:00','2020-01-01 00:00:00');
  INSERT INTO ai_usage VALUES (1,'${now}','anis-craft','google','gemini-3.5-flash-lite',3000,400,0),
    (2,'${now}','system1:anis-triage','typesafe','jev-latest',900,0,0.0000378),
    (3,'${now}','search','openai','text-embedding-3-large',0,0,0.0001),
    (4,'${now}','system1:anis-triage:shadow','cloudflare','clef',900,0,0.0002);`);
const queryAll = async (sql, p = []) => main.prepare(sql).all(...p);

describe('Anís hub overview', () => {
  it('activity: replies in the window by day/channel, what each became, distinct people', async () => {
    const a = await anisActivity({ queryAll }, 30);
    expect(a.replies).toBe(2);
    expect(Object.fromEntries(a.byPath.map((r) => [r.path, r.n]))).toEqual({ research: 1, canned: 1 });
    expect(a.people).toBe(2);
    expect(Object.fromEntries(a.byStrategy.map((r) => [r.strategy, r.n]))).toEqual({ topic: 1, '(none)': 1 });
    expect(a.recent.find((r) => r.id === 1)).toMatchObject({ strategy: 'topic', format: 'authority_layers', question: 'What does Bahá’u’lláh say about unity?' });
  });
  it('costs: only Anís callers + his System-1 tasks; nothing unpriced', async () => {
    const c = await anisCosts({ queryAll }, 30);
    expect(c.rows.map((r) => r.caller).sort()).toEqual(['anis-craft', 'system1:anis-triage', 'system1:anis-triage:shadow']);   // Clef shadows count
    expect(c.unpriced).toEqual([]);   // every model Anís uses is priced (10-10)
  });
  it('assessment: tallies verdicts and problems; recent list carries the problems', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE audits (message_id INTEGER PRIMARY KEY, session_id TEXT, round INT, channel TEXT, asked_at TEXT, audited_at TEXT,
      model TEXT, usd REAL, input_tokens INT, output_tokens INT, status TEXT, verdict_json TEXT, error TEXT)`);
    const v = JSON.stringify({ strategy_used: 'topic', strategy_verdict: 'acceptable', evidence: { answered: 'partly' }, format_verdict: { fit: 'good' },
      problems: [{ kind: 'missed-key-passage', detail: 'no direct quotation' }] });
    db.prepare('INSERT INTO audits (message_id, channel, audited_at, usd, status, verdict_json) VALUES (?,?,?,?,?,?)').run(1, 'site-chat', now, 0.03, 'done', v);
    db.prepare('INSERT INTO audits (message_id, channel, audited_at, usd, status, error) VALUES (?,?,?,?,?,?)').run(2, 'email', now, 0, 'error', 'x');
    const r = anisAssessment({ auditDb: db }, 30);
    expect(r).toMatchObject({ available: true, audited: 2, errors: 1, strategy: { acceptable: 1 }, answered: { partly: 1 }, problems: { 'missed-key-passage': 1 } });
    expect(r.recent.find((x) => x.message_id === 1).problems[0].kind).toBe('missed-key-passage');   // newest first: #2 (error) leads
  });
  it('System-1: calls by who served them; Clef agreement with Jev per task', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE calls (id INTEGER PRIMARY KEY, task TEXT, at INTEGER, jev TEXT, served_by TEXT);
      CREATE TABLE shadow (call_id INTEGER, backend TEXT, at INTEGER, answers TEXT, ms INTEGER, error TEXT)`);
    const t = Date.now(), A = (c) => JSON.stringify({ kind: { choice: c } });
    db.prepare('INSERT INTO calls VALUES (?,?,?,?,?)').run(1, 'anis-triage', t, A('research'), 'jev');
    db.prepare('INSERT INTO calls VALUES (?,?,?,?,?)').run(2, 'anis-triage', t, A('canned'), 'jev');
    db.prepare('INSERT INTO shadow VALUES (?,?,?,?,?,?)').run(1, 'clef', t, A('research'), 10, null);
    db.prepare('INSERT INTO shadow VALUES (?,?,?,?,?,?)').run(2, 'clef', t, A('research'), 10, null);
    const r = anisSystem1({ s1Db: db }, 30);
    expect(r.calls).toEqual([{ task: 'anis-triage', served_by: 'jev', n: 2 }]);
    expect(r.agreement).toEqual([{ task: 'anis-triage', backend: 'clef', compared: 2, same: 1 }]);
  });
  it('missing stores are reported unavailable, not thrown', () => {
    expect(anisAssessment({ auditDb: null })).toEqual({ available: false });
    expect(anisSystem1({ s1Db: null })).toEqual({ available: false });
  });
});

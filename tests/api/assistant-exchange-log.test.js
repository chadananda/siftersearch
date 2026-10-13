// Anis exchange log (PRD F1) against a REAL in-memory SQLite: the message is stored before any model runs, one history
// per person, a thread splits after 30 minutes idle, a resumed thread must be OWNED, and pending/failed rows are the
// replay queue.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { openExchange, closeExchange, failExchange, pendingExchanges, pickThread, IDLE_MS } from '../../api/lib/anis/exchange-log.js';

let raw, db;
beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(`CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id INTEGER, participant_id TEXT, title TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP, last_activity TEXT DEFAULT CURRENT_TIMESTAMP, message_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active', published_slug TEXT, metadata_json TEXT, channel TEXT);
    CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, round_index INTEGER NOT NULL, role TEXT NOT NULL,
      content TEXT NOT NULL, tool_calls_json TEXT, tool_name TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, status TEXT, channel TEXT,
      path_json TEXT, answered_at TEXT);`);
  const run = (sql, p = []) => raw.prepare(sql)[/^\s*SELECT/i.test(sql) ? 'all' : 'run'](...p);
  db = { query: async (sql, p) => run(sql, p), queryOne: async (sql, p) => (run(sql, p) || [])[0] ?? null, queryAll: async (sql, p) => run(sql, p) };
});

describe('openExchange — written down before we try', () => {
  it('stores the message as PENDING in a new thread owned by the participant', async () => {
    const ex = await openExchange({ participantId: 'sess_a', text: 'Who was Quddús?' }, db);
    expect(ex).toMatchObject({ round: 0, isNew: true });
    expect(raw.prepare(`SELECT role, status, content FROM chat_messages`).all()).toEqual([{ role: 'user', status: 'pending', content: 'Who was Quddús?' }]);
    expect(raw.prepare(`SELECT participant_id, channel FROM chat_sessions`).get()).toEqual({ participant_id: 'sess_a', channel: 'widget-chat' });
  });

  it('the next message within 30 minutes continues the same thread; another person never joins it', async () => {
    const a = await openExchange({ participantId: 'sess_a', text: 'q1' }, db);
    await closeExchange({ ...a, reply: 'r1' }, db);
    const b = await openExchange({ participantId: 'sess_a', text: 'q2' }, db);
    expect(b).toMatchObject({ conversationId: a.conversationId, round: 1, isNew: false });
    const other = await openExchange({ participantId: 'sess_b', text: 'q' }, db);
    expect(other.conversationId).not.toBe(a.conversationId);
  });

  it('a thread idle past 30 minutes is closed: the next message opens a new one', async () => {
    const a = await openExchange({ participantId: 'sess_a', text: 'q1' }, db);
    raw.prepare(`UPDATE chat_sessions SET last_activity = datetime('now','-31 minutes')`).run();
    const b = await openExchange({ participantId: 'sess_a', text: 'q2' }, db);
    expect(b.isNew).toBe(true);
    expect(b.conversationId).not.toBe(a.conversationId);
  });

  it('resuming someone else\'s conversation id is ignored (a new thread, never their history)', async () => {
    const a = await openExchange({ participantId: 'sess_a', text: 'private' }, db);
    const b = await openExchange({ participantId: 'sess_b', conversationId: a.conversationId, text: 'hi' }, db);
    expect(b.conversationId).not.toBe(a.conversationId);
  });
});

describe('closeExchange / failExchange / the replay queue', () => {
  it('completes both turns with status + path, counts, and names the thread at round 2', async () => {
    const a = await openExchange({ participantId: 'p', text: 'What did the Báb write about the Letters?' }, db);
    await closeExchange({ ...a, reply: 'r', status: 'answered', path: { gate: 'research' } }, db);
    const b = await openExchange({ participantId: 'p', text: 'And Ṭáhirih?' }, db);
    await closeExchange({ ...b, reply: 'r2', status: 'canned', path: { gate: 'canned' } }, db);
    const rows = raw.prepare(`SELECT round_index, role, status FROM chat_messages ORDER BY id`).all();
    expect(rows).toEqual([{ round_index: 0, role: 'user', status: 'answered' }, { round_index: 0, role: 'assistant', status: 'answered' },
      { round_index: 1, role: 'user', status: 'canned' }, { round_index: 1, role: 'assistant', status: 'canned' }]);
    const s = raw.prepare(`SELECT message_count, title FROM chat_sessions`).get();
    expect(s.message_count).toBe(4);
    expect(s.title).toMatch(/Báb/);
  });

  it('failed and stale-pending exchanges are the replay queue; answered ones are not', async () => {
    const a = await openExchange({ participantId: 'p', text: 'will fail' }, db);
    await failExchange({ ...a, error: 'formatter down' }, db);
    const b = await openExchange({ participantId: 'q', text: 'stale' }, db);
    raw.prepare(`UPDATE chat_messages SET created_at = datetime('now','-10 minutes') WHERE session_id = ?`).run(b.conversationId);
    const c = await openExchange({ participantId: 'r', text: 'fine' }, db);
    await closeExchange({ ...c, reply: 'ok' }, db);
    const q = await pendingExchanges({ olderThanMin: 5 }, db);
    expect(q.map((x) => x.content).sort()).toEqual(['stale', 'will fail']);
  });
});

describe('pickThread (pure)', () => {
  const now = Date.parse('2026-09-27T12:00:00Z');
  it('continues only an owned, live, recently active thread', () => {
    const row = { id: 'c1', participant_id: 'p', status: 'active', last_activity: '2026-09-27 11:45:00' };
    expect(pickThread({ latest: row, who: { participantId: 'p' }, now })).toBe('c1');
    expect(pickThread({ latest: { ...row, last_activity: '2026-09-27 11:00:00' }, who: { participantId: 'p' }, now })).toBeNull();
    expect(pickThread({ latest: { ...row, status: 'deleted' }, who: { participantId: 'p' }, now })).toBeNull();
    expect(pickThread({ latest: row, who: { participantId: 'x' }, now })).toBeNull();
    expect(IDLE_MS).toBe(30 * 60 * 1000);
  });
});

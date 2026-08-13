// Threads = chat_sessions owned by a PARTICIPANT. These lock the two things that matter before any UI
// exists: a thread can be named well enough to find in a list, and it can only be read by its owner —
// including the case that motivated the work, where the site chat recorded the API KEY OWNER as owner and
// would have shown every visitor's conversations to everyone.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { deriveThreadTitle, ownsThread, ownThreadsFilter, TITLE_AFTER_ROUNDS } from '../../api/lib/threads.js';

describe('deriveThreadTitle', () => {
  it('uses the opening question as a handle', () => {
    expect(deriveThreadTitle('What do Bahá’ís believe about the afterlife?'))
      .toBe('What do Bahá’ís believe about the afterlife?');
  });

  it('drops greetings and throat-clearing that carry no subject', () => {
    expect(deriveThreadTitle('Hello, tell me about the Covenant')).toBe('About the Covenant');
    expect(deriveThreadTitle('Could you explain the Kitáb-i-Íqán')).toBe('Explain the Kitáb-i-Íqán');
  });

  it('keeps one clause and truncates on a word boundary', () => {
    const long = 'Why did the Báb choose Shíráz for the declaration and what happened to the Letters of the Living afterwards in the years that followed';
    const t = deriveThreadTitle(long);
    expect(t.length).toBeLessThanOrEqual(73);
    expect(t.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/\s…$/);                 // truncated at a word, not mid-space
  });

  it('never returns an empty or unnamed thread', () => {
    expect(deriveThreadTitle('')).toBe('New conversation');
    expect(deriveThreadTitle(null)).toBe('New conversation');
    expect(deriveThreadTitle('   ')).toBe('New conversation');
  });

  it('waits for an exchange before a thread is worth naming', () => {
    expect(TITLE_AFTER_ROUNDS).toBeGreaterThanOrEqual(2);
  });
});

describe('ownsThread — a guessed conversation id must not open someone else’s thread', () => {
  it('matches the participant that owns it', () => {
    expect(ownsThread({ participant_id: 'sess_abc' }, { participantId: 'sess_abc' })).toBe(true);
    expect(ownsThread({ participant_id: 'sess_abc' }, { participantId: 'sess_zzz' })).toBe(false);
  });

  it('lets an account read threads recorded against its numeric user_id', () => {
    expect(ownsThread({ participant_id: null, user_id: 42 }, { participantId: '42', userId: 42 })).toBe(true);
    expect(ownsThread({ participant_id: null, user_id: 42 }, { participantId: 'sess_x', userId: 7 })).toBe(false);
  });

  it('refuses everything when the caller has no identity', () => {
    expect(ownsThread({ participant_id: 'sess_abc' }, {})).toBe(false);
    expect(ownsThread({ participant_id: null, user_id: null }, { participantId: 'sess_abc' })).toBe(false);
  });

  it('compares as strings so a numeric id never loosely matches a session id', () => {
    expect(ownsThread({ participant_id: '42' }, { participantId: '42' })).toBe(true);
    expect(ownsThread({ user_id: 0 }, { userId: 0 })).toBe(true);        // user 0 is still an owner
  });
});

describe('ownThreadsFilter — no identity means NO threads, not all of them', () => {
  it('returns null when there is nothing to key on', () => {
    expect(ownThreadsFilter({})).toBeNull();
    expect(ownThreadsFilter({ participantId: null, userId: null })).toBeNull();
  });

  it('keys on the participant for an anonymous caller', () => {
    const f = ownThreadsFilter({ participantId: 'sess_abc' });
    expect(f.where).toBe('(participant_id = ?)');
    expect(f.args).toEqual(['sess_abc']);
  });

  it('keys on BOTH for an account, so pre-existing threads still appear', () => {
    const f = ownThreadsFilter({ participantId: '42', userId: 42 });
    expect(f.where).toBe('(participant_id = ? OR user_id = ?)');
    expect(f.args).toEqual(['42', 42]);
  });
});

// ── The list/load contract against real SQLite ────────────────────────────────────────────────────────
// The route logic is thin, but the QUERY is the part that leaks: an OR-filter with a missing identity, or
// a load-back that trusts the id instead of the row, both hand one visitor another's conversations. Driven
// against in-memory SQLite so the SQL itself is under test.
describe('thread queries against real SQLite', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, tenant_id TEXT, user_id INTEGER,
             participant_id TEXT, started_at TEXT, last_activity TEXT, message_count INTEGER,
             status TEXT, published_slug TEXT, title TEXT)`);
  const add = (id, participant, userId, count, activity, status = 'active') =>
    db.prepare(`INSERT INTO chat_sessions (id,tenant_id,user_id,participant_id,last_activity,message_count,status,title)
                VALUES (?,?,?,?,?,?,?,?)`).run(id, 'siftersearch', userId, participant, activity, count, status, `T-${id}`);
  add('conv_mine1', 'sess_abc', null, 4, '2026-08-12T20:00:00Z');
  add('conv_mine2', 'sess_abc', null, 2, '2026-08-12T21:00:00Z');
  add('conv_theirs', 'sess_xyz', null, 6, '2026-08-12T22:00:00Z');
  add('conv_acct', null, 42, 8, '2026-08-12T19:00:00Z');
  add('conv_empty', 'sess_abc', null, 0, '2026-08-12T23:00:00Z');      // never used — not a thread yet
  add('conv_gone', 'sess_abc', null, 4, '2026-08-12T23:30:00Z', 'deleted');

  const list = (who) => {
    const f = ownThreadsFilter(who);
    if (!f) return [];
    return db.prepare(`SELECT id FROM chat_sessions
        WHERE tenant_id = ? AND ${f.where} AND status != 'deleted' AND message_count > 0
        ORDER BY last_activity DESC`).all('siftersearch', ...f.args).map((r) => r.id);
  };

  it('lists only my threads, newest first', () => {
    expect(list({ participantId: 'sess_abc' })).toEqual(['conv_mine2', 'conv_mine1']);
  });

  it('excludes an unused session and a deleted one', () => {
    const ids = list({ participantId: 'sess_abc' });
    expect(ids).not.toContain('conv_empty');
    expect(ids).not.toContain('conv_gone');
  });

  it('never shows another participant’s thread', () => {
    expect(list({ participantId: 'sess_abc' })).not.toContain('conv_theirs');
  });

  it('an account sees both its session threads and its account threads', () => {
    expect(list({ participantId: '42', userId: 42 }).sort()).toEqual(['conv_acct']);
    expect(list({ participantId: 'sess_abc', userId: 42 }).sort())
      .toEqual(['conv_acct', 'conv_mine1', 'conv_mine2']);
  });

  it('returns NOTHING for a caller with no identity — never the whole table', () => {
    expect(list({})).toEqual([]);
  });

  it('load-back authorises against the row, so a guessed id 404s', () => {
    const row = db.prepare('SELECT participant_id, user_id FROM chat_sessions WHERE id = ?').get('conv_theirs');
    expect(ownsThread(row, { participantId: 'sess_abc' })).toBe(false);
    const own = db.prepare('SELECT participant_id, user_id FROM chat_sessions WHERE id = ?').get('conv_mine1');
    expect(ownsThread(own, { participantId: 'sess_abc' })).toBe(true);
  });

  it('after connecting, the session threads belong to the account', () => {
    db.prepare('UPDATE chat_sessions SET participant_id = ?, user_id = ? WHERE participant_id = ?')
      .run('42', 42, 'sess_abc');
    expect(list({ participantId: '42', userId: 42 }).sort()).toEqual(['conv_acct', 'conv_mine1', 'conv_mine2']);
    expect(list({ participantId: 'sess_abc' })).toEqual([]);   // the discarded session keeps nothing
  });
});

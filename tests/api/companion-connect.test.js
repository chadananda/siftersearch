// Connecting an account IS the retention consent, and the moment a temporary session becomes part of a
// history the person owns. These lock the merge contract: nothing is lost, consent is a union, the
// claim records its source, and reconnecting is harmless. The store is driven against an in-memory
// stand-in for the user db so the logic — not SQLite — is what's under test.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// A tiny table store: enough to model UPDATE ... SET participant_id and the relationship row.
const db = { relationship: new Map(), rows: { companion_memory: [], companion_premise: [], companion_exposure: [], companion_enrollment: [] } };

vi.mock('../../api/lib/db.js', () => ({
  userQuery: async (sql, args = []) => {
    const m = sql.match(/UPDATE OR IGNORE (\w+) SET participant_id = \? WHERE participant_id = \?/);
    if (m) { for (const r of db.rows[m[1]]) if (r.participant_id === args[1]) r.participant_id = args[0]; return; }
    if (/INSERT OR IGNORE INTO companion_relationship/.test(sql)) {
      if (!db.relationship.has(args[0])) db.relationship.set(args[0], { participant_id: args[0], consent_memory: 0, consent_contact: 0, dials_json: '{}' });
      return;
    }
    if (/UPDATE companion_relationship[\s\S]*MAX\(consent_memory/.test(sql)) {
      const [cm, cc, from, , to] = args;
      const r = db.relationship.get(to);
      if (r) { r.consent_memory = Math.max(r.consent_memory, cm); r.consent_contact = Math.max(r.consent_contact, cc); r.merged_from = from; }
      return;
    }
    if (/UPDATE companion_relationship SET consent_memory/.test(sql) || /UPDATE companion_relationship SET .*consent_/.test(sql)) {
      const to = args[args.length - 1];
      const r = db.relationship.get(to);
      if (r) { r.consent_memory = args[0] ? 1 : 0; r.consent_source = args[1]; r.consent_at = args[2]; }
      return;
    }
    if (/UPDATE companion_relationship SET dials_json/.test(sql)) {
      const r = db.relationship.get(args[2]); if (r) r.dials_json = args[0]; return;
    }
    if (/DELETE FROM companion_relationship/.test(sql)) { db.relationship.delete(args[0]); return; }
  },
  userQueryOne: async (sql, args = []) => {
    if (/FROM companion_relationship/.test(sql)) return db.relationship.get(args[0]) || null;
    return null;
  },
  userQueryAll: async () => [],
}));
vi.mock('../../api/lib/logger.js', () => ({ logger: { info() {}, warn() {} } }));

const store = await import('../../api/lib/companion/store.js');

beforeEach(() => {
  db.relationship.clear();
  db.relationship.set('sess_abc', { participant_id: 'sess_abc', consent_memory: 0, consent_contact: 0, dials_json: '{"candor":5}' });
  db.rows.companion_memory = [{ id: 1, participant_id: 'sess_abc' }];
  db.rows.companion_exposure = [{ id: 1, participant_id: 'sess_abc' }, { id: 2, participant_id: 'sess_abc' }];
  db.rows.companion_premise = [{ id: 1, participant_id: 'sess_abc' }];
  db.rows.companion_enrollment = [];
});

describe('mergeParticipant — a temporary session becomes part of an account', () => {
  it('carries the session’s memory, premises and exposures over to the account', async () => {
    await store.mergeParticipant('sess_abc', '42');
    expect(db.rows.companion_memory.every((r) => r.participant_id === '42')).toBe(true);
    expect(db.rows.companion_premise.every((r) => r.participant_id === '42')).toBe(true);
    // Exposures move too: the account's inquiry did not begin at the moment of login.
    expect(db.rows.companion_exposure.every((r) => r.participant_id === '42')).toBe(true);
  });

  it('records what it merged, and removes the spent session row', async () => {
    await store.mergeParticipant('sess_abc', '42');
    expect(db.relationship.get('42').merged_from).toBe('sess_abc');
    expect(db.relationship.has('sess_abc')).toBe(false);
  });

  it('takes the UNION of consent — a yes already given is not withdrawn by connecting', async () => {
    db.relationship.get('sess_abc').consent_memory = 1;
    db.relationship.set('42', { participant_id: '42', consent_memory: 0, consent_contact: 0, dials_json: '{}' });
    await store.mergeParticipant('sess_abc', '42');
    expect(db.relationship.get('42').consent_memory).toBe(1);
  });

  it('keeps dial preferences set while anonymous', async () => {
    await store.mergeParticipant('sess_abc', '42');
    expect(JSON.parse(db.relationship.get('42').dials_json)).toMatchObject({ candor: 5 });
  });

  it('is a no-op for a missing or self-referential merge, and safe to repeat', async () => {
    expect((await store.mergeParticipant(null, '42')).merged).toBe(false);
    expect((await store.mergeParticipant('42', '42')).merged).toBe(false);
    await store.mergeParticipant('sess_abc', '42');
    await expect(store.mergeParticipant('sess_abc', '42')).resolves.toBeTruthy();  // reconnect: harmless
  });
});

describe('consent provenance', () => {
  it('records HOW retention was granted, so it can be explained back to the person', async () => {
    db.relationship.set('42', { participant_id: '42', consent_memory: 0, consent_contact: 0, dials_json: '{}' });
    await store.setConsent('42', { memory: true, source: 'connect' });
    const r = db.relationship.get('42');
    expect(r.consent_memory).toBe(1);
    expect(r.consent_source).toBe('connect');
    expect(r.consent_at).toBeGreaterThan(0);
  });
});

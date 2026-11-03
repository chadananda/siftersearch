// Deep reports reach readers only through Chad's approval (11-03, launch): tower's report outbox → reportDrafts stores a
// DRAFT (kind 'report') + a review notice; the rules hold a report until his Send. Deps: worker/mail/drafting.js, rules.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportDrafts } from '../../worker/mail/drafting.js';
import { deliver } from '../../worker/mail/index.js';
import { sendDecision } from '../../worker/mail/rules.js';

const MIG = join(import.meta.dirname, '..', '..', 'worker', 'd1', 'anis');
function d1() {
  const db = new Database(':memory:');
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(MIG, f), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => { const s = db.prepare(sql); if (s.reader) return s.get(...args) ?? null; s.run(...args); return null; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (xs) => { for (const x of xs) await x.run(); }, raw: db };
}
const MAIL = { key: 'report-42-reader@example.org', research_id: 42, to: 'Reader@example.org', subject: 'Report: Suffering', html: '<p>report</p>', text: '# Suffering\n\nTests are benefits.' };
let env, fetched;
beforeEach(() => {
  env = { ANIS_DB: d1(), AWS_SES_ACCESS_KEY_ID: 'k', AWS_SES_SECRET_ACCESS_KEY: 's', MAIL_LINK_SECRET: 'sec', S1_KEY: 'x' };
  fetched = [];
  vi.stubGlobal('fetch', vi.fn(async (req, init) => {
    const url = typeof req === 'string' ? req : req.url;
    if (url.includes('email.')) { fetched.push(JSON.parse(init?.body ?? await req.text())); return new Response(JSON.stringify({ MessageId: 'm' })); }
    return new Response(JSON.stringify({ silent: true, reason: 'test' }));
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('reportDrafts (tower outbox → review draft)', () => {
  it('stores each report as a draft with its research_id, notifies the reviewer, acks, and sends nothing to the reader', async () => {
    const call = vi.fn(async (e, path) => (path === '/outbox' ? { mails: [MAIL] } : { ok: true }));
    const notify = vi.fn(async () => {});
    expect(await reportDrafts(env, { call, notify })).toEqual({ drafted: 1, waiting: 1 });
    const rows = env.ANIS_DB.raw.prepare(`SELECT * FROM mail_messages WHERE kind = 'report'`).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'draft', direction: 'out', mailbox: 'anis', to_addr: 'reader@example.org', subject: 'Report: Suffering', html: '<p>report</p>' });
    expect(JSON.parse(rows[0].meta_json)).toEqual({ type: 'report', key: MAIL.key, research_id: 42 });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(env, '/outbox/ack', { key: MAIL.key });
    expect(fetched).toHaveLength(0);
  });
  it('a key already stored is acked again, never drafted twice', async () => {
    const call = vi.fn(async (e, path) => (path === '/outbox' ? { mails: [MAIL] } : { ok: true }));
    await reportDrafts(env, { call, notify: async () => {} });
    expect(await reportDrafts(env, { call, notify: async () => {} })).toMatchObject({ drafted: 0 });
    expect(env.ANIS_DB.raw.prepare(`SELECT count(*) n FROM mail_messages WHERE kind = 'report'`).get().n).toBe(1);
    expect(call.mock.calls.filter((c) => c[1] === '/outbox/ack')).toHaveLength(2);
  });
  it('the draft is delivered only with Chad\'s approval', async () => {
    const call = async (e, path) => (path === '/outbox' ? { mails: [MAIL] } : { ok: true });
    await reportDrafts(env, { call, notify: async () => {} });
    const row = env.ANIS_DB.raw.prepare(`SELECT * FROM mail_messages WHERE kind = 'report'`).get();
    expect(await deliver(env, row)).toMatchObject({ status: 'blocked', reason: expect.stringMatching(/approval/) });
    expect(fetched).toHaveLength(0);
    env.ANIS_DB.raw.prepare(`UPDATE mail_messages SET status = 'draft' WHERE id = ?`).run(row.id);
    expect(await deliver(env, row, { approved: true })).toMatchObject({ status: 'sent' });
    expect(fetched[0].Destination.ToAddresses[0]).toBe('reader@example.org');
  });
});

describe('rules for a report', () => {
  const f = { kind: 'report', suppressed: false, ignored: null, stopped: false, invited: false, inboundCount: 0, sentToPersonToday: 0, sentToday: 0 };
  it('held without approval; allowed with it; never to a suppressed address', () => {
    expect(sendDecision({ ...f, approved: false }).reason).toMatch(/approval/);
    expect(sendDecision({ ...f, approved: true }).ok).toBe(true);
    expect(sendDecision({ ...f, approved: true, suppressed: true }).ok).toBe(false);
  });
});

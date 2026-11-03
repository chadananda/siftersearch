// Launch rules for letters Anís starts: only INVITED people; a first (welcome) letter is held for Chad, never sent by the
// machine; outreach-due skips non-invited; stop/pause honoured; no mention of siftersearch.com. Real D1 migrations on sqlite.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import { sendDecision, settingsFrom } from '../../worker/mail/rules.js';
import { planWelcomes, planOutreach, inviteReader } from '../../worker/mail/drafting.js';
import { translateWelcome } from '../../api/lib/assistant/welcome.js';

const dir = new URL('../../worker/d1/anis/', import.meta.url);
function d1() {
  const db = new Database(':memory:');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}
let env, sent;
beforeEach(() => {
  sent = [];
  env = { ANIS_DB: d1(), AWS_SES_ACCESS_KEY_ID: 'k', AWS_SES_SECRET_ACCESS_KEY: 's', MAIL_LINK_SECRET: 'sec', S1_KEY: 'x' };
  env.ANIS_DB.raw.prepare(`UPDATE mail_settings SET value = 'on' WHERE key = 'outreach_enabled'`).run();
  env.ANIS_DB.raw.prepare(`DELETE FROM mail_allowlist`).run();                 // the migration seeds Chad himself
  vi.stubGlobal('fetch', vi.fn(async (req, init) => {
    const url = typeof req === 'string' ? req : req.url;
    if (url.includes('email.')) { sent.push(JSON.parse(init?.body ?? await req.text())); return new Response(JSON.stringify({ MessageId: 'm' })); }
    return new Response(JSON.stringify({ silent: true, reason: 'test' }));
  }));
});
afterEach(() => vi.unstubAllGlobals());
const toAddrs = () => sent.map((b) => b.Destination.ToAddresses[0]);
const drafts = () => env.ANIS_DB.raw.prepare(`SELECT * FROM mail_messages WHERE direction = 'out' AND status = 'draft'`).all();

describe('rules', () => {
  const f = { kind: 'welcome', allowlisted: true, invited: true, approved: true, inboundCount: 0, sentToday: 0, sentToPersonToday: 0, askedBy: 'Chad' };
  const on = settingsFrom([{ key: 'outreach_enabled', value: 'on' }]);
  it('a welcome is refused until Chad approves, and for anyone not invited', () => {
    expect(sendDecision({ ...f, approved: false }, on).reason).toMatch(/held for Chad/);
    expect(sendDecision({ ...f, invited: false }, on).reason).toMatch(/invited/);
    expect(sendDecision(f, on).ok).toBe(true);
  });
  it('outreach needs an invited reader even when on the list', () => {
    const o = { ...f, kind: 'outreach', inboundCount: 1, daysSinceLastInbound: 4, outreachSinceLastInbound: 0 };
    expect(sendDecision({ ...o, invited: false }, on).reason).toMatch(/not invited/);
    expect(sendDecision(o, on).ok).toBe(true);
  });
});

describe('welcome letters (F11)', () => {
  it('inviting makes a DRAFT for Chad and sends nothing to the invitee, even though Chad asked', async () => {
    await inviteReader(env, { email: 'Reader@Example.com', name: 'Reader' });
    await planWelcomes(env);
    expect(toAddrs()).toEqual(['chadananda@gmail.com']);                       // only the review notice
    const [d] = drafts();
    expect(d).toMatchObject({ kind: 'welcome', to_addr: 'reader@example.com', status: 'draft' });
    expect(d.text).toMatch(/Ocean AI Research Assistant of Ocean 2\.0 \(OceanLibrary\.com\)/);
    expect(`${d.text}${d.html}${d.subject}`).not.toMatch(/siftersearch/i);
    expect(d.text).toMatch(/I'm an AI/);
    await planWelcomes(env);                                                   // not drafted twice
    expect(drafts()).toHaveLength(1);
  });
  it('people who merely wrote to Anís (not invited) get no welcome', async () => {
    env.ANIS_DB.raw.prepare(`INSERT INTO mail_allowlist (email, note) VALUES ('ocean@user.org', 'wrote to Anís')`).run();
    await planWelcomes(env);
    expect(drafts()).toHaveLength(0); expect(sent).toHaveLength(0);
  });
  it('is written in the reader\'s language: translated by tower, and not held back as English', async () => {
    await inviteReader(env, { email: 'fa@example.com', name: 'Leila', lang: 'fa' });
    const translate = vi.fn(async (_e, { lang }) => ({ subject: `[${lang}] salaam`, body: `[${lang}] body` }));
    await planWelcomes(env, undefined, { translate });
    expect(translate).toHaveBeenCalledWith(env, expect.objectContaining({ lang: 'fa' }));
    expect(drafts()[0]).toMatchObject({ subject: '[fa] salaam', text: '[fa] body' });
  });
  it('no draft (and no English fallback) when the translation fails', async () => {
    await inviteReader(env, { email: 'fa@example.com', lang: 'fa' });
    await planWelcomes(env, undefined, { translate: async () => { throw new Error('down'); } });
    expect(drafts()).toHaveLength(0);
  });
  it('Chad\'s Send on the review page is what delivers it', async () => {
    const { deliver } = await import('../../worker/mail/index.js');
    await inviteReader(env, { email: 'reader@example.com' });
    await planWelcomes(env);
    const d = drafts()[0];
    expect((await deliver(env, d)).status).toBe('blocked');                   // the machine path
    expect(toAddrs()).not.toContain('reader@example.com');
    expect((await deliver(env, d, { approved: true })).status).toBe('sent');  // the review page
    expect(toAddrs()).toContain('reader@example.com');
  });
});

describe('outreach due', () => {
  const wrote = (email, daysAgo) => env.ANIS_DB.raw.prepare(`INSERT INTO mail_messages (mailbox, direction, status, from_addr, to_addr, subject, text, thread_key, created_at)
    VALUES ('anis', 'in', 'drafted', ?, 'anis@oceanlibrary.com', 'q', 'What is justice?', ?, datetime('now', ?))`).run(email, `t-${email}`, `-${daysAgo} days`);
  it('asks tower to write only for invited readers who are due; the uninvited are skipped', async () => {
    env.ANIS_DB.raw.prepare(`INSERT INTO mail_allowlist (email, note) VALUES ('plain@user.org', 'wrote to Anís')`).run();
    await inviteReader(env, { email: 'inv@example.com' });
    wrote('plain@user.org', 10); wrote('inv@example.com', 10);
    await planOutreach(env);
    const asked = fetch.mock.calls.filter(([u]) => String(u).endsWith('/outreach')).map(([, i]) => JSON.parse(i.body).email);
    expect(asked).toEqual(['inv@example.com']);
  });
  it('not yet due, or paused/stopped, writes nothing', async () => {
    await inviteReader(env, { email: 'inv@example.com' });
    wrote('inv@example.com', 1);
    await planOutreach(env);
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith('/outreach'))).toBe(false);
  });
});

describe('welcome translation (tower)', () => {
  it('returns the model JSON; refuses a letter naming siftersearch', async () => {
    const ok = await translateWelcome({ subject: 's', body: 'b', lang: 'fr' }, { complete: async () => '{"subject":"salut","body":"corps Anís"}' });
    expect(ok).toEqual({ subject: 'salut', body: 'corps Anís' });
    expect(await translateWelcome({ subject: 's', body: 'b', lang: 'fr' }, { complete: async () => '{"subject":"a","body":"see siftersearch.com"}' })).toBeNull();
    expect(await translateWelcome({ subject: 's', body: 'b', lang: 'fr' }, { complete: async () => 'nope' })).toBeNull();
  });
});

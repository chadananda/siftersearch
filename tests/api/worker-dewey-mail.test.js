// Dewey's mailbox at the edge (worker/mail/dewey.js + zepto.js): recipient routing, the sender-authentication gate, whitelist
// gating (a stranger gets ONE how-to note), per-sender caps, the job round trip with tower, the ZeptoMail letter (threaded, no
// attachments, rendered both ways), bounces → suppression, and the Dewey section of Chad's daily digest. D1 = the real
// migrations on in-memory SQLite; R2 and tower are fakes; ZeptoMail is a stubbed fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { mailboxFor, authenticated, storeInbound, deweyStep, deweyCron, deweyEmail, sendDewey, deweyLetter, strangerNote } from '../../worker/mail/dewey.js';
import { zeptoPayload, zeptoEventRows, zeptoEvents } from '../../worker/mail/zepto.js';
import { gatherConversations } from '../../worker/mail/drafting.js';
import { conversationDigest } from '../../worker/mail/conversation-digest.js';
import { loadSettings } from '../../worker/mail/index.js';

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
function r2() {
  const m = new Map();
  return { m, put: async (k, v) => m.set(k, new Uint8Array(v)), get: async (k) => (m.has(k) ? { arrayBuffer: async () => m.get(k).buffer } : null), delete: async (k) => m.delete(k) };
}
const CF_AUTH = 'Authentication-Results: mx.cloudflare.net; dkim=pass header.d=example.org header.s=s1; dmarc=pass header.from=example.org; spf=pass smtp.mailfrom=example.org';
function mime({ from = 'Ann Smith <ann@example.org>', subject = 'Books', text = 'Portals to Freedom', id = '<m1@example.org>', auth = CF_AUTH, attach = null, extra = '' } = {}) {
  const head = [auth, `From: ${from}`, 'To: dewey@siftersearch.com', `Subject: ${subject}`, `Message-ID: ${id}`, 'MIME-Version: 1.0', extra].filter(Boolean);
  if (!attach) return [...head, 'Content-Type: text/plain; charset=utf-8', '', text].join('\r\n');
  return [...head, 'Content-Type: multipart/mixed; boundary="b1"', '', '--b1', 'Content-Type: text/plain; charset=utf-8', '', text,
    '--b1', `Content-Type: ${attach.type}; name="${attach.name}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${attach.name}"`, '', Buffer.from(attach.bytes).toString('base64'), '--b1--', ''].join('\r\n');
}
const bytes = (s) => new TextEncoder().encode(s);
let env, sent;
beforeEach(async () => {
  env = { ANIS_DB: d1(), MEDIA_BUCKET: r2(), S1_KEY: 'k', ZEPTO_API_KEY: 'zk', ZEPTO_HOST: 'zepto.test', ZEPTO_WEBHOOK_KEY: 'wk', MAIL_LINK_SECRET: 's' };
  await env.ANIS_DB.prepare(`UPDATE mail_settings SET value = 'on' WHERE key = 'dewey_mail'`).run();
  sent = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return Response.json({ message: 'OK', request_id: `req-${sent.length}` }, { status: 201 }); }));
});
afterEach(() => vi.unstubAllGlobals());
const rows = (sql, ...a) => env.ANIS_DB.raw.prepare(sql).all(...a);

describe('routing and the authentication gate', () => {
  it('only dewey@siftersearch.com (and dewey+tag@) is Dewey', () => {
    expect(mailboxFor('dewey@siftersearch.com')).toBe('dewey');
    expect(mailboxFor('Dewey+books@SifterSearch.com')).toBe('dewey');
    expect(mailboxFor('anis@siftersearch.com')).toBeNull();
    expect(mailboxFor('dewey@oceanlibrary.com')).toBeNull();
  });
  it('email(): another address is refused at SMTP time; Dewey\'s is stored', async () => {
    const reject = vi.fn();
    expect(await deweyEmail({ to: 'info@siftersearch.com', from: 'a@b.c', rawSize: 10, setReject: reject }, env)).toEqual({ rejected: 'recipient' });
    expect(reject).toHaveBeenCalled();
    const raw = mime();
    const r = await deweyEmail({ to: 'dewey@siftersearch.com', from: 'ann@example.org', rawSize: raw.length, raw: new Response(raw).body, setReject: reject }, env);
    expect(r).toMatchObject({ status: 'new' });
  });
  it('trusts only Cloudflare\'s own topmost Authentication-Results', () => {
    expect(authenticated([{ key: 'authentication-results', value: 'mx.cloudflare.net; dmarc=pass header.from=example.org' }], 'ann@example.org')).toBe(true);
    expect(authenticated([{ key: 'arc-authentication-results', value: 'i=1; mx.cloudflare.net; dkim=pass header.d=example.org' }], 'ann@example.org')).toBe(true);
    expect(authenticated([{ key: 'authentication-results', value: 'mx.cloudflare.net; dkim=pass header.d=evil.com; dmarc=fail' }], 'ann@example.org')).toBe(false);
    // a forged pass written by the sender sits BELOW Cloudflare's stamp
    expect(authenticated([{ key: 'authentication-results', value: 'mx.cloudflare.net; dmarc=fail' }, { key: 'authentication-results', value: 'mx.cloudflare.net; dmarc=pass' }], 'ann@example.org')).toBe(false);
    expect(authenticated([{ key: 'authentication-results', value: 'evil.example; dmarc=pass' }], 'ann@example.org')).toBe(false);
  });
  it('an unauthenticated letter is stored as unverified and never answered', async () => {
    const r = await storeInbound(env, bytes(mime({ auth: '' })));
    expect(r.status).toBe('unverified');
    const call = vi.fn();
    await deweyCron(env, { call });
    expect(call).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});

describe('whitelist gating', () => {
  it('a stranger gets ONE how-to-contribute note; nothing is processed; a second letter gets none', async () => {
    const call = vi.fn(async (e, path) => (path.startsWith('/contributor') ? { contributor: false } : (() => { throw new Error(`stranger reached ${path}`); })()));
    await storeInbound(env, bytes(mime({ id: '<s1@example.org>' })));
    await deweyCron(env, { call });
    await storeInbound(env, bytes(mime({ id: '<s2@example.org>' })));
    await deweyCron(env, { call });
    expect(call.mock.calls.map((c) => c[1])).toEqual(['/contributor?email=ann%40example.org', '/contributor?email=ann%40example.org']);
    expect(sent).toHaveLength(1);
    expect(sent[0].body.textbody).toMatch(/not on my list of contributors[\s\S]*siftersearch\.com\/contribute/);
    expect(rows(`SELECT status, error FROM mail_messages WHERE direction = 'in'`)).toEqual([{ status: 'stranger', error: null }, { status: 'stranger', error: 'already told how to contribute' }]);
  });
  it('a contributor over the daily cap is stored, not processed', async () => {
    await env.ANIS_DB.prepare(`UPDATE mail_settings SET value = '1' WHERE key = 'dewey_per_sender_daily'`).run();
    env.ANIS_DB.raw.prepare(`INSERT INTO mail_messages (mailbox, direction, status, from_addr) VALUES ('dewey', 'in', 'answered', 'ann@example.org')`).run();
    await storeInbound(env, bytes(mime()));
    const call = vi.fn(async () => ({ contributor: true }));
    await deweyCron(env, { call });
    expect(call).toHaveBeenCalledTimes(1);   // the whitelist check only
    expect(rows(`SELECT status FROM mail_messages WHERE direction = 'in' ORDER BY id DESC LIMIT 1`)[0].status).toBe('capped');
  });
  it('off switch: nothing is processed while dewey_mail is off', async () => {
    await env.ANIS_DB.prepare(`UPDATE mail_settings SET value = 'off' WHERE key = 'dewey_mail'`).run();
    await storeInbound(env, bytes(mime()));
    expect(await deweyCron(env, { call: vi.fn() })).toEqual({ off: true });
  });
});

describe('a contributor\'s letter, end to end (tower faked)', () => {
  it('photo goes to tower; the reply is threaded, rendered, sent without attachments; R2 is emptied', async () => {
    const jpeg = new Uint8Array(20000).fill(7);
    const r = await storeInbound(env, bytes(mime({ subject: 'Found this', text: 'Do we have this one?', attach: { name: 'cover.jpg', type: 'image/jpeg', bytes: jpeg } })));
    expect(env.MEDIA_BUCKET.m.size).toBe(1);
    const posted = [];
    const reply = 'Dear Ann,\n\nThank you — here is what I found.\n\n**Already in the library**\n\n- your photo, which I read as *The Chosen Highway* — [read it here](https://siftersearch.com/document/123)\n\nWith thanks,';
    const call = vi.fn(async (e, path, body) => {
      if (path.startsWith('/contributor')) return { contributor: true, name: 'Ann Smith' };
      if (path === '/process') { posted.push(body); return { status: 'running' }; }
      return { status: 'done', result: { contributor: true, reply, plan: { photos: 1 }, results: [{ verb: 'holdings', source: 'photo', verdict: 'held' }], unread: [], refused: [] } };
    });
    await deweyCron(env, { call });                       // tick 1: whitelist → job started
    expect(posted[0]).toMatchObject({ job: `dewey-mail-${r.id}`, from: 'ann@example.org', subject: 'Found this', text: 'Do we have this one?' });
    expect(posted[0].attachments).toEqual([{ name: 'cover.jpg', type: 'image/jpeg', size: 20000, data: Buffer.from(jpeg).toString('base64') }]);
    expect(sent).toHaveLength(0);
    await deweyCron(env, { call });                       // tick 2: job done → reply
    expect(sent).toHaveLength(1);
    const p = sent[0].body;
    expect(sent[0].url).toBe('https://zepto.test/v1.1/email');
    expect(p.from).toEqual({ address: 'dewey@siftersearch.com', name: 'Dewey' });
    expect(p.to[0].email_address.address).toBe('ann@example.org');
    expect(p.subject).toBe('Re: Found this');
    expect(p.mime_headers).toEqual({ 'In-Reply-To': '<m1@example.org>', References: '<m1@example.org>' });
    expect(p.attachments).toBeUndefined();
    expect(p.track_opens).toBe(false);
    expect(p.htmlbody).toMatch(/<a [^>]*href="https:\/\/siftersearch\.com\/document\/123"[^>]*>read it here<\/a>/);
    expect(p.htmlbody).toMatch(/— Dewey<\/p>/);
    expect(p.textbody).toMatch(/read it here \(https:\/\/siftersearch\.com\/document\/123\)/);
    expect(p.textbody).not.toMatch(/\*\*/);
    expect(rows(`SELECT direction, status, kind FROM mail_messages ORDER BY id`)).toEqual([{ direction: 'in', status: 'answered', kind: null }, { direction: 'out', status: 'sent', kind: 'reply' }]);
    expect(env.MEDIA_BUCKET.m.size).toBe(0);
    expect(rows('SELECT status FROM mail_attachments')).toEqual([{ status: 'delivered' }]);
  });
  it('a failed job is retried, then marked failed after 3 attempts', async () => {
    await storeInbound(env, bytes(mime()));
    const call = vi.fn(async (e, path) => (path.startsWith('/contributor') ? { contributor: true } : path === '/process' ? { status: 'running' } : { status: 'failed', error: 'boom' }));
    for (let i = 0; i < 5; i++) await deweyCron(env, { call });
    expect(rows(`SELECT status, error FROM mail_messages WHERE direction = 'in'`)[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/after 3 attempts: boom/) });
    expect(sent).toHaveLength(0);
  });
  it('a small inline image (a signature logo) is not sent to tower', async () => {
    await storeInbound(env, bytes(mime({ attach: { name: 'logo.png', type: 'image/png', bytes: new Uint8Array(900) } })));
    expect(env.MEDIA_BUCKET.m.size).toBe(0);
    expect(rows('SELECT status FROM mail_attachments')).toEqual([{ status: 'skipped' }]);
  });
});

describe('sending safety', () => {
  it('suppressed addresses are never written to; no key → kept as a draft with the reason', async () => {
    env.ANIS_DB.raw.prepare(`INSERT INTO mail_suppression (email, reason) VALUES ('ann@example.org', 'bounce')`).run();
    expect(await sendDewey(env, { to: 'ann@example.org', subject: 's', md: 'Hi' })).toMatchObject({ status: 'suppressed' });
    delete env.ZEPTO_API_KEY;
    expect(await sendDewey(env, { to: 'bob@example.org', subject: 's', md: 'Hi' })).toMatchObject({ status: 'draft', error: expect.stringMatching(/ZEPTO_API_KEY/) });
    expect(sent).toHaveLength(0);
  });
  it('ZeptoMail bounce / complaint webhook → events + suppression (token required)', async () => {
    const body = { event_name: ['hardbounce'], event_message: [{ request_id: 'req-9', email_info: { to: [{ email_address: { address: 'Ann@Example.org' } }] }, event_data: [{ details: [{ bounced_recipient: 'ann@example.org', reason: 'no such user' }] }] }] };
    expect(zeptoEventRows(body).suppress).toEqual([{ email: 'ann@example.org', reason: 'bounce' }]);
    expect(zeptoEventRows({ event_name: ['feedback_loop'], event_message: [{ email_info: { to: [{ email_address: { address: 'x@y.z' } }] } }] }).suppress).toEqual([{ email: 'x@y.z', reason: 'complaint' }]);
    const bad = await zeptoEvents(new Request('https://s/_mail/zepto/events?k=nope', { method: 'POST', body: JSON.stringify(body) }), env);
    expect(bad.status).toBe(401);
    const ok = await zeptoEvents(new Request('https://s/_mail/zepto/events?k=wk', { method: 'POST', body: JSON.stringify(body) }), env);
    expect(await ok.json()).toMatchObject({ recorded: 'Bounce', suppressed: 1 });
    expect(rows('SELECT email, reason FROM mail_suppression')).toEqual([{ email: 'ann@example.org', reason: 'bounce' }]);
  });
  it('payload: references carry the thread; reply-to is Dewey', () => {
    const p = zeptoPayload({ from: 'dewey@siftersearch.com', fromName: 'Dewey', to: 'a@b.c', subject: 'Re: x', text: 't', html: '<p>t</p>', inReplyTo: '<2@b.c>', references: '<1@b.c> <2@b.c>' });
    expect(p.mime_headers).toEqual({ 'In-Reply-To': '<2@b.c>', References: '<1@b.c> <2@b.c>' });
    expect(p.reply_to).toEqual([{ address: 'dewey@siftersearch.com', name: 'Dewey' }]);
  });
  it('Dewey\'s letter: both parts, his signature, the stranger note names the contribute page', () => {
    const { text, html } = deweyLetter('Dear Ann,\n\n**Already in the library**\n\n- *X* — [read it here](https://siftersearch.com/document/1)\n\nWith thanks,');
    expect(html).toMatch(/^<!doctype html>/i);
    expect(text).toMatch(/With thanks,\n\n— Dewey\nLibrarian · SifterSearch$/);
    expect(strangerNote('Bob Jones')).toMatch(/^Dear Bob,/);
  });
});

describe('the daily digest: a Dewey section, each letter as the contributor saw it', () => {
  it('Dewey\'s conversations come after Anís\'s under their own heading', async () => {
    const r = await storeInbound(env, bytes(mime({ text: 'Portals to Freedom' })));
    env.ANIS_DB.raw.prepare(`UPDATE mail_messages SET status = 'answered' WHERE id = ?`).run(r.id);
    await sendDewey(env, { to: 'ann@example.org', subject: 'Re: Books', md: 'Dear Ann,\n\n**New to us**\n\n- “Portals to Freedom” — not in the library.\n\nWith thanks,', inReplyTo: '<m1@example.org>', threadKey: '<m1@example.org>', meta: { type: 'dewey' } });
    env.ANIS_DB.raw.prepare(`INSERT INTO mail_messages (mailbox, direction, status, from_addr, subject, text, thread_key) VALUES ('anis', 'in', 'drafted', 'zed@example.org', 'A question', 'Who was Ṭáhirih?', '<z@x>')`).run();
    const settings = await loadSettings(env.ANIS_DB);
    const g = await gatherConversations(env, { until: new Date(Date.now() + 60000), settings, fetchTower: async () => null });
    expect(g.conversations.map((c) => c.channel).sort()).toEqual(['dewey', 'email']);
    const d = conversationDigest(g.conversations, { reviewer: 'chadananda@gmail.com', date: 'today' });
    const at = (s) => d.html.indexOf(s);
    expect(at('Dewey — contributor mail')).toBeGreaterThan(at('Who was Ṭáhirih?'));
    expect(at('Portals to Freedom')).toBeGreaterThan(at('Dewey — contributor mail'));
    expect(d.html).toMatch(/Dewey → &lt;a@example\.org&gt;/);
    expect(d.html).toMatch(/— Dewey<\/p>/);
    expect(d.html).not.toMatch(/<!doctype/i);
    expect(d.text).toMatch(/── DEWEY — contributor mail ──[\s\S]*DEWEY \(dewey reply/);
  });
});

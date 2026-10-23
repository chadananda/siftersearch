// Dewey's mailbox at the edge (worker/mail/dewey.js + zepto.js): routing, the DOOR RULES (no model: OOO, lists, bounces, CC,
// duplicates, unauthenticated), the SCREEN's decisions (quarantine / hold / silent / stranger), the DEBOUNCE (letters in pieces →
// one reply), the threaded receipt, "now live" batching, BOOK REQUESTS (caps, approval, pause link), and the digest's Dewey
// section. D1 = the real migrations on in-memory SQLite; R2 and tower are fakes; ZeptoMail is a stubbed fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { mailboxFor, authenticated, storeInbound, deweyCron, deweyEmail, sendDewey, deweyLetter, strangerNote, doorRule, readyGroups,
  deweyLive, liveNote, deweyRequests, requestDue, requestLetter, pauseRequestsPage, approveRequestsPage, approveUrl, requestPauseUrl } from '../../worker/mail/dewey.js';
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
function mime({ from = 'Ann Smith <ann@example.org>', to = 'dewey@siftersearch.com', cc = null, subject = 'Books', text = 'Portals to Freedom', id = `<m${Math.random()}@example.org>`, auth = CF_AUTH, attach = null, extra = [] } = {}) {
  const head = [auth, `From: ${from}`, `To: ${to}`, cc && `Cc: ${cc}`, `Subject: ${subject}`, `Message-ID: ${id}`, 'MIME-Version: 1.0', ...extra].filter(Boolean);
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
const LATER = () => Date.now() + 4 * 60e3;   // past the 3-minute quiet window
/** A fake tower: screen decision per call, process → running, then done with `result`. */
function towerFake({ decision = { action: 'process', reason: 'screen: contribution' }, screen = { kind: 'contribution', legitimacy: 'legit', reason: 'contribution · legit', needs_response: true }, result = null } = {}) {
  const calls = [];
  const call = vi.fn(async (e, path, body) => {
    calls.push({ path, body });
    if (path === '/screen') return { contributor: decision.action !== 'stranger-note', screen, usd: 0.00004, decision: typeof decision === 'function' ? decision(body) : decision };
    if (path === '/process') return { status: 'running' };
    if (path.startsWith('/process/job/')) return { status: 'done', result: result || { contributor: true, reply: 'Dear Ann,\n\nThank you for writing.\n\n**Received: *X***\n\nWith thanks,', usd: 0.0123, models: ['gemini'], results: [], unread: [], refused: [] } };
    throw new Error(`unexpected ${path}`);
  });
  return { call, calls };
}

describe('routing and the authentication gate', () => {
  it('only dewey@siftersearch.com (and dewey+tag@) is Dewey', () => {
    expect(mailboxFor('Dewey+books@SifterSearch.com')).toBe('dewey');
    expect(mailboxFor('anis@siftersearch.com')).toBeNull();
  });
  it('email(): another address is refused at SMTP time; Dewey\'s is stored', async () => {
    const reject = vi.fn();
    expect(await deweyEmail({ to: 'info@siftersearch.com', from: 'a@b.c', rawSize: 10, setReject: reject }, env)).toEqual({ rejected: 'recipient' });
    const raw = mime();
    expect(await deweyEmail({ to: 'dewey@siftersearch.com', from: 'ann@example.org', rawSize: raw.length, raw: new Response(raw).body, setReject: reject }, env)).toMatchObject({ status: 'new' });
  });
  it('trusts only Cloudflare\'s own topmost Authentication-Results', () => {
    expect(authenticated([{ key: 'authentication-results', value: 'mx.cloudflare.net; dmarc=pass header.from=example.org' }], 'ann@example.org')).toBe(true);
    expect(authenticated([{ key: 'authentication-results', value: 'mx.cloudflare.net; dmarc=fail' }, { key: 'authentication-results', value: 'mx.cloudflare.net; dmarc=pass' }], 'ann@example.org')).toBe(false);
    expect(authenticated([{ key: 'authentication-results', value: 'evil.example; dmarc=pass' }], 'ann@example.org')).toBe(false);
  });
});

describe('DOOR RULES — no reply, and no model call', () => {
  const door = async (o) => (await storeInbound(env, bytes(mime(o)))).status;
  it('auto-replies and out-of-office (headers and the usual phrasing)', async () => {
    expect(await door({ extra: ['Auto-Submitted: auto-replied'] })).toBe('auto');
    expect(await door({ extra: ['Precedence: auto_reply'] })).toBe('auto');
    expect(await door({ subject: 'Out of Office: Books', text: 'I am out of the office until Monday.' })).toBe('auto');
    expect(await door({ subject: 'Re: Books', text: 'Thank you for your email. I will be back on 3 November with limited access to email.' })).toBe('auto');
  });
  it('mailing lists, bounces, CCs, duplicates, unauthenticated mail', async () => {
    expect(await door({ extra: ['List-Id: <friends.example.org>'] })).toBe('list');
    expect(await door({ extra: ['Precedence: bulk'] })).toBe('list');
    expect(await door({ from: 'MAILER-DAEMON@example.org', subject: 'Undeliverable: Books' })).toBe('bounce');
    expect(await door({ to: 'friend@example.org', cc: 'dewey@siftersearch.com' })).toBe('cc');
    expect(await door({ text: 'Same letter twice', id: '<d1@x>' })).toBe('new');
    expect(await door({ text: 'Same letter twice', id: '<d2@x>' })).toBe('duplicate');
    expect(await door({ auth: '', text: 'An unsigned letter' })).toBe('unverified');
  });
  it('none of them reaches the screen (zero model cost), none gets a reply, none keeps an attachment', async () => {
    await storeInbound(env, bytes(mime({ extra: ['Auto-Submitted: auto-replied'], attach: { name: 'x.pdf', type: 'application/pdf', bytes: new Uint8Array(30000) } })));
    const t = towerFake();
    await deweyCron(env, { call: t.call });
    expect(t.call).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    expect(env.MEDIA_BUCKET.m.size).toBe(0);
  });
  it('pure rule: a letter addressed to Dewey is not a CC', () => {
    expect(doorRule({ to: [{ address: 'dewey@siftersearch.com' }], cc: [{ address: 'x@y.z' }], headers: [] }, { from: 'a@b.c' })).toBeNull();
  });
});

describe('the SCREEN\'s decisions at the edge', () => {
  it('phishing → quarantined: no processing, no reply', async () => {
    await storeInbound(env, bytes(mime({ subject: 'Verify your account', text: 'Click here to confirm your password' })));
    const t = towerFake({ decision: { action: 'quarantine', reason: 'screen: phishing' } });
    await deweyCron(env, { call: t.call, now: LATER() });
    expect(t.calls.map((c) => c.path)).toEqual(['/screen']);
    expect(rows(`SELECT status, error FROM mail_messages`)).toEqual([{ status: 'quarantined', error: 'screen: phishing' }]);
    expect(sent).toHaveLength(0);
  });
  it('unsure → held for Chad; a thanks → silent', async () => {
    await storeInbound(env, bytes(mime({ text: 'hmm' })));
    await deweyCron(env, { call: towerFake({ decision: { action: 'hold', reason: 'screen unsure — held for Chad' } }).call });
    await storeInbound(env, bytes(mime({ text: 'thanks!' })));
    await deweyCron(env, { call: towerFake({ decision: { action: 'silent', reason: 'screen: no response needed (ack)' } }).call, now: LATER() });
    expect(rows(`SELECT status FROM mail_messages ORDER BY id`).map((r) => r.status)).toEqual(['held', 'silent']);
    expect(sent).toHaveLength(0);
  });
  it('the screen gets the attachment names and whether Dewey already answered the thread; its verdict and cost ride on the row', async () => {
    const r = await storeInbound(env, bytes(mime({ attach: { name: 'book.pdf', type: 'application/pdf', bytes: new Uint8Array(30000) } })));
    const t = towerFake();
    await deweyCron(env, { call: t.call });
    expect(t.calls[0].body).toMatchObject({ from: 'ann@example.org', attachments: [{ name: 'book.pdf', type: 'application/pdf', size: 30000 }], threadAnswered: false });
    expect(t.calls[0].body.attachments[0].data).toBeUndefined();                 // the screen never gets the file itself
    expect(JSON.parse(rows('SELECT meta_json FROM mail_messages WHERE id = ?', r.id)[0].meta_json)).toMatchObject({ screen_usd: 0.00004, decision: { action: 'process' } });
  });
  it('a stranger gets ONE how-to-contribute note; nothing is processed', async () => {
    const t = towerFake({ decision: { action: 'stranger-note', reason: 'not a contributor' } });
    await storeInbound(env, bytes(mime({ text: 'Do you have Paris Talks?' })));
    await deweyCron(env, { call: t.call });
    await storeInbound(env, bytes(mime({ text: 'And The Hidden Words?' })));
    await deweyCron(env, { call: t.call });
    expect(t.calls.map((c) => c.path)).toEqual(['/screen', '/screen']);
    expect(sent).toHaveLength(1);
    expect(sent[0].body.textbody).toMatch(/not on my list of contributors/);
  });
  it('a contributor over the daily cap is stored, not processed', async () => {
    await env.ANIS_DB.prepare(`UPDATE mail_settings SET value = '1' WHERE key = 'dewey_per_sender_daily'`).run();
    env.ANIS_DB.raw.prepare(`INSERT INTO mail_messages (mailbox, direction, status, from_addr) VALUES ('dewey', 'in', 'answered', 'ann@example.org')`).run();
    await storeInbound(env, bytes(mime()));
    const t = towerFake();
    await deweyCron(env, { call: t.call, now: LATER() });
    expect(rows(`SELECT status FROM mail_messages ORDER BY id DESC LIMIT 1`)[0].status).toBe('capped');
    expect(t.calls.map((c) => c.path)).toEqual(['/screen']);
  });
});

describe('DEBOUNCE — letters in pieces get ONE reply', () => {
  it('pure: a group waits while the sender is still writing; goes when quiet (or after 10 minutes)', () => {
    const t0 = Date.parse('2026-10-23T10:00:00Z');
    const at = (min) => new Date(t0 + min * 60e3).toISOString().slice(0, 19).replace('T', ' ');
    const g = [{ id: 1, from_addr: 'a', created_at: at(0) }, { id: 2, from_addr: 'a', created_at: at(2) }];
    expect(readyGroups(g, { now: t0 + 3 * 60e3 })).toHaveLength(0);                 // last letter 1 minute ago
    expect(readyGroups(g, { now: t0 + 5 * 60e3 })[0].map((r) => r.id)).toEqual([1, 2]);   // quiet for 3 minutes
    const busy = [0, 2, 4, 6, 8, 10].map((m, i) => ({ id: i + 1, from_addr: 'a', created_at: at(m) }));
    expect(readyGroups(busy, { now: t0 + 10.5 * 60e3 })).toHaveLength(1);          // never more than 10 minutes
  });
  it('ONE CONVERSATION per group: a separate question (another subject) gets its own reply in its own thread', () => {
    const t0 = Date.parse('2026-10-23T17:40:00Z');
    const at = (min) => new Date(t0 + min * 60e3).toISOString().slice(0, 19).replace('T', ' ');
    const rows = [{ id: 899, from_addr: 'c', subject: '[TEST] multi-work receipt', created_at: at(0.7) }, { id: 900, from_addr: 'c', subject: 'Do we have this talk already', created_at: at(2) },
      { id: 901, from_addr: 'c', subject: 'Re: Do we have this talk already', created_at: at(2.5) }];
    expect(readyGroups(rows, { now: t0 + 10 * 60e3 }).map((g) => g.map((r) => r.id))).toEqual([[899], [900, 901]]);
  });
  it('three letters with files → one job carrying all texts and files → one threaded receipt; all three answered', async () => {
    const pdf = (n) => ({ name: `part${n}.pdf`, type: 'application/pdf', bytes: new Uint8Array(20000 + n) });
    const ids = [];
    for (const n of [1, 2, 3]) ids.push((await storeInbound(env, bytes(mime({ subject: 'Bosch letters', text: `Part ${n}`, id: `<p${n}@example.org>`, attach: pdf(n) })))).id);
    const t = towerFake();
    await deweyCron(env, { call: t.call });                                     // screened; still inside the quiet window
    expect(t.calls.filter((c) => c.path === '/process')).toHaveLength(0);
    await deweyCron(env, { call: t.call, now: LATER() });                       // quiet → ONE job
    const jobs = t.calls.filter((c) => c.path === '/process');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].body).toMatchObject({ job: `dewey-mail-${ids[0]}`, text: 'Part 1\n\nPart 2\n\nPart 3' });
    expect(jobs[0].body.attachments.map((a) => a.name)).toEqual(['part1.pdf', 'part2.pdf', 'part3.pdf']);
    await deweyCron(env, { call: t.call, now: LATER() });                       // job done → the receipt
    expect(sent).toHaveLength(1);
    expect(sent[0].body.mime_headers).toEqual({ 'In-Reply-To': '<p3@example.org>', References: '<p1@example.org> <p3@example.org>' });
    expect(sent[0].body.attachments).toBeUndefined();
    expect(rows(`SELECT status FROM mail_messages WHERE direction = 'in' ORDER BY id`).map((r) => r.status)).toEqual(['answered', 'answered', 'answered']);
    expect(env.MEDIA_BUCKET.m.size).toBe(0);
    expect(JSON.parse(rows(`SELECT meta_json FROM mail_messages WHERE direction = 'out'`)[0].meta_json)).toMatchObject({ screen_usd: 0.00012, work_usd: 0.0123, letters: 3 });
  });
  it('the reply rules say silence (a thread already answered, nothing new) → no letter, the reason kept', async () => {
    await storeInbound(env, bytes(mime({ text: 'interesting' })));
    const t = towerFake({ result: { contributor: true, reply: null, silent: 'continues a thread Dewey already answered; nothing new', results: [] } });
    for (let i = 0; i < 3; i++) await deweyCron(env, { call: t.call, now: LATER() });
    expect(sent).toHaveLength(0);
    expect(rows(`SELECT status, error FROM mail_messages`)).toEqual([{ status: 'silent', error: 'continues a thread Dewey already answered; nothing new' }]);
  });
});

describe('"NOW LIVE" notes — batched per contributor per day', () => {
  const live = (items) => vi.fn(async () => ({ items }));
  it('one note per contributor (a table for several), never one email per book; nothing twice; one per day', async () => {
    const items = [1, 2, 3].map((i) => ({ id: i, title: `Book ${i}`, author: 'A', doc_id: 100 + i, email: 'ann@example.org' })).concat([{ id: 9, title: 'Solo', author: null, doc_id: 109, email: 'bob@example.org' }]);
    expect(await deweyLive(env, { call: live(items) })).toMatchObject({ notes: 2 });
    expect(sent).toHaveLength(2);
    const ann = sent.find((s) => s.body.to[0].email_address.address === 'ann@example.org').body;
    expect(ann.subject).toBe('3 of your works are now in the library');
    expect(ann.htmlbody).toMatch(/<table[\s\S]*Book 1[\s\S]*Book 3/);
    expect(sent.find((s) => s.body.to[0].email_address.address === 'bob@example.org').body.subject).toBe('Now in the library: Solo');
    // the same items again → nothing; a NEW item the same day → waits for tomorrow
    expect(await deweyLive(env, { call: live([...items, { id: 4, title: 'Book 4', doc_id: 104, email: 'ann@example.org' }]) })).toMatchObject({ notes: 0 });
    expect(sent).toHaveLength(2);
  });
  it('the note itself', () => {
    expect(liveNote('ann', [{ title: 'X', author: 'Y', doc_id: 5 }])).toMatch(/^Dear Ann,\n\nGood news — \*X\* by Y, which you sent us, is now in the library: \[read it here\]\(https:\/\/siftersearch\.com\/document\/5\)/);
  });
});

describe('BOOK REQUESTS — caps, approval, pause', () => {
  const picks = Array.from({ length: 6 }, (_, i) => ({ title: `Wanted ${i}`, author: 'W', why: 'on our wanted list' }));
  const reqTower = () => vi.fn(async (e, path) => {
    if (path.startsWith('/requests')) return { contributors: [{ email: 'ann@example.org', name: 'Ann', total: 22, recent: 6, picks }] };
    throw new Error(path);
  });
  it('the frequency rules', () => {
    expect(requestDue({})).toEqual({ ok: true });
    expect(requestDue({ daysSinceLast: 10 })).toMatchObject({ ok: false });
    expect(requestDue({ daysSinceLast: 22 })).toEqual({ ok: true });
    expect(requestDue({ paused: true })).toMatchObject({ ok: false, reason: 'paused requests' });
    expect(requestDue({ pendingDraft: true })).toMatchObject({ ok: false });
  });
  it('before Chad approves: a DRAFT (nothing sent); approval sends it and switches to automatic; a second request waits 21 days', async () => {
    const call = reqTower();
    expect((await deweyRequests(env, { call })).letters).toEqual([{ email: 'ann@example.org', id: expect.any(Number), status: 'draft' }]);
    expect(sent).toHaveLength(0);
    expect((await deweyRequests(env, { call })).letters[0].skipped).toMatch(/waiting for approval/);   // no pile-up of drafts
    const url = new URL(await approveUrl(env));
    expect((await approveRequestsPage(new Request(url), env)).status).toBe(200);
    await approveRequestsPage(new Request(url, { method: 'POST', body: new URLSearchParams({ action: 'approve' }) }), env);
    expect(sent).toHaveLength(1);
    const p = sent[0].body;
    expect(p.subject).toBe('A few books we are looking for');
    expect(p.htmlbody).toMatch(/<table[\s\S]*Wanted 0[\s\S]*mailto:dewey@siftersearch\.com\?subject=I%20have%3A%20Wanted%200[\s\S]*Pause book requests/);
    expect(p.mime_headers['List-Unsubscribe']).toMatch(/\/_mail\/dewey\/pause\?t=/);
    expect((await loadSettings(env.ANIS_DB)).dewey_requests_approved).toBe('on');
    expect((await deweyRequests(env, { call })).letters[0].skipped).toMatch(/last request 0 days ago/);
    expect(sent).toHaveLength(1);
  });
  it('the pause link (GET shows a button, POST pauses) is honoured', async () => {
    const url = new URL(await requestPauseUrl(env, 'ann@example.org'));
    expect(await (await pauseRequestsPage(new Request(url), env)).text()).toMatch(/Pause book requests/);
    expect(rows('SELECT count(*) n FROM dewey_request_stop')[0].n).toBe(0);         // a GET (mail scanners) changes nothing
    await pauseRequestsPage(new Request(url, { method: 'POST' }), env);
    expect((await deweyRequests(env, { call: reqTower() })).letters[0]).toEqual({ email: 'ann@example.org', skipped: 'paused requests' });
    expect(await (await pauseRequestsPage(new Request(`${url.origin}${url.pathname}?t=bad.bad`), env)).text()).toMatch(/not valid/);
  });
  it('the letter: a table with why and an "I have this" link per work', () => {
    const t = requestLetter('ann', { total: 22, recent: 6, picks: picks.slice(0, 2) });
    expect(t).toMatch(/^Dear Ann,\n\nYou are one of the library’s most generous contributors — 22 works so far, 6 in the last month/);
    expect(t).toContain('| Wanted 0 | W | on our wanted list | [I have this](mailto:dewey@siftersearch.com?subject=I%20have%3A%20Wanted%200) |');
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
    const body = { event_name: ['hardbounce'], event_message: [{ request_id: 'req-9', event_data: [{ details: [{ bounced_recipient: 'ann@example.org' }] }] }] };
    expect((await zeptoEvents(new Request('https://s/_mail/zepto/events?k=nope', { method: 'POST', body: JSON.stringify(body) }), env)).status).toBe(401);
    await zeptoEvents(new Request('https://s/_mail/zepto/events?k=wk', { method: 'POST', body: JSON.stringify(body) }), env);
    expect(rows('SELECT email, reason FROM mail_suppression')).toEqual([{ email: 'ann@example.org', reason: 'bounce' }]);
    expect(zeptoEventRows({ event_name: ['feedback_loop'], event_message: [{ email_info: { to: [{ email_address: { address: 'x@y.z' } }] } }] }).suppress).toEqual([{ email: 'x@y.z', reason: 'complaint' }]);
  });
  it('payload: threading, reply-to Dewey, extra headers', () => {
    const p = zeptoPayload({ from: 'dewey@siftersearch.com', fromName: 'Dewey', to: 'a@b.c', subject: 'Re: x', text: 't', inReplyTo: '<2@b.c>', references: '<1@b.c> <2@b.c>', headers: { 'List-Unsubscribe': '<u>' } });
    expect(p.mime_headers).toEqual({ 'List-Unsubscribe': '<u>', 'In-Reply-To': '<2@b.c>', References: '<1@b.c> <2@b.c>' });
    expect(p.reply_to).toEqual([{ address: 'dewey@siftersearch.com', name: 'Dewey' }]);
  });
  it('Dewey\'s letter: both parts, a real HTML table, his signature', () => {
    const { text, html } = deweyLetter('Dear Ann,\n\n| Title | Status |\n| --- | --- |\n| A | new |\n\nWith thanks,');
    expect(html).toMatch(/<table[^>]*>[\s\S]*<td[^>]*>A<\/td>/);
    expect(text).toMatch(/A  ·  new[\s\S]*— Dewey\nLibrarian · SifterSearch$/);
    expect(strangerNote('bob jones')).toMatch(/^Dear Bob,/);
  });
});

describe('the daily digest: a Dewey section — decisions, screen, costs, letters as sent', () => {
  it('silent / quarantined letters are listed with their reason; the screen line and the cost comparison show', async () => {
    const a = await storeInbound(env, bytes(mime({ text: 'Portals to Freedom', id: '<a1@x>' })));
    const b = await storeInbound(env, bytes(mime({ text: 'thanks!', id: '<b1@x>' })));
    env.ANIS_DB.raw.prepare(`UPDATE mail_messages SET status = 'answered', meta_json = ? WHERE id = ?`).run(JSON.stringify({ screen: { reason: 'contribution · legit (95%) · reply 90%' }, screen_usd: 0.00004 }), a.id);
    env.ANIS_DB.raw.prepare(`UPDATE mail_messages SET status = 'silent', error = 'screen: no response needed (ack)', meta_json = ? WHERE id = ?`).run(JSON.stringify({ screen: { reason: 'ack · legit (99%) · reply 4%' }, screen_usd: 0.00003 }), b.id);
    await sendDewey(env, { to: 'ann@example.org', subject: 'Re: Books', md: 'Dear Ann,\n\n**Not in the library yet: *Portals to Freedom***\n\nWith thanks,', inReplyTo: '<a1@x>', threadKey: '<a1@x>', meta: { type: 'dewey', screen_usd: 0.00004, work_usd: 0.0021 } });
    const settings = await loadSettings(env.ANIS_DB);
    const g = await gatherConversations(env, { until: new Date(Date.now() + 60000), settings, fetchTower: async () => null });
    const d = conversationDigest(g.conversations, { reviewer: 'chadananda@gmail.com', date: 'today' });
    expect(d.html).toMatch(/Dewey — contributor mail[\s\S]*screen \$0\.0001 · downstream work \$0\.0021/);
    expect(d.html).toMatch(/silent — screen: no response needed \(ack\)/);
    expect(d.html).toMatch(/screen: ack · legit \(99%\)/);
    expect(d.html).toMatch(/Dewey → &lt;a@example\.org&gt;/);
    expect(d.text).toMatch(/── DEWEY — contributor mail · screen \$0\.0001 · downstream \$0\.0021 ──/);
  });
  it('a held book request shows with the approve link', async () => {
    await sendDewey(env, { to: 'ann@example.org', subject: 'A few books we are looking for', md: 'Dear Ann,\n\nlist\n\nWith thanks,', kind: 'request', hold: 'awaiting Chad’s approval' });
    const g = await gatherConversations(env, { until: new Date(Date.now() + 60000), settings: await loadSettings(env.ANIS_DB), fetchTower: async () => null });
    expect(conversationDigest(g.conversations, { reviewer: 'c', date: 't' }).html).toMatch(/_mail\/dewey\/approve\?t=[a-f0-9]{32}[\s\S]*Approve the book-request template/);
  });
});

describe('book-request greeting', () => {
  it('uses the name they sign with, never a role word like "Admin"', async () => {
    const call = vi.fn(async () => ({ contributors: [{ email: 'chad@example.org', name: 'Admin', total: 20, recent: 6, picks: [{ title: 'A Work', author: 'B', why: 'wanted' }] }] }));
    await deweyRequests(env, { call });
    expect(rows(`SELECT text FROM mail_messages WHERE kind = 'request'`)[0].text).toMatch(/^Dear friend,/);
    env.ANIS_DB.raw.prepare(`DELETE FROM mail_messages`).run();
    env.ANIS_DB.raw.prepare(`INSERT INTO mail_messages (mailbox, direction, status, from_addr, from_name) VALUES ('dewey', 'in', 'answered', 'chad@example.org', 'Chad Jones')`).run();
    await deweyRequests(env, { call });
    expect(rows(`SELECT text FROM mail_messages WHERE kind = 'request'`)[0].text).toMatch(/^Dear Chad,/);
  });
});

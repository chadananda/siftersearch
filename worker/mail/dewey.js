// Dewey's mailbox, dewey@siftersearch.com (Chad 10-23: "Dewey communicate with contributors directly"). Inbound: Cloudflare Email
// Routing → this Worker's email() handler → D1 mail_messages (mailbox 'dewey') + attachments in R2 (MEDIA_BUCKET dewey-mail/…).
// Every minute (deweyCron, only while mail_settings dewey_mail = on): a CONTRIBUTOR's letter (tower: users.dewey_access) goes to
// tower as a job (/api/v1/dewey-mail/process — fixed verbs, api/lib/dewey/mail.js) and Dewey's reply goes straight back through
// ZeptoMail (zepto.js) in the same thread; a stranger gets one how-to-contribute note (≤ 1 per 30 days, capped per day); mail that
// is not authenticated (DKIM/SPF/DMARC) for its From domain, auto-replies and spam are stored, never answered. Caps per sender
// per day; suppressed addresses are never written to. Nothing Dewey sends carries attachments.
//   POST /_mail/dewey/inject  internal key: { raw: base64 MIME, to? } → stored as if it had arrived (end-to-end tests)
import PostalMime from 'postal-mime';
import { threadKey, ownText, inboundStatus, ignoredBy, loadSettings } from './index.js';
import { zeptoSend } from './zepto.js';
import { bodyHtml, wrapHtml, plainText } from './letter.js';
import { renderEmail } from '../../api/lib/mail-render.js';

export const DEWEY_ADDR = 'dewey@siftersearch.com';
export const DEWEY_NAME = 'Dewey';
const SIGN_TITLE = 'Librarian · SifterSearch';
const TOWER = 'https://api.siftersearch.com/api/v1/dewey-mail';
const MAX_RAW = 25 * 1024 * 1024;
const LOGO_BYTES = 15 * 1024;            // inline images smaller than this are signature logos, not photos of books
const lower = (s) => String(s || '').trim().toLowerCase();
const reSubject = (s) => (/^re:/i.test(s || '') ? s : `Re: ${s || 'your letter'}`);

/** Which of our mailboxes an envelope recipient is: 'dewey' (also dewey+anything@), else null. Pure. */
export function mailboxFor(rcpt) {
  const [local = '', domain = ''] = lower(rcpt).replace(/^.*<|>.*$/g, '').split('@');
  return domain === 'siftersearch.com' && local.split('+')[0] === 'dewey' ? 'dewey' : null;
}

/** Did the sender's domain vouch for this letter? Only the TOPMOST (Arc-)Authentication-Results stamped by Cloudflare's own
 *  receiving server counts — a sender can write any header lower down. Pass = DMARC pass, or DKIM pass aligned with the From
 *  domain. Pure. */
export function authenticated(headers = [], fromAddr = '', authserv = /(^|\s|;)(?:i=\d+;\s*)?mx\.cloudflare\.net\b/) {
  const domain = lower(fromAddr).split('@')[1] || '';
  if (!domain) return false;
  const h = headers.find((x) => /^(arc-)?authentication-results$/i.test(x.key));
  const res = lower(h?.value);
  if (!h || !authserv.test(res)) return false;
  if (/\bdmarc=pass\b/.test(res)) return true;
  for (const m of res.matchAll(/dkim=pass[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)/g)) if (m[1] === domain || domain.endsWith(`.${m[1]}`)) return true;
  return false;
}

/** Dewey's letter: Markdown body + his signature, both parts (the shared renderer). Pure. */
export function deweyLetter(md) {
  const body = String(md || '').replace(/\s+$/, '').replace(/\n+\s*[—–-]?\s*Dewey\s*$/i, '');
  const sigHtml = `<p style="margin:22px 0 2px;font-family:'Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif;font-style:italic;font-size:24px;color:#6b4f2a">— ${DEWEY_NAME}</p>`
    + `<p style="margin:0;font-size:12.5px;letter-spacing:.02em;color:#8f8a7e">${SIGN_TITLE} · <a href="https://siftersearch.com/dewey" style="color:#8f8a7e">siftersearch.com/dewey</a></p>`;
  return renderEmail({ text: `${plainText(body)}\n\n— ${DEWEY_NAME}\n${SIGN_TITLE}`, html: wrapHtml(`${bodyHtml(body)}${sigHtml}`) });
}

/** The note a stranger gets (once in a while): what Dewey is and how to become a contributor. Pure. */
export function strangerNote(name) {
  return `Dear ${name ? String(name).trim().split(/\s+/)[0] : 'friend'},

Thank you for writing to me. I am Dewey, the librarian for SifterSearch, and I work by email with the library’s contributors — people who help find and add books, documents and recordings.

Your address is not on my list of contributors, so I have not acted on your letter. If you would like to offer something to the library, you can do it here: https://siftersearch.com/contribute — and if you would like to work with me directly, say so there and we will be in touch.

With thanks,`;
}

const b64 = (buf) => {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const textOf = (mail) => mail.text || String(mail.html || '').replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

/** Store one inbound letter (raw MIME) → { id, status } | { ignored } | { duplicate }. Attachments → R2 + mail_attachments. */
export async function storeInbound(env, raw, { envelopeFrom = '', to = DEWEY_ADDR, trusted = false } = {}) {
  const db = env.ANIS_DB;
  const mail = await PostalMime.parse(raw);
  const from = lower(mail.from?.address || envelopeFrom);
  const { results: rules } = await db.prepare('SELECT pattern FROM mail_ignore').all();
  const rule = ignoredBy([from, envelopeFrom], rules.map((r) => r.pattern));
  if (rule) { await db.prepare(`UPDATE mail_ignore SET hits = hits + 1, last_hit = datetime('now') WHERE pattern = ?`).bind(rule).run(); return { ignored: rule }; }
  if (mail.messageId && await db.prepare(`SELECT 1 x FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND message_id = ?`).bind(mail.messageId).first()) return { duplicate: true };
  const text = textOf(mail);
  let status = inboundStatus({ headers: mail.headers, from, subject: mail.subject, text });
  const settings = await loadSettings(db);
  if (status === 'new' && !trusted && settings.dewey_require_auth !== 'off' && !authenticated(mail.headers, from)) status = 'unverified';
  const row = await db.prepare(`INSERT INTO mail_messages (mailbox, direction, status, message_id, in_reply_to, thread_key, from_addr, from_name, to_addr, subject, text, html)
    VALUES ('dewey', 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(status, mail.messageId ?? null, mail.inReplyTo ?? null, threadKey(mail), from, mail.from?.name || null,
    lower(to), mail.subject ?? '', text, mail.html ?? null).first();
  let n = 0;
  for (const a of mail.attachments || []) {
    const bytes = a.content instanceof ArrayBuffer ? new Uint8Array(a.content) : typeof a.content === 'string' ? new TextEncoder().encode(a.content) : a.content;
    const size = bytes?.byteLength ?? 0;
    const name = String(a.filename || `attachment-${n + 1}`).replace(/[/\\]/g, '_').slice(0, 200);
    const logo = /^image\//i.test(a.mimeType || '') && size < LOGO_BYTES;
    const key = logo || !env.MEDIA_BUCKET ? null : `dewey-mail/${row.id}/${n}-${name.replace(/[^\w.() -]/g, '_')}`;
    if (key) await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: a.mimeType || 'application/octet-stream' } });
    await db.prepare(`INSERT INTO mail_attachments (message_id, name, content_type, size, r2_key, status) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(row.id, name, a.mimeType || null, size, key, key ? 'stored' : 'skipped').run();
    n += 1;
  }
  return { id: row.id, status, attachments: n };
}

/** Cloudflare Email Routing → here (worker/index.js email()). Unknown recipients and oversize mail are refused at SMTP time. */
export async function deweyEmail(message, env, ctx) {
  if (!mailboxFor(message.to)) { message.setReject('No such mailbox here'); return { rejected: 'recipient' }; }
  if (message.rawSize > MAX_RAW) { message.setReject('Message too large (25 MB at most)'); return { rejected: 'size' }; }
  const r = await storeInbound(env, await new Response(message.raw).arrayBuffer(), { envelopeFrom: message.from, to: message.to });
  if (r.id && ctx) ctx.waitUntil(deweyCron(env).catch(() => {}));
  return r;
}

async function tower(env, path, body, fetchImpl = fetch) {
  const res = await fetchImpl(`${TOWER}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': env.S1_KEY },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (res.status === 404 && body === undefined) return { status: 'unknown' };
  if (!res.ok) throw new Error(`tower ${path.split('?')[0]} ${res.status}`);
  return res.json();
}

/** One letter from Dewey: stored first (the digest shows it exactly as sent), then sent through ZeptoMail unless the address is
 *  suppressed or over its daily cap. No ZeptoMail key yet → it stays a 'draft' with the reason. → the row's final status */
export async function sendDewey(env, { to, toName = null, subject, md, inReplyTo = null, threadKey: tk = null, kind = 'reply', meta = null }, { send = zeptoSend } = {}) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  const { text, html } = deweyLetter(md);
  const row = await db.prepare(`INSERT INTO mail_messages (mailbox, kind, direction, status, from_addr, to_addr, subject, text, html, in_reply_to, thread_key, meta_json)
    VALUES ('dewey', ?, 'out', 'draft', ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(kind, DEWEY_ADDR, lower(to), subject, md, html, inReplyTo, tk, meta ? JSON.stringify(meta) : null).first();
  const done = async (status, error = null, id = null) => {
    await db.prepare(`UPDATE mail_messages SET status = ?, error = ?, ses_message_id = ?, sent_at = CASE WHEN ? = 'sent' THEN datetime('now') END WHERE id = ?`).bind(status, error, id, status, row.id).run();
    return { id: row.id, status, error };
  };
  if (await db.prepare('SELECT 1 x FROM mail_suppression WHERE email = ?').bind(lower(to)).first()) return done('suppressed', 'address bounced or complained');
  const today = await db.prepare(`SELECT count(*) n FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND status = 'sent' AND to_addr = ? AND sent_at > datetime('now', '-1 day')`).bind(lower(to)).first();
  if ((today?.n ?? 0) >= Number(settings.dewey_per_sender_daily || 10)) return done('blocked', 'daily cap for this address');
  const r = await send(env, { from: DEWEY_ADDR, fromName: DEWEY_NAME, to: lower(to), toName, subject, text, html, inReplyTo, references: tk && tk !== inReplyTo ? `${tk} ${inReplyTo || ''}`.trim() : inReplyTo, reference: `dewey-${row.id}` });
  if (r.unconfigured) return done('draft', r.error);
  return r.error ? done('failed', String(r.error).slice(0, 300)) : done('sent', null, r.requestId);
}

const set = (db, id, status, error = null) => db.prepare('UPDATE mail_messages SET status = ?, error = ? WHERE id = ?').bind(status, error, id).run();

async function stranger(env, settings, m) {
  const db = env.ANIS_DB;
  const days = Number(settings.dewey_stranger_reply_days || 30);
  const recent = await db.prepare(`SELECT 1 x FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND kind = 'stranger' AND to_addr = ? AND created_at > datetime('now', ?)`)
    .bind(m.from_addr, `-${days} days`).first();
  const todayAll = await db.prepare(`SELECT count(*) n FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND kind = 'stranger' AND created_at > datetime('now', '-1 day')`).first();
  if (recent || (todayAll?.n ?? 0) >= Number(settings.dewey_stranger_daily_cap || 40)) return set(db, m.id, 'stranger', recent ? 'already told how to contribute' : 'stranger notes capped today');
  await set(db, m.id, 'stranger');
  return sendDewey(env, { to: m.from_addr, toName: m.from_name, subject: reSubject(m.subject), md: strangerNote(m.from_name), inReplyTo: m.message_id, threadKey: m.thread_key, kind: 'stranger' });
}

async function attachmentsOf(env, id) {
  const { results } = await env.ANIS_DB.prepare(`SELECT * FROM mail_attachments WHERE message_id = ? AND status = 'stored' ORDER BY id`).bind(id).all();
  const out = [];
  for (const a of results) {
    const obj = a.r2_key ? await env.MEDIA_BUCKET.get(a.r2_key) : null;
    if (obj) out.push({ name: a.name, type: a.content_type, size: a.size, data: b64(await obj.arrayBuffer()) });
  }
  return out;
}

/** One letter, one step: classify → start the tower job → (later ticks) poll → reply. */
export async function deweyStep(env, settings, m, { call = tower } = {}) {
  const db = env.ANIS_DB;
  const key = `dewey-mail-${m.id}`;
  if (m.status === 'new') {
    if (m.from_addr === DEWEY_ADDR || /^(no-?reply|mailer-daemon|postmaster)/i.test(m.from_addr)) return set(db, m.id, 'handled', 'nothing to answer');
    if (await db.prepare('SELECT 1 x FROM mail_suppression WHERE email = ?').bind(m.from_addr).first()) return set(db, m.id, 'handled', 'sender suppressed');
    const who = await call(env, `/contributor?email=${encodeURIComponent(m.from_addr)}`);
    if (!who.contributor) return stranger(env, settings, m);
    const n = await db.prepare(`SELECT count(*) n FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND from_addr = ? AND status IN ('working', 'answered')
      AND created_at > datetime('now', '-1 day')`).bind(m.from_addr).first();
    if ((n?.n ?? 0) >= Number(settings.dewey_per_sender_daily || 10)) return set(db, m.id, 'capped', 'over the daily limit for this contributor');
    const claim = await db.prepare(`UPDATE mail_messages SET status = 'working' WHERE id = ? AND status = 'new'`).bind(m.id).run();
    if (!claim.meta?.changes) return null;
    return call(env, '/process', { job: key, from: m.from_addr, name: m.from_name, subject: m.subject, text: ownText(m.text || ''), attachments: await attachmentsOf(env, m.id) });
  }
  const j = await call(env, `/process/job/${key}`);
  if (j.status === 'running') return null;
  if (j.status !== 'done') {
    const attempts = Number(/attempt (\d+)/.exec(m.error || '')?.[1] || 0);
    if (attempts >= 3) return set(db, m.id, 'failed', `dewey job ${j.status} after ${attempts} attempts: ${j.error || ''}`.slice(0, 300));
    await set(db, m.id, 'working', `attempt ${attempts + 1}${j.error ? `: ${j.error}` : ''}`.slice(0, 300));
    return call(env, '/process', { job: key, from: m.from_addr, name: m.from_name, subject: m.subject, text: ownText(m.text || ''), attachments: await attachmentsOf(env, m.id) });
  }
  const r = j.result || {};
  if (!r.contributor) return stranger(env, settings, m);
  const sent = await sendDewey(env, { to: m.from_addr, toName: m.from_name, subject: reSubject(m.subject), md: r.reply, inReplyTo: m.message_id, threadKey: m.thread_key, kind: 'reply',
    meta: { type: 'dewey', plan: r.plan, results: (r.results || []).map((x) => ({ verb: x.verb, source: x.source, verdict: x.verdict, item: x.item?.id ?? x.wanted?.id ?? null })), unread: (r.unread || []).length, refused: (r.refused || []).length } });
  await set(db, m.id, 'answered');
  // tower has the files (archived there when queued); the R2 copies go
  const { results: atts } = await db.prepare(`SELECT id, r2_key FROM mail_attachments WHERE message_id = ? AND r2_key IS NOT NULL`).bind(m.id).all();
  for (const a of atts) { await env.MEDIA_BUCKET?.delete(a.r2_key); await db.prepare(`UPDATE mail_attachments SET r2_key = NULL, status = 'delivered' WHERE id = ?`).bind(a.id).run(); }
  return sent;
}

/** Every minute (worker/mail/index.js mailCron) and right after a letter arrives: a few letters per tick. */
export async function deweyCron(env, { limit = 3, call } = {}) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  if (settings.dewey_mail !== 'on') return { off: true };
  const { results } = await db.prepare(`SELECT * FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND status IN ('new', 'working') ORDER BY id LIMIT ?`).bind(limit).all();
  for (const m of results) {
    try { await deweyStep(env, settings, m, call ? { call } : undefined); }
    catch (e) { await db.prepare('UPDATE mail_messages SET error = ? WHERE id = ?').bind(String(e.message).slice(0, 300), m.id).run(); }   // tower away: next tick
  }
  return { letters: results.length };
}

/** POST /_mail/dewey/inject (internal key) — a raw letter stored as if Email Routing had delivered it. */
export async function injectInbound(request, env) {
  if (!env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 });
  let b; try { b = await request.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  if (!b.raw) return Response.json({ error: 'raw (base64 MIME) required' }, { status: 400 });
  const to = b.to || DEWEY_ADDR;
  if (!mailboxFor(to)) return Response.json({ error: 'not a Dewey address' }, { status: 400 });
  const raw = Uint8Array.from(atob(b.raw), (c) => c.charCodeAt(0));
  // the internal key is the proof here (no SMTP hop stamped it); { trusted: false } tests the authentication gate itself
  return Response.json(await storeInbound(env, raw, { envelopeFrom: b.from || '', to, trusted: b.trusted !== false }));
}

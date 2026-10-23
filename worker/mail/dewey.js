// Dewey's mailbox, dewey@siftersearch.com (Chad 10-23: "Dewey communicate with contributors directly"). Inbound: Cloudflare Email
// Routing → this Worker's email() handler → D1 mail_messages (mailbox 'dewey') + attachments in R2 (MEDIA_BUCKET dewey-mail/…).
// The CHEAP-FIRST pipeline (Chad: "avoid expensive LLM processing where not required"):
//   1. DOOR RULES at storage, no model: bounces, auto-replies / out-of-office, list mail, CCs, duplicates, unauthenticated mail
//      are stored with their reason and never answered (doorRule).
//   2. SCREEN, every letter that passed, one cheap Jev call on tower (/screen): spam / abuse / phishing → quarantined; unsure →
//      held for Chad; no response needed → silent (a contribution is still processed — its receipt is owed). It only suppresses.
//   3. DEBOUNCE: a contributor's letters are answered once they have been quiet a few minutes (letters in pieces → ONE reply).
//   4. WORK on tower (/process — fixed verbs, templates; vision / OCR / holdings only here) → the reply rules decide: a receipt,
//      a status answer, a fix-this note, or a real question's answer — else silence with the reason in Chad's digest.
// Daily (dewey_daily_hour_utc): "now live" notes (one per contributor per day) and BOOK REQUESTS for prolific contributors
// (drafts for Chad until he approves the template; then automatic; ≤ 1 per 21 days; pause link honoured).
// Strangers get one how-to-contribute note per 30 days (capped per day); per-sender daily caps; suppressed addresses never
// written to; nothing Dewey sends carries attachments.
//   POST /_mail/dewey/inject   internal key: { raw: base64 MIME, to?, trusted? } → stored as if it had arrived (end-to-end tests)
//   GET|POST /_mail/dewey/pause    one-click "pause book requests" (signed)
//   GET|POST /_mail/dewey/approve  Chad's approval of the book-request template (signed; the digest links it)
import PostalMime from 'postal-mime';
import { threadKey, ownText, inboundStatus, ignoredBy, loadSettings } from './index.js';
import { zeptoSend } from './zepto.js';
import { bodyHtml, wrapHtml, plainText } from './letter.js';
import { renderEmail } from '../../api/lib/mail-render.js';
import { pauseToken, verifyPauseToken, emailHash } from './rules.js';

export const DEWEY_ADDR = 'dewey@siftersearch.com';
export const DEWEY_NAME = 'Dewey';
const SIGN_TITLE = 'Librarian · SifterSearch';
const SITE = 'https://siftersearch.com';
const TOWER = 'https://api.siftersearch.com/api/v1/dewey-mail';
const MAX_RAW = 25 * 1024 * 1024;
const LOGO_BYTES = 15 * 1024;            // inline images smaller than this are signature logos, not photos of books
const lower = (s) => String(s || '').trim().toLowerCase();
const reSubject = (s) => (/^re:/i.test(s || '') ? s : `Re: ${s || 'your letter'}`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const atMs = (s) => Date.parse(String(s || '').replace(' ', 'T') + (/[zZ+]/.test(String(s)) ? '' : 'Z'));
const json = (s) => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const first = (name) => { const w = String(name || '').trim().split(/\s+/)[0] || ''; return w ? w[0].toUpperCase() + w.slice(1) : 'friend'; };

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

// ── 1. DOOR RULES (certain; no model) ──
const OOO = /\b(out of (the )?office|on (annual |sick |parental |maternity )?(vacation|holiday|leave)|away (from (my|the) (desk|office|email))|limited access to (e-?mail|my email)|automatic reply|auto-?reply|i (will|shall) (be )?(back|return(ing)?) (on|in|after)|returning (on|after)|currently (away|travelling|traveling|out))\b/i;
/** Letters Dewey never answers, with the reason — or null. Pure. mail: postal-mime output. */
export function doorRule(mail, { from = '', to = DEWEY_ADDR } = {}) {
  const h = Object.fromEntries((mail.headers || []).map((x) => [lower(x.key), lower(x.value)]));
  const subject = String(mail.subject || ''), text = String(mail.text || '');
  if (/^(mailer-daemon|postmaster|bounce[s]?)@/i.test(from) || /multipart\/report/.test(h['content-type'] || '') || /^(undeliverable|delivery status notification|mail delivery (failed|subsystem)|returned mail)/i.test(subject)) return { status: 'bounce', reason: 'a bounce / delivery report' };
  if ((h['auto-submitted'] && h['auto-submitted'] !== 'no') || h['x-autoreply'] || h['x-autorespond'] || /auto_reply/.test(h.precedence || '')) return { status: 'auto', reason: 'auto-submitted' };
  if (OOO.test(subject) || (text.length < 800 && OOO.test(text))) return { status: 'auto', reason: 'out of office / auto-reply' };
  if (h['list-id'] || h['list-unsubscribe'] || h['list-post'] || /\b(bulk|list|junk)\b/.test(h.precedence || '')) return { status: 'list', reason: 'mailing-list / bulk mail' };
  const addrs = (xs) => (xs || []).map((x) => lower(x.address)).filter(Boolean);
  const toList = addrs(mail.to), ccList = addrs(mail.cc);
  const ours = (a) => mailboxFor(a) === 'dewey';
  if (!toList.some(ours) && (ccList.some(ours) || toList.length)) return { status: 'cc', reason: 'Dewey was copied, not addressed' };
  return null;
}

/** Dewey's letter: Markdown body + his signature (+ an optional footer line), both parts, the shared renderer. Pure. */
export function deweyLetter(md, { footer = null } = {}) {
  const body = String(md || '').replace(/\s+$/, '').replace(/\n+\s*[—–-]?\s*Dewey\s*$/i, '');
  const sigHtml = `<p style="margin:22px 0 2px;font-family:'Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif;font-style:italic;font-size:24px;color:#6b4f2a">— ${DEWEY_NAME}</p>`
    + `<p style="margin:0;font-size:12.5px;letter-spacing:.02em;color:#8f8a7e">${SIGN_TITLE} · <a href="${SITE}/dewey" style="color:#8f8a7e">siftersearch.com/dewey</a></p>`
    + (footer ? `<p style="margin:26px 0 0;font-size:12px;color:#8f8a7e"><a href="${esc(footer.url)}" style="color:#8f8a7e">${esc(footer.label)}</a></p>` : '');
  return renderEmail({ text: `${plainText(body)}\n\n— ${DEWEY_NAME}\n${SIGN_TITLE}${footer ? `\n\n—\n${footer.label}: ${footer.url}` : ''}`, html: wrapHtml(`${bodyHtml(body)}${sigHtml}`) });
}

/** The note a stranger gets (once in a while): what Dewey is and how to become a contributor. Pure. */
export const strangerNote = (name) => `Dear ${first(name)},

Thank you for writing to me. I am Dewey, the librarian for SifterSearch, and I work by email with the library’s contributors — people who help find and add books, documents and recordings.

Your address is not on my list of contributors, so I have not acted on your letter. If you would like to offer something to the library, you can do it here: ${SITE}/contribute — and if you would like to work with me directly, say so there and we will be in touch.

With thanks,`;

const b64 = (buf) => {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const textOf = (mail) => mail.text || String(mail.html || '').replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const hashOf = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');

/** Store one inbound letter (raw MIME) → { id, status } | { ignored } | { duplicate }. Door rules decide the status here. */
export async function storeInbound(env, raw, { envelopeFrom = '', to = DEWEY_ADDR, trusted = false } = {}) {
  const db = env.ANIS_DB;
  const mail = await PostalMime.parse(raw);
  const from = lower(mail.from?.address || envelopeFrom);
  const { results: rules } = await db.prepare('SELECT pattern FROM mail_ignore').all();
  const rule = ignoredBy([from, envelopeFrom], rules.map((r) => r.pattern));
  if (rule) { await db.prepare(`UPDATE mail_ignore SET hits = hits + 1, last_hit = datetime('now') WHERE pattern = ?`).bind(rule).run(); return { ignored: rule }; }
  if (mail.messageId && await db.prepare(`SELECT 1 x FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND message_id = ?`).bind(mail.messageId).first()) return { duplicate: true };
  const text = textOf(mail);
  const atts = (mail.attachments || []).map((a) => ({ a, bytes: a.content instanceof ArrayBuffer ? new Uint8Array(a.content) : typeof a.content === 'string' ? new TextEncoder().encode(a.content) : a.content }));
  const hash = await hashOf(`${from}|${String(mail.subject || '').replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '')}|${ownText(text).replace(/\s+/g, ' ')}|${atts.map((x) => `${x.a.filename}:${x.bytes?.byteLength}`).join(',')}`);
  let status = 'new', reason = null;
  const door = doorRule({ ...mail, text }, { from, to });
  const legacy = inboundStatus({ headers: mail.headers, from, subject: mail.subject, text });          // spam verdicts, unsubscribe words
  if (door) ({ status, reason } = door);
  else if (legacy === 'spam' || legacy === 'auto') { status = legacy; reason = 'auto / spam headers'; }
  else if (await db.prepare(`SELECT 1 x FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND from_addr = ? AND created_at > datetime('now', '-1 day') AND meta_json LIKE ?`)
    .bind(from, `%"hash":"${hash}"%`).first()) { status = 'duplicate'; reason = 'the same letter was sent again'; }
  else if (!trusted && (await loadSettings(db)).dewey_require_auth !== 'off' && !authenticated(mail.headers, from)) { status = 'unverified'; reason = 'the sender’s domain did not vouch for it (DKIM/DMARC)'; }
  const row = await db.prepare(`INSERT INTO mail_messages (mailbox, direction, status, message_id, in_reply_to, thread_key, from_addr, from_name, to_addr, subject, text, html, error, meta_json)
    VALUES ('dewey', 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(status, mail.messageId ?? null, mail.inReplyTo ?? null, threadKey(mail), from, mail.from?.name || null,
    lower(to), mail.subject ?? '', text, mail.html ?? null, reason, JSON.stringify({ hash })).first();
  let n = 0;
  for (const { a, bytes } of atts) {
    const size = bytes?.byteLength ?? 0;
    const name = String(a.filename || `attachment-${n + 1}`).replace(/[/\\]/g, '_').slice(0, 200);
    const keep = status === 'new' && !(/^image\//i.test(a.mimeType || '') && size < LOGO_BYTES) && env.MEDIA_BUCKET;   // nothing kept for mail never processed
    const key = keep ? `dewey-mail/${row.id}/${n}-${name.replace(/[^\w.() -]/g, '_')}` : null;
    if (key) await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: a.mimeType || 'application/octet-stream' } });
    await db.prepare(`INSERT INTO mail_attachments (message_id, name, content_type, size, r2_key, status) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(row.id, name, a.mimeType || null, size, key, key ? 'stored' : 'skipped').run();
    n += 1;
  }
  return { id: row.id, status, reason, attachments: n };
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

// ── sending ──
/** Send a stored Dewey letter (a draft row) unless suppressed / over the daily cap / no key. → { id, status, error } */
export async function deliverDewey(env, row, { send = zeptoSend } = {}) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  const meta = json(row.meta_json);
  const done = async (status, error = null, id = null) => {
    await db.prepare(`UPDATE mail_messages SET status = ?, error = ?, ses_message_id = ?, sent_at = CASE WHEN ? = 'sent' THEN datetime('now') END WHERE id = ?`).bind(status, error, id, status, row.id).run();
    return { id: row.id, status, error };
  };
  if (await db.prepare('SELECT 1 x FROM mail_suppression WHERE email = ?').bind(lower(row.to_addr)).first()) return done('suppressed', 'address bounced or complained');
  const today = await db.prepare(`SELECT count(*) n FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND status = 'sent' AND to_addr = ? AND sent_at > datetime('now', '-1 day')`).bind(lower(row.to_addr)).first();
  if ((today?.n ?? 0) >= Number(settings.dewey_per_sender_daily || 10)) return done('blocked', 'daily cap for this address');
  const { text, html } = deweyLetter(row.text, { footer: meta.footer || null });
  const tk = row.thread_key, irt = row.in_reply_to;
  const r = await send(env, { from: DEWEY_ADDR, fromName: DEWEY_NAME, to: lower(row.to_addr), toName: meta.toName || null, subject: row.subject, text, html, inReplyTo: irt,
    references: tk && tk !== irt ? `${tk} ${irt || ''}`.trim() : irt, reference: `dewey-${row.id}`, headers: meta.footer?.unsubscribe ? { 'List-Unsubscribe': `<${meta.footer.url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : null });
  if (r.unconfigured) return done('draft', r.error);
  return r.error ? done('failed', String(r.error).slice(0, 300)) : done('sent', null, r.requestId);
}

/** One letter from Dewey: stored first (the digest shows it exactly as the reader sees it), then sent — or, with hold, kept as a
 *  draft (book requests before Chad approves the template). → the row's final status */
export async function sendDewey(env, { to, toName = null, subject, md, inReplyTo = null, threadKey: tk = null, kind = 'reply', meta = null, footer = null, hold = null }, opts = {}) {
  const db = env.ANIS_DB;
  const m = { ...(meta || {}), ...(toName ? { toName } : {}), ...(footer ? { footer } : {}) };
  const { html } = deweyLetter(md, { footer });
  const row = await db.prepare(`INSERT INTO mail_messages (mailbox, kind, direction, status, from_addr, to_addr, subject, text, html, in_reply_to, thread_key, meta_json, error)
    VALUES ('dewey', ?, 'out', 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(kind, DEWEY_ADDR, lower(to), subject, md, html, inReplyTo, tk, JSON.stringify(m), hold).first();
  if (hold) return { id: row.id, status: 'draft', error: hold };
  return deliverDewey(env, row, opts);
}

const set = (db, id, status, error = null) => db.prepare('UPDATE mail_messages SET status = ?, error = ? WHERE id = ?').bind(status, error, id).run();
const setMeta = async (db, id, patch) => {
  const cur = await db.prepare('SELECT meta_json FROM mail_messages WHERE id = ?').bind(id).first();
  await db.prepare('UPDATE mail_messages SET meta_json = ? WHERE id = ?').bind(JSON.stringify({ ...json(cur?.meta_json), ...patch }), id).run();
};
const threadAnswered = async (db, tk) => !!(tk && await db.prepare(`SELECT 1 x FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND status = 'sent' AND thread_key = ?`).bind(tk).first());

async function stranger(env, settings, m) {
  const db = env.ANIS_DB;
  const days = Number(settings.dewey_stranger_reply_days || 30);
  const recent = await db.prepare(`SELECT 1 x FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND kind = 'stranger' AND to_addr = ? AND created_at > datetime('now', ?)`)
    .bind(m.from_addr, `-${days} days`).first();
  const todayAll = await db.prepare(`SELECT count(*) n FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND kind = 'stranger' AND created_at > datetime('now', '-1 day')`).first();
  if (recent || (todayAll?.n ?? 0) >= Number(settings.dewey_stranger_daily_cap || 40)) return set(db, m.id, 'stranger', recent ? 'already told how to contribute' : 'stranger notes capped today');
  await set(db, m.id, 'stranger', 'not a contributor — told how to contribute');
  return sendDewey(env, { to: m.from_addr, toName: m.from_name, subject: reSubject(m.subject), md: strangerNote(m.from_name), inReplyTo: m.message_id, threadKey: m.thread_key, kind: 'stranger' });
}

async function attachmentsOf(env, ids, withData = true) {
  const { results } = await env.ANIS_DB.prepare(`SELECT * FROM mail_attachments WHERE message_id IN (${ids.map(() => '?').join(',')}) AND status = 'stored' ORDER BY id`).bind(...ids).all();
  const out = [];
  for (const a of results) {
    if (!withData) { out.push({ name: a.name, type: a.content_type, size: a.size }); continue; }
    const obj = a.r2_key ? await env.MEDIA_BUCKET.get(a.r2_key) : null;
    if (obj) out.push({ name: a.name, type: a.content_type, size: a.size, data: b64(await obj.arrayBuffer()) });
  }
  return out;
}
async function dropAttachments(env, ids) {
  const { results } = await env.ANIS_DB.prepare(`SELECT id, r2_key FROM mail_attachments WHERE message_id IN (${ids.map(() => '?').join(',')}) AND r2_key IS NOT NULL`).bind(...ids).all();
  for (const a of results) { await env.MEDIA_BUCKET?.delete(a.r2_key); await env.ANIS_DB.prepare(`UPDATE mail_attachments SET r2_key = NULL, status = 'delivered' WHERE id = ?`).bind(a.id).run(); }
}

// ── 2. SCREEN one new letter (cheap; before anything costly) ──
export async function screenStep(env, settings, m, { call = tower } = {}) {
  const db = env.ANIS_DB;
  if (m.from_addr === DEWEY_ADDR || /^(no-?reply|do-?not-?reply)/i.test(m.from_addr)) return set(db, m.id, 'handled', 'nothing to answer');
  if (await db.prepare('SELECT 1 x FROM mail_suppression WHERE email = ?').bind(m.from_addr).first()) return set(db, m.id, 'handled', 'sender suppressed');
  const answered = await threadAnswered(db, m.thread_key);
  const s = await call(env, '/screen', { from: m.from_addr, subject: m.subject, text: ownText(m.text || ''), attachments: await attachmentsOf(env, [m.id], false), threadAnswered: answered, ref: m.id });
  const d = s.decision || { action: 'process', reason: 'no decision' };
  await setMeta(db, m.id, { screen: s.screen || null, screen_error: s.screen_error || null, screen_usd: s.usd ?? null, decision: d, threadAnswered: answered, contributor: !!s.contributor });
  if (d.action === 'quarantine') return set(db, m.id, 'quarantined', d.reason);
  if (d.action === 'hold') return set(db, m.id, 'held', d.reason);
  if (d.action === 'silent' || d.action === 'stranger-silent') return set(db, m.id, 'silent', d.reason);
  if (d.action === 'stranger-note') return stranger(env, settings, m);
  const n = await db.prepare(`SELECT count(*) n FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND from_addr = ? AND status IN ('queued', 'working', 'merged', 'answered', 'silent')
    AND created_at > datetime('now', '-1 day')`).bind(m.from_addr).first();
  if ((n?.n ?? 0) >= Number(settings.dewey_per_sender_daily || 10)) return set(db, m.id, 'capped', 'over the daily limit for this contributor');
  return set(db, m.id, 'queued', d.reason);
}

// ── 3. DEBOUNCE: a sender's queued letters → one job, once they have gone quiet. Pure decision. ──
export const conversationKey = (r) => `${r.from_addr}|${String(r.subject || '').replace(/^\s*((re|fwd?|fw|aw|sv)\s*:\s*)+/i, '').trim().toLowerCase()}`;
export function readyGroups(rows, { quietMin = 3, maxMin = 10, now = Date.now() } = {}) {
  // ONE CONVERSATION per group (10-23: Chad's "do we have this talk?" was merged into another letter of his and answered
  // under that letter's subject — invisible in his thread): same sender AND same subject (Re:/Fwd: aside)
  const by = new Map();
  for (const r of rows) by.set(conversationKey(r), [...(by.get(conversationKey(r)) || []), r]);
  const ready = [];
  for (const g of by.values()) {
    g.sort((a, b) => a.id - b.id);
    const newest = Math.max(...g.map((r) => atMs(r.created_at))), oldest = Math.min(...g.map((r) => atMs(r.created_at)));
    if (now - newest >= quietMin * 60e3 || now - oldest >= maxMin * 60e3) ready.push(g);
  }
  return ready;
}
async function startGroup(env, g, { call = tower } = {}) {
  const db = env.ANIS_DB;
  const lead = g[0], ids = g.map((r) => r.id);
  const claim = await db.prepare(`UPDATE mail_messages SET status = 'working' WHERE id = ? AND status = 'queued'`).bind(lead.id).run();
  if (!claim.meta?.changes) return null;
  for (const r of g.slice(1)) await set(db, r.id, 'merged', `answered with #${lead.id}`);
  await setMeta(db, lead.id, { group: ids });
  return call(env, '/process', jobBody(lead, g, await attachmentsOf(env, ids)));
}
const jobBody = (lead, g, attachments) => ({ job: `dewey-mail-${lead.id}`, from: lead.from_addr, name: lead.from_name, subject: g.map((r) => r.subject).find(Boolean) || '',
  text: g.map((r) => ownText(r.text || '')).filter(Boolean).join('\n\n'), attachments, threadAnswered: !!json(lead.meta_json).threadAnswered });

// ── 4. the finished job → the reply (or silence) ──
async function finishGroup(env, settings, lead, { call = tower } = {}) {
  const db = env.ANIS_DB;
  const meta = json(lead.meta_json);
  const ids = meta.group || [lead.id];
  const { results: g } = await db.prepare(`SELECT * FROM mail_messages WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all();
  const j = await call(env, `/process/job/dewey-mail-${lead.id}`);
  if (j.status === 'running') return null;
  if (j.status !== 'done') {
    const attempts = Number(/attempt (\d+)/.exec(lead.error || '')?.[1] || 0);
    if (attempts >= 3) return set(db, lead.id, 'failed', `dewey job ${j.status} after ${attempts} attempts: ${j.error || ''}`.slice(0, 300));
    await set(db, lead.id, 'working', `attempt ${attempts + 1}${j.error ? `: ${j.error}` : ''}`.slice(0, 300));
    return call(env, '/process', jobBody(lead, g, await attachmentsOf(env, ids)));
  }
  const r = j.result || {};
  if (!r.contributor) return stranger(env, settings, lead);
  const last = g[g.length - 1];
  const screenUsd = g.reduce((s, x) => s + (Number(json(x.meta_json).screen_usd) || 0), 0);
  const cost = { screen_usd: Math.round(screenUsd * 1e6) / 1e6, work_usd: r.usd ?? null };
  let sent = null;
  if (r.reply) {
    sent = await sendDewey(env, { to: lead.from_addr, toName: lead.from_name, subject: reSubject(lead.subject), md: r.reply, inReplyTo: last.message_id, threadKey: lead.thread_key, kind: 'reply',
      meta: { type: 'dewey', ...cost, models: r.models || [], letters: ids.length, plan: r.plan,
        results: (r.results || []).map((x) => ({ verb: x.verb, source: x.source, verdict: x.verdict, item: x.item?.id ?? x.wanted?.id ?? null })), unread: (r.unread || []).length, refused: (r.refused || []).length } });
  }
  for (const x of g) await set(db, x.id, r.reply ? 'answered' : 'silent', r.reply ? (x.id === lead.id ? null : `answered with #${lead.id}`) : r.silent);
  await setMeta(db, lead.id, cost);
  await dropAttachments(env, ids);     // tower has the files (archived there when queued); the R2 copies go
  return sent;
}

/** Every minute (worker/mail/index.js mailCron) and right after a letter arrives. */
export async function deweyCron(env, { limit = 5, call, now } = {}) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  if (settings.dewey_mail !== 'on') return { off: true };
  const opt = call ? { call } : undefined;
  const { results: fresh } = await db.prepare(`SELECT * FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND status = 'new' ORDER BY id LIMIT ?`).bind(limit).all();
  for (const m of fresh) {
    try { await screenStep(env, settings, m, opt); }
    catch (e) { await db.prepare('UPDATE mail_messages SET error = ? WHERE id = ?').bind(String(e.message).slice(0, 300), m.id).run(); }   // tower away: next tick
  }
  const { results: queued } = await db.prepare(`SELECT * FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND status = 'queued' ORDER BY id LIMIT 50`).all();
  const groups = readyGroups(queued, { quietMin: Number(settings.dewey_debounce_quiet_minutes ?? 3), maxMin: Number(settings.dewey_debounce_max_minutes ?? 10), now: now ?? Date.now() });
  for (const g of groups) {
    try { await startGroup(env, g, opt); }
    catch (e) { await db.prepare('UPDATE mail_messages SET status = ?, error = ? WHERE id = ?').bind('queued', String(e.message).slice(0, 300), g[0].id).run(); }
  }
  const { results: working } = await db.prepare(`SELECT * FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND status = 'working' ORDER BY id LIMIT ?`).bind(limit).all();
  for (const m of working) {
    try { await finishGroup(env, settings, m, opt); }
    catch (e) { await db.prepare('UPDATE mail_messages SET error = ? WHERE id = ?').bind(String(e.message).slice(0, 300), m.id).run(); }
  }
  return { screened: fresh.length, started: groups.length, working: working.length };
}

// ── daily: "now live" notes ──
/** The note for works that went live. Pure. */
export function liveNote(name, items) {
  const link = (i) => `${SITE}/document/${i.doc_id}`;
  const body = items.length === 1
    ? `Good news — ${`*${items[0].title}*`}${items[0].author ? ` by ${items[0].author}` : ''}, which you sent us, is now in the library: [read it here](${link(items[0])}).`
    : [`Good news — ${items.length} works you sent us are now in the library:`, '', '| Title | Author | Link |', '| --- | --- | --- |',
      ...items.map((i) => `| ${String(i.title).replace(/\|/g, '/')} | ${String(i.author || '—').replace(/\|/g, '/')} | [read it](${link(i)}) |`)].join('\n');
  return `Dear ${first(name)},\n\n${body}\n\nThank you for adding ${items.length === 1 ? 'it' : 'them'} to the collection.\n\nWith thanks,`;
}
export async function deweyLive(env, { call = tower } = {}) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  if (settings.dewey_live_enabled === 'off') return { off: true };
  const { items = [] } = await call(env, `/live?since=${encodeURIComponent(new Date(Date.now() - 3 * 864e5).toISOString())}`);
  const by = new Map();
  for (const i of items) {
    if (await db.prepare('SELECT 1 x FROM dewey_live WHERE item_id = ?').bind(i.id).first()) continue;
    by.set(i.email, [...(by.get(i.email) || []), i]);
  }
  let notes = 0;
  for (const [email, list] of by) {
    // one note per contributor per day: anything that went live since their last note waits for tomorrow's
    if (await db.prepare(`SELECT 1 x FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND kind = 'live' AND to_addr = ? AND created_at > datetime('now', '-20 hours')`).bind(email).first()) continue;
    const name = (await db.prepare(`SELECT from_name FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND from_addr = ? AND from_name IS NOT NULL ORDER BY id DESC LIMIT 1`).bind(email).first())?.from_name || null;
    const r = await sendDewey(env, { to: email, toName: name, subject: list.length === 1 ? `Now in the library: ${list[0].title}` : `${list.length} of your works are now in the library`, md: liveNote(name, list), kind: 'live', meta: { type: 'now live', items: list.map((i) => i.id) } });
    for (const i of list) await db.prepare('INSERT OR IGNORE INTO dewey_live (item_id, email, doc_id, letter_id) VALUES (?, ?, ?, ?)').bind(i.id, email, i.doc_id ?? null, r.id).run();
    notes += 1;
  }
  return { notes, items: items.length };
}

// ── daily: BOOK REQUESTS for prolific contributors ──
const requestSecret = (env) => `${env.MAIL_LINK_SECRET}|dewey-requests`;
export const requestPauseUrl = async (env, addr) => `${SITE}/_mail/dewey/pause?t=${await pauseToken(lower(addr), requestSecret(env))}`;
/** The request letter: 5–10 works as a table with an "I have this" reply link each. Pure. */
export function requestLetter(name, { total = 0, recent = 0, picks = [] }) {
  const have = (p) => `mailto:${DEWEY_ADDR}?subject=${encodeURIComponent(`I have: ${p.title}`)}`;
  return `Dear ${first(name)},

You are one of the library’s most generous contributors — ${total} work${total === 1 ? '' : 's'} so far${recent ? `, ${recent} in the last month` : ''}. Thank you.

Here are works we are still looking for that seem close to what you have sent us. If you have any of them, tap “I have this” (or simply reply with the file attached) and I will take it from there.

| Title | Author | Why we want it | |
| --- | --- | --- | --- |
${picks.map((p) => `| ${String(p.title).replace(/\|/g, '/')} | ${String(p.author || '—').replace(/\|/g, '/')} | ${String(p.why).replace(/\|/g, '/')} | [I have this](${have(p)}) |`).join('\n')}

No need to reply otherwise.

With thanks,`;
}
/** Is a book request due for this address? Pure facts → { ok, reason }. */
export function requestDue({ paused = false, suppressed = false, daysSinceLast = Infinity, pendingDraft = false }, { gapDays = 21 } = {}) {
  if (paused) return { ok: false, reason: 'paused requests' };
  if (suppressed) return { ok: false, reason: 'suppressed' };
  if (pendingDraft) return { ok: false, reason: 'a request is already waiting for approval' };
  if (daysSinceLast < gapDays) return { ok: false, reason: `last request ${Math.floor(daysSinceLast)} days ago` };
  return { ok: true };
}
export async function deweyRequests(env, { call = tower } = {}) {
  const db = env.ANIS_DB;
  const s = await loadSettings(db);
  if (s.dewey_requests_enabled === 'off') return { off: true };
  const q = new URLSearchParams({ recent_days: s.dewey_prolific_recent_days ?? 30, recent_min: s.dewey_prolific_recent_min ?? 5, total_min: s.dewey_prolific_total_min ?? 15, idle_days: s.dewey_request_idle_days ?? 90 });
  const { contributors = [] } = await call(env, `/requests?${q}`);
  const out = [];
  for (const c of contributors) {
    const addr = lower(c.email);
    const last = await db.prepare(`SELECT julianday('now') - julianday(max(coalesce(sent_at, created_at))) d FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND kind = 'request' AND to_addr = ? AND status = 'sent'`).bind(addr).first();
    const due = requestDue({
      paused: !!(await db.prepare('SELECT 1 x FROM dewey_request_stop WHERE email_hash = ?').bind(await emailHash(addr)).first()),
      suppressed: !!(await db.prepare('SELECT 1 x FROM mail_suppression WHERE email = ?').bind(addr).first()),
      daysSinceLast: last?.d == null ? Infinity : last.d,
      pendingDraft: !!(await db.prepare(`SELECT 1 x FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND kind = 'request' AND to_addr = ? AND status = 'draft'`).bind(addr).first()),
    }, { gapDays: Number(s.dewey_request_gap_days ?? 21) });
    if (!due.ok) { out.push({ email: addr, skipped: due.reason }); continue; }
    const picks = (c.picks || []).slice(0, 10);
    // the name they sign with (their letters to Dewey), else the account's — never a role word like "Admin"
    const signed = (await db.prepare(`SELECT from_name FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'in' AND from_addr = ? AND from_name IS NOT NULL ORDER BY id DESC LIMIT 1`).bind(addr).first())?.from_name;
    const name = signed || (/^(admin(istrator)?|user|test|member|librarian)\b/i.test(c.name || '') ? null : c.name);
    const r = await sendDewey(env, { to: addr, toName: name, subject: 'A few books we are looking for', md: requestLetter(name, { total: c.total, recent: c.recent, picks }), kind: 'request',
      meta: { type: 'book request', picks: picks.length }, footer: { label: 'Pause book requests', url: await requestPauseUrl(env, addr), unsubscribe: true },
      hold: s.dewey_requests_approved === 'on' ? null : 'awaiting Chad’s approval of the book-request template' });
    out.push({ email: addr, id: r.id, status: r.status });
  }
  return { contributors: contributors.length, letters: out };
}

/** Once a day at dewey_daily_hour_utc (the hourly cron): "now live" notes, then book requests. */
export async function deweyDaily(env, { hour = new Date().getUTCHours(), call } = {}) {
  const s = await loadSettings(env.ANIS_DB);
  if (s.dewey_mail !== 'on' || hour !== Number(s.dewey_daily_hour_utc ?? 13)) return { skipped: true };
  const opt = call ? { call } : undefined;
  return { live: await deweyLive(env, opt).catch((e) => ({ error: e.message })), requests: await deweyRequests(env, opt).catch((e) => ({ error: e.message })) };
}

// ── pages: pause requests, approve the request template ──
const page = (body) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Dewey</title>
<body style="font:16px/1.6 Georgia,serif;max-width:40em;margin:3em auto;padding:0 1em;color:#2b2621;background:#faf8f3">${body}</body>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
export async function pauseRequestsPage(request, env) {
  const url = new URL(request.url);
  let t = url.searchParams.get('t');
  if (request.method === 'POST' && !t) { try { t = (await request.formData()).get('t'); } catch { /* none */ } }
  const h = await verifyPauseToken(t, requestSecret(env));
  if (!h) return page('<h1>This link is not valid</h1><p>It may have been copied incompletely.</p>');
  if (request.method === 'GET') return page(`<h1>Pause book requests from Dewey?</h1><p>Dewey will stop sending you lists of books we are looking for. Everything else — receipts for what you send — carries on.</p>
<form method="post"><input type="hidden" name="t" value="${esc(t)}"><button style="font:inherit;padding:.5em 1.2em">Pause book requests</button></form>`);
  await env.ANIS_DB.prepare('INSERT OR IGNORE INTO dewey_request_stop (email_hash) VALUES (?)').bind(h).run();
  return page('<h1>Done</h1><p>Dewey will not send you book requests again. Thank you for all you have contributed.</p>');
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function approveSig(secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('dewey-approve-requests'))).slice(0, 32);
}
export const approveUrl = async (env) => `${SITE}/_mail/dewey/approve?t=${await approveSig(env.MAIL_LINK_SECRET)}`;
export async function approveRequestsPage(request, env) {
  const url = new URL(request.url);
  let t = url.searchParams.get('t');
  if (request.method === 'POST' && !t) { try { t = (await request.formData()).get('t'); } catch { /* none */ } }
  if (!t || t !== await approveSig(env.MAIL_LINK_SECRET)) return page('<h1>This link is not valid</h1>');
  const db = env.ANIS_DB;
  const { results: drafts } = await db.prepare(`SELECT * FROM mail_messages WHERE mailbox = 'dewey' AND direction = 'out' AND kind = 'request' AND status = 'draft' ORDER BY id`).all();
  const s = await loadSettings(db);
  if (request.method === 'GET') {
    const sample = drafts[0];
    const embed = sample ? String(sample.html || '').replace(/^[\s\S]*?<div class="em-body"[^>]*>|<\/div>\s*<\/body>[\s\S]*$/g, '') : '';
    return page(`<h1>Dewey’s book requests</h1><p>Automatic sending is <b>${s.dewey_requests_approved === 'on' ? 'ON' : 'OFF (waiting for your approval)'}</b>. ${drafts.length} request${drafts.length === 1 ? '' : 's'} waiting.</p>
${sample ? `<p style="color:#7a7266">The first one, as it will look (to ${esc(sample.to_addr)}):</p><div style="border:1px solid #e4ddcf;border-radius:8px;padding:16px;background:#fff">${embed}</div>` : ''}
<form method="post"><input type="hidden" name="t" value="${esc(t)}"><p><button name="action" value="approve" style="font:inherit;padding:.5em 1.2em">Approve the template — send these and future requests automatically</button></p>
<p><button name="action" value="off" style="font:inherit;padding:.4em 1em">Turn automatic sending off</button></p></form>`);
  }
  let action = 'approve'; try { action = (await request.clone().formData()).get('action') || 'approve'; } catch { /* default */ }
  if (action === 'off') {
    await db.prepare(`UPDATE mail_settings SET value = 'off', updated_at = datetime('now') WHERE key = 'dewey_requests_approved'`).run();
    return page('<h1>Off</h1><p>Book requests will wait for your approval again.</p>');
  }
  await db.prepare(`UPDATE mail_settings SET value = 'on', updated_at = datetime('now') WHERE key = 'dewey_requests_approved'`).run();
  const sent = [];
  for (const d of drafts) sent.push((await deliverDewey(env, { ...d, error: null })).status);
  return page(`<h1>Approved</h1><p>${sent.filter((x) => x === 'sent').length} of ${drafts.length} waiting request${drafts.length === 1 ? '' : 's'} sent; future requests go automatically (at most one per contributor every three weeks).</p>`);
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


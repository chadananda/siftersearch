// Anís mail at the edge: anis@oceanlibrary.com through Amazon SES (us-west-2), state in D1 (env.ANIS_DB).
//   POST /_mail/ses/inbound  SNS → raw MIME from S3 → mail_messages (direction in; mailbox anis, or newsletter = replies to m.oceanlibrary.com)
//   POST /_mail/ses/events   SNS → mail_events; hard bounce / complaint → mail_suppression
//   POST /_mail/send         internal key; sends a draft ({id}) or a message ({to, subject, text, html?, inReplyTo?, kind?})
//                            — every letter passes the engagement rules (rules.js) first; refused → status 'blocked'
//   GET  /_mail/messages     internal key; ?mailbox=anis|newsletter &status=&direction=&limit=
//   GET|POST /_mail/pause    footer / List-Unsubscribe one-click: stops all outreach to that address (no login)
//   GET|POST /_mail/review   Chad's signed review page for one draft: edit, send or discard (drafting.js)
//   cron → mailCron          drafting, outreach planning, daily digest (drafting.js); POST /_mail/run?job=draft|outreach|welcome|digest runs one now
// Nothing is sent without an explicit /_mail/send call (Chad approves Anís's replies). Deps: aws4fetch, postal-mime.
/* global btoa */
import { AwsClient } from 'aws4fetch';
import PostalMime from 'postal-mime';
import { verifySns, isAmazonUrl } from './sns.js';
import { composeLetter } from './letter.js';
import { sendDecision, settingsFrom, pauseToken, verifyPauseToken, emailHash } from './rules.js';
import { reviewPage, draftReplies, planOutreach, planWelcomes, dailyDigest } from './drafting.js';

const REGION = 'us-west-2';
const ACCOUNT = '409305238362';
const TOPIC_INBOUND = `arn:aws:sns:${REGION}:${ACCOUNT}:ses-anis-inbound`;
const TOPIC_EVENTS = `arn:aws:sns:${REGION}:${ACCOUNT}:ses-anis-events`;
const FROM_ADDR = 'anis@oceanlibrary.com';
const FROM_NAME = 'Anís — Ocean AI Research Assistant';
const CONFIG_SET = 'anis';
const SITE = 'https://siftersearch.com';

const json = (body, status = 200) => Response.json(body, { status });
const aws = (env, service) => new AwsClient({ accessKeyId: env.AWS_SES_ACCESS_KEY_ID, secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY, service, region: REGION });
const internal = (request, env) => env.S1_KEY && request.headers.get('x-internal-key') === env.S1_KEY;
const lower = (s) => String(s || '').trim().toLowerCase();

/** RFC 2047 encoded-word for a non-ASCII display name. */
export function mimeName(name, addr) {
  const ascii = /^[\x20-\x7e]*$/.test(name);
  const enc = ascii ? `"${name.replace(/"/g, '')}"` : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(name)))}?=`;
  return `${enc} <${addr}>`;
}

/** The thread a message belongs to: its first References id, else In-Reply-To, else its own Message-ID. */
export function threadKey({ references, inReplyTo, messageId }) {
  const first = String(references || '').match(/<[^>]+>/)?.[0];
  return first || (String(inReplyTo || '').match(/<[^>]+>/)?.[0]) || messageId || null;
}

/** SES event notification → rows: one mail_events row per recipient, plus suppressions. */
export function eventRows(ev) {
  const type = ev.eventType || ev.notificationType;
  const sesId = ev.mail?.messageId ?? null;
  const detail = ev[{ Bounce: 'bounce', Complaint: 'complaint', Delivery: 'delivery', Open: 'open', Click: 'click', Reject: 'reject', DeliveryDelay: 'deliveryDelay', 'Rendering Failure': 'failure', Send: 'send' }[type]] ?? null;
  let recipients = ev.mail?.destination || [null];
  if (type === 'Bounce') recipients = (ev.bounce?.bouncedRecipients || []).map((r) => r.emailAddress);
  if (type === 'Complaint') recipients = (ev.complaint?.complainedRecipients || []).map((r) => r.emailAddress);
  const suppress = [];
  if (type === 'Bounce' && ev.bounce?.bounceType === 'Permanent') suppress.push(...recipients.map((e) => ({ email: lower(e), reason: 'bounce' })));
  if (type === 'Complaint') suppress.push(...recipients.map((e) => ({ email: lower(e), reason: 'complaint' })));
  return { type: type === 'Rendering Failure' ? 'RenderingFailure' : type, sesId, detail, recipients: recipients.length ? recipients : [null], suppress };
}

const AUTO_SUBJECT = /^\s*(auto(matic)?[ -]?(reply|response)|out of (the )?office|away from|abwesenheit|absence|r[ée]ponse automatique|respuesta autom[áa]tica|undeliverable|delivery status notification|mail delivery failed)/i;
const UNSUBSCRIBE = /\b(unsubscribe|remove me|take me off|stop (sending|emailing)|no more emails|d[ée]sabonner|darse de baja|abmelden)\b/i;

/** The ignore rule (a domain — also its subdomains — or a full address) any sender matches, else null.
 *  Senders may be bare addresses or "Name <addr>" headers. */
export function ignoredBy(senders, patterns) {
  for (const s of senders) {
    const addr = lower(String(s || '').match(/<([^>]+)>/)?.[1] ?? s);
    const domain = addr.split('@')[1] || '';
    for (const p of patterns.map(lower)) {
      if (p.includes('@') ? addr === p : domain === p || domain.endsWith(`.${p}`)) return p;
    }
  }
  return null;
}

/** The reader's own words: quoted history (">" lines, "On … wrote:" and below) removed. */
export function ownText(text = '') {
  const cut = String(text).split(/\n(?:On .{0,200}wrote:|-{2,} ?Original Message|From: .+\nSent: )/i)[0];
  return cut.split('\n').filter((l) => !l.startsWith('>')).join('\n').trim();
}

/** Inbound status: spam | auto (auto-responders, bounces) | unsubscribe (asks to be removed) | new. */
export function inboundStatus({ spam, virus, headers = [], from = '', subject = '', text = '' }) {
  if (spam === 'FAIL' || virus === 'FAIL') return 'spam';
  const h = Object.fromEntries(headers.map((x) => [String(x.key).toLowerCase(), String(x.value).toLowerCase()]));
  if ((h['auto-submitted'] && h['auto-submitted'] !== 'no') || h['x-autoreply'] || h['x-autorespond'] || /auto_reply|junk/.test(h.precedence || '')
    || /^(mailer-daemon|postmaster)@/i.test(from) || AUTO_SUBJECT.test(subject)) return 'auto';
  const own = ownText(text);
  if (own.length < 400 && (UNSUBSCRIBE.test(own) || UNSUBSCRIBE.test(subject))) return 'unsubscribe';
  return 'new';
}

async function readSns(request, topic) {
  let m; try { m = await request.json(); } catch { return { error: json({ error: 'bad json' }, 400) }; }
  if (!(await verifySns(m, new Set([topic])))) return { error: json({ error: 'unverified' }, 403) };
  if (m.Type === 'SubscriptionConfirmation') {
    if (isAmazonUrl(m.SubscribeURL)) await fetch(m.SubscribeURL);
    return { error: json({ confirmed: true }) };
  }
  if (m.Type !== 'Notification') return { error: json({ ignored: m.Type }) };
  let body; try { body = JSON.parse(m.Message); } catch { return { error: json({ error: 'bad message' }, 400) }; }
  return { m, body };
}

async function inbound(request, env) {
  const { error, body } = await readSns(request, TOPIC_INBOUND);
  if (error) return error;
  const act = body.receipt?.action;
  if (act?.type !== 'S3' || !act.objectKey) return json({ ignored: body.notificationType || 'no s3 action' });
  const senders = [body.mail?.source, ...(body.mail?.commonHeaders?.from || [])];
  const { results: rules } = await env.ANIS_DB.prepare('SELECT pattern FROM mail_ignore').all();
  const rule = ignoredBy(senders, rules.map((r) => r.pattern));
  if (rule) {                                                                 // dropped unread: nothing fetched or stored
    await env.ANIS_DB.prepare(`UPDATE mail_ignore SET hits = hits + 1, last_hit = datetime('now') WHERE pattern = ?`).bind(rule).run();
    return json({ ignored: rule });
  }
  const res = await aws(env, 's3').fetch(`https://${act.bucketName}.s3.${REGION}.amazonaws.com/${encodeURIComponent(act.objectKey).replace(/%2F/g, '/')}`);
  if (!res.ok) return json({ error: `s3 ${res.status}` }, 502);              // SNS retries on 5xx
  const mail = await PostalMime.parse(await res.arrayBuffer());
  const spam = body.receipt?.spamVerdict?.status, virus = body.receipt?.virusVerdict?.status;
  const status = inboundStatus({ spam, virus, headers: mail.headers, from: mail.from?.address, subject: mail.subject, text: mail.text });
  const mailbox = act.objectKey.startsWith('newsletter/') ? 'newsletter' : 'anis';
  await env.ANIS_DB.prepare(`INSERT OR IGNORE INTO mail_messages (mailbox, direction, status, ses_message_id, message_id, in_reply_to, thread_key,
      from_addr, from_name, to_addr, subject, text, html, s3_key, spam_verdict, virus_verdict)
    VALUES (?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(mailbox, status, body.mail?.messageId ?? null, mail.messageId ?? null,
    mail.inReplyTo ?? null, threadKey(mail), lower(mail.from?.address), mail.from?.name ?? null,
    (mail.to || []).map((t) => lower(t.address)).join(', '), mail.subject ?? '', mail.text ?? '', mail.html ?? null,
    act.objectKey, spam ?? null, virus ?? null).run();
  if (mailbox === 'anis' && status === 'unsubscribe' && mail.from?.address) {     // "stop writing to me" ends outreach
    await env.ANIS_DB.prepare(`INSERT OR IGNORE INTO mail_stop (email_hash, reason) VALUES (?, 'asked by email')`).bind(await emailHash(mail.from.address)).run();
  }
  return json({ stored: true, status });
}

async function events(request, env) {
  const { error, m, body } = await readSns(request, TOPIC_EVENTS);
  if (error) return error;
  const r = eventRows(body);
  const stmts = r.recipients.map((rcpt, i) => env.ANIS_DB.prepare(`INSERT OR IGNORE INTO mail_events (sns_id, ses_message_id, event_type, recipient, detail_json)
    VALUES (?, ?, ?, ?, ?)`).bind(i ? `${m.MessageId}#${i}` : m.MessageId, r.sesId, r.type, rcpt ? lower(rcpt) : null, r.detail ? JSON.stringify(r.detail) : null));
  for (const s of r.suppress) stmts.push(env.ANIS_DB.prepare('INSERT OR IGNORE INTO mail_suppression (email, reason) VALUES (?, ?)').bind(s.email, s.reason));
  if (stmts.length) await env.ANIS_DB.batch(stmts);
  return json({ recorded: r.type, n: r.recipients.length });
}

/** Send one message through SES v2 (configuration set 'anis' → events). Suppressed addresses are refused. */
export async function sendMail(env, { to, subject, text, html, inReplyTo, references, system = false }) {
  const addr = lower(to);
  if (await env.ANIS_DB.prepare('SELECT 1 FROM mail_suppression WHERE email = ?').bind(addr).first()) return { suppressed: true };
  if (system) return sesSend(env, { addr, subject, text, html, headers: [] });   // notices to Chad: no footer, no rules
  const pause = `${SITE}/_mail/pause?t=${await pauseToken(addr, env.MAIL_LINK_SECRET)}`;
  ({ text, html } = composeLetter(text, pause));          // one look for every letter: body, signature, pause footer
  const headers = [{ Name: 'List-Unsubscribe', Value: `<${pause}>` }, { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }];
  if (inReplyTo) headers.push({ Name: 'In-Reply-To', Value: inReplyTo });
  if (references || inReplyTo) headers.push({ Name: 'References', Value: references || inReplyTo });
  return sesSend(env, { addr, subject, text, html, headers });
}

async function sesSend(env, { addr, subject, text, html, headers }) {
  const res = await aws(env, 'ses').fetch(`https://email.${REGION}.amazonaws.com/v2/email/outbound-emails`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      FromEmailAddress: mimeName(FROM_NAME, FROM_ADDR), Destination: { ToAddresses: [addr] }, ConfigurationSetName: CONFIG_SET,
      Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' }, ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}) },
        ...(headers.length ? { Headers: headers } : {}) } },
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return { error: out.message || out.Message || `ses ${res.status}` };
  return { sesMessageId: out.MessageId };
}

async function send(request, env) {
  if (!internal(request, env)) return json({ error: 'unauthorized' }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const db = env.ANIS_DB;
  let row;
  if (b.id) {
    row = await db.prepare(`SELECT * FROM mail_messages WHERE id = ? AND direction = 'out' AND status = 'draft'`).bind(b.id).first();
    if (!row) return json({ error: 'no such draft' }, 404);
  } else {
    if (!b.to || !b.subject || !b.text) return json({ error: 'to, subject, text required' }, 400);
    row = await db.prepare(`INSERT INTO mail_messages (mailbox, kind, direction, status, from_addr, to_addr, subject, text, html, in_reply_to, thread_key)
      VALUES ('anis', ?, 'out', 'draft', ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(b.kind ?? (b.inReplyTo ? 'reply' : 'outreach'), FROM_ADDR, lower(b.to), b.subject, b.text, b.html ?? null,
      b.inReplyTo ?? null, b.threadKey ?? b.inReplyTo ?? null).first();
  }
  const r = await deliver(env, row);
  return json(r, r.status === 'blocked' ? 409 : r.error ? 502 : 200);
}

/** Load settings (D1 mail_settings over the defaults). */
export async function loadSettings(db) { return settingsFrom((await db.prepare('SELECT key, value FROM mail_settings').all()).results); }

/** Send one stored draft through the engagement rules; records the outcome on the row. → { id, status, reason?, ... } */
export async function deliver(env, row) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  const verdict = sendDecision(await sendFacts(db, row, settings), settings);
  if (!verdict.ok) {
    await db.prepare(`UPDATE mail_messages SET status = 'blocked', error = ? WHERE id = ?`).bind(verdict.reason, row.id).run();
    return { id: row.id, status: 'blocked', reason: verdict.reason };
  }
  const r = await sendMail(env, { to: row.to_addr, subject: row.subject, text: row.text, html: row.html, inReplyTo: row.in_reply_to, references: row.thread_key });
  const status = r.suppressed ? 'suppressed' : r.error ? 'failed' : 'sent';
  await db.prepare(`UPDATE mail_messages SET status = ?, ses_message_id = ?, error = ?, sent_at = CASE WHEN ? = 'sent' THEN datetime('now') END WHERE id = ?`)
    .bind(status, r.sesMessageId ?? null, r.error ?? null, status, row.id).run();
  return { id: row.id, status, ...r };
}


/** What the rules need to know about one letter's recipient. */
export async function sendFacts(db, row, settings = {}) {
  const addr = lower(row.to_addr);
  const one = (sql, ...a) => db.prepare(sql).bind(...a).first();
  const { results: rules } = await db.prepare('SELECT pattern FROM mail_ignore').all();
  const inbound = await one(`SELECT count(*) n, julianday('now') - julianday(max(created_at)) days, max(created_at) last FROM mail_messages
    WHERE direction = 'in' AND mailbox = 'anis' AND from_addr = ? AND status NOT IN ('spam', 'auto')`, addr);
  return {
    kind: row.kind ?? (row.in_reply_to ? 'reply' : 'outreach'),
    suppressed: !!(await one('SELECT 1 x FROM mail_suppression WHERE email = ?', addr)),
    ignored: ignoredBy([addr], rules.map((r) => r.pattern)),
    stopped: !!(await one('SELECT 1 x FROM mail_stop WHERE email_hash = ?', await emailHash(addr))),
    allowlisted: !!(await one('SELECT 1 x FROM mail_allowlist WHERE email = ?', addr)),
    askedBy: (await one('SELECT asked_by FROM mail_allowlist WHERE email = ?', addr))?.asked_by ?? null,
    welcomed: !!(await one(`SELECT 1 x FROM mail_messages WHERE direction = 'out' AND kind = 'welcome' AND status = 'sent' AND to_addr = ?`, addr)),
    inboundCount: inbound?.n ?? 0,
    // cadence_unit_minutes (default a day) lets testers run the cadence in minutes; the rules still say 'days'
    daysSinceLastInbound: inbound?.days == null ? Infinity : (inbound.days * 1440) / Number(settings.cadence_unit_minutes || 1440),
    outreachSinceLastInbound: (await one(`SELECT count(*) n FROM mail_messages WHERE direction = 'out' AND kind = 'outreach' AND status = 'sent'
      AND to_addr = ? AND sent_at > coalesce(?, '')`, addr, inbound?.last ?? null))?.n ?? 0,
    sentToPersonToday: (await one(`SELECT count(*) n FROM mail_messages WHERE direction = 'out' AND status = 'sent' AND to_addr = ?
      AND sent_at > datetime('now', '-1 day')`, addr))?.n ?? 0,
    sentToday: (await one(`SELECT count(*) n FROM mail_messages WHERE direction = 'out' AND status = 'sent' AND sent_at > datetime('now', '-1 day')`))?.n ?? 0,
  };
}

const page = (body) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anís</title>
<body style="font:16px/1.6 Georgia,serif;max-width:34em;margin:3em auto;padding:0 1em;color:#222">${body}</body>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });

// GET shows a button (mail scanners prefetch links, so a GET must change nothing); POST stops outreach. The one-click
// List-Unsubscribe POST (RFC 8058) carries the token in the URL.
async function pausePage(request, env) {
  const url = new URL(request.url);
  let t = url.searchParams.get('t');
  if (request.method === 'POST' && !t) { try { t = (await request.formData()).get('t'); } catch { /* none */ } }
  const h = await verifyPauseToken(t, env.MAIL_LINK_SECRET);
  if (!h) return page('<h1>This link is not valid</h1><p>It may have been copied incompletely.</p>');
  if (request.method === 'GET') {
    return page(`<h1>Rather not hear from Anís?</h1><p>Anís will not write to you first again. If you write, you will still get an answer.</p>
<form method="post"><input type="hidden" name="t" value="${t}"><button style="font:inherit;padding:.5em 1.2em">Stop letters from Anís</button></form>`);
  }
  await env.ANIS_DB.prepare(`INSERT OR IGNORE INTO mail_stop (email_hash, reason) VALUES (?, 'pause link')`).bind(h).run();
  return page('<h1>Done</h1><p>Anís will not write to you first again. You are always welcome to write.</p>');
}

async function list(request, env) {
  if (!internal(request, env)) return json({ error: 'unauthorized' }, 401);
  const q = new URL(request.url).searchParams;
  const where = []; const args = [];
  if (q.get('status')) { where.push('status = ?'); args.push(q.get('status')); }
  if (q.get('direction')) { where.push('direction = ?'); args.push(q.get('direction')); }
  if (q.get('mailbox')) { where.push('mailbox = ?'); args.push(q.get('mailbox')); }
  const limit = Math.min(Number(q.get('limit')) || 50, 500);
  const { results } = await env.ANIS_DB.prepare(`SELECT id, mailbox, direction, status, from_addr, from_name, to_addr, subject, substr(text, 1, 2000) AS text,
      message_id, in_reply_to, thread_key, created_at, sent_at, error FROM mail_messages ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC LIMIT ?`).bind(...args, limit).all();
  return json({ messages: results });
}

/** Route a /_mail/* request; null when the path is not ours. */
export function mailRoute(request, env) {
  const p = new URL(request.url).pathname;
  if (request.method === 'POST' && p === '/_mail/ses/inbound') return inbound(request, env);
  if (request.method === 'POST' && p === '/_mail/ses/events') return events(request, env);
  if (request.method === 'POST' && p === '/_mail/send') return send(request, env);
  if (request.method === 'GET' && p === '/_mail/messages') return list(request, env);
  if ((request.method === 'GET' || request.method === 'POST') && p === '/_mail/pause') return pausePage(request, env);
  if ((request.method === 'GET' || request.method === 'POST') && p === '/_mail/review') return reviewPage(request, env);
  if (request.method === 'POST' && p === '/_mail/run') return runJob(request, env);
  return null;
}

/** Run a cron job now (internal key): ?job=draft|outreach|digest — for testing without waiting for the clock. */
async function runJob(request, env) {
  if (!internal(request, env)) return json({ error: 'unauthorized' }, 401);
  const job = new URL(request.url).searchParams.get('job');
  const fn = { draft: draftReplies, outreach: planOutreach, welcome: planWelcomes, digest: dailyDigest }[job];
  if (!fn) return json({ error: 'job must be draft | outreach | welcome | digest' }, 400);
  await fn(env);
  return json({ ran: job });
}

/** Cron (wrangler.jsonc triggers): drafts every 5 min, outreach hourly, the digest daily at 14:00 UTC (7 am Pacific). */
export async function mailCron(cron, env) {
  if (cron === '0 14 * * *') return dailyDigest(env);
  if (cron === '0 * * * *') return planOutreach(env);
  return draftReplies(env);                      // */5 (also fires at :00 — each cron has one job, so nothing runs twice)
}



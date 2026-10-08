// Anís mail at the edge: anis@oceanlibrary.com through Amazon SES (us-west-2), state in D1 (env.ANIS_DB).
//   POST /_mail/ses/inbound  SNS → raw MIME from S3 → mail_messages (direction in; mailbox anis, or newsletter = replies to m.oceanlibrary.com)
//   POST /_mail/ses/events   SNS → mail_events; hard bounce / complaint → mail_suppression
//   POST /_mail/send         internal key; sends a draft ({id}) or a message ({to, subject, text, html?, inReplyTo?})
//   GET  /_mail/messages     internal key; ?mailbox=anis|newsletter &status=&direction=&limit=
// Nothing is sent without an explicit /_mail/send call (Chad approves Anís's replies). Deps: aws4fetch, postal-mime.
/* global btoa */
import { AwsClient } from 'aws4fetch';
import PostalMime from 'postal-mime';
import { verifySns, isAmazonUrl } from './sns.js';

const REGION = 'us-west-2';
const ACCOUNT = '409305238362';
const TOPIC_INBOUND = `arn:aws:sns:${REGION}:${ACCOUNT}:ses-anis-inbound`;
const TOPIC_EVENTS = `arn:aws:sns:${REGION}:${ACCOUNT}:ses-anis-events`;
const FROM_ADDR = 'anis@oceanlibrary.com';
const FROM_NAME = 'Anís — Ocean AI Research Assistant';
const CONFIG_SET = 'anis';

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
export async function sendMail(env, { to, subject, text, html, inReplyTo, references }) {
  const addr = lower(to);
  if (await env.ANIS_DB.prepare('SELECT 1 FROM mail_suppression WHERE email = ?').bind(addr).first()) return { suppressed: true };
  const headers = [];
  if (inReplyTo) headers.push({ Name: 'In-Reply-To', Value: inReplyTo });
  if (references || inReplyTo) headers.push({ Name: 'References', Value: references || inReplyTo });
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
    row = await db.prepare(`INSERT INTO mail_messages (mailbox, direction, status, from_addr, to_addr, subject, text, html, in_reply_to, thread_key)
      VALUES ('anis', 'out', 'draft', ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(FROM_ADDR, lower(b.to), b.subject, b.text, b.html ?? null,
      b.inReplyTo ?? null, b.threadKey ?? b.inReplyTo ?? null).first();
  }
  const r = await sendMail(env, { to: row.to_addr, subject: row.subject, text: row.text, html: row.html, inReplyTo: row.in_reply_to, references: row.thread_key });
  const status = r.suppressed ? 'suppressed' : r.error ? 'failed' : 'sent';
  await db.prepare(`UPDATE mail_messages SET status = ?, ses_message_id = ?, error = ?, sent_at = CASE WHEN ? = 'sent' THEN datetime('now') END WHERE id = ?`)
    .bind(status, r.sesMessageId ?? null, r.error ?? null, status, row.id).run();
  return json({ id: row.id, status, ...r }, r.error ? 502 : 200);
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
  return null;
}

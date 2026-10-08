// Anís's letters, end to end, on Cloudflare (cron in worker/index.js). Tower only researches and writes; every letter
// is a DRAFT that Chad approves on a signed review page before the engagement rules (rules.js) let it go.
//   draftReplies   every 5 min: new inbound to anis@ → tower /anis/draft (one ordinary Anís turn) → draft → review notice
//   planOutreach   hourly, only while outreach_enabled = on: who is due by the rules → tower /anis/outreach → draft
//   dailyDigest    once a day: everything that happened, to the reviewer
//   reviewPage     GET shows the draft (editable) · POST send | discard. GET never changes anything.
import { marked } from 'marked';
import { sendMail, deliver, sendFacts, loadSettings, ownText } from './index.js';
import { sendDecision, emailHash } from './rules.js';

const TOWER = 'https://api.siftersearch.com/api/v1/anis';
const SITE = 'https://siftersearch.com';
const FROM_ADDR = 'anis@oceanlibrary.com';
const FOOTER_CUT = /\n\n—\nAnís, Ocean AI Research Assistant\.[\s\S]*$/;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const toHtml = (md) => `<div style="font:16px/1.6 Georgia,serif;color:#222;max-width:40em">${marked.parse(String(md || ''), { async: false })}</div>`;
/** Tidy a letter from the research pipeline: footnote markers copied from passages ("[^14]") never reach a reader. */
export const tidy = (t) => String(t || '').replace(/\[\^\d+\]/g, '').replace(/[ \t]+\n/g, '\n');
const reSubject = (s) => (/^re:/i.test(s || '') ? s : `Re: ${s || 'your message'}`);

// ── signed review links ──
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sig(id, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`anis-review:${id}`))).slice(0, 32);
}
export const reviewUrl = async (id, secret) => `${SITE}/_mail/review?t=${id}.${await sig(id, secret)}`;
async function reviewId(t, secret) {
  const [id, s] = String(t || '').split('.');
  return /^\d+$/.test(id || '') && s === (await sig(id, secret)) ? Number(id) : null;
}

/** The thread as Anís's messages: inbound = the reader's own words (quotes removed), sent = Anís's letters. */
export async function threadMessages(db, threadKey, uptoId = Infinity) {
  const { results } = await db.prepare(`SELECT id, direction, status, text FROM mail_messages WHERE thread_key = ? AND mailbox = 'anis'
    AND ((direction = 'in' AND status NOT IN ('spam', 'auto')) OR (direction = 'out' AND status = 'sent')) ORDER BY id`).bind(threadKey).all();
  return results.filter((m) => m.id <= uptoId).map((m) => ({
    role: m.direction === 'in' ? 'user' : 'assistant',
    content: m.direction === 'in' ? ownText(m.text) : String(m.text || '').replace(FOOTER_CUT, ''),
  })).filter((m) => m.content);
}

async function tower(env, path, body) {
  const res = await fetch(`${TOWER}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': env.S1_KEY }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`tower ${path} ${res.status}`);
  return res.json();
}

async function notifyReviewer(env, settings, draft, source) {
  const link = await reviewUrl(draft.id, env.MAIL_LINK_SECRET);
  const kind = draft.kind === 'outreach' ? 'Letter Anís wants to start' : 'Reply';
  const text = `${kind} to ${draft.to_addr} — review and send:\n${link}\n\n` +
    (source ? `THEY WROTE (${source.subject}):\n${ownText(source.text).slice(0, 1500)}\n\n` : '') + `DRAFT:\n${draft.text}`;
  const html = `<p><b>${esc(kind)}</b> to ${esc(draft.to_addr)} — <a href="${link}">review and send</a></p>` +
    (source ? `<p style="color:#555">They wrote (<i>${esc(source.subject)}</i>):</p><blockquote style="color:#555;border-left:3px solid #ccc;padding-left:1em">${esc(ownText(source.text).slice(0, 1500)).replace(/\n/g, '<br>')}</blockquote>` : '') +
    `<p style="color:#555">Draft:</p>${draft.html || esc(draft.text)}<p><a href="${link}">Review and send</a></p>`;
  await sendMail(env, { to: settings.reviewer_email, subject: `[Anís draft] ${draft.subject}`, text, html, system: true });
}

/** New inbound mail to anis@ → a reply draft for review. A few per tick; failures are retried next tick. */
export async function draftReplies(env, limit = 4) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  const { results } = await db.prepare(`SELECT * FROM mail_messages WHERE direction = 'in' AND mailbox = 'anis' AND (status = 'new'
    OR (status = 'drafting' AND created_at < datetime('now', '-20 minutes'))) ORDER BY id LIMIT ?`).bind(limit).all();   // a crashed tick retries
  for (const m of results) {
    if (m.from_addr === FROM_ADDR || /^(no-?reply|mailer-daemon|postmaster)/i.test(m.from_addr)) {
      await db.prepare(`UPDATE mail_messages SET status = 'handled' WHERE id = ?`).bind(m.id).run();   // nothing to answer
      continue;
    }
    const claim = await db.prepare(`UPDATE mail_messages SET status = 'drafting' WHERE id = ? AND status = ?`).bind(m.id, m.status).run();
    if (!claim.meta?.changes) continue;                                  // another tick has it
    try {
      const r = await tower(env, '/draft', { messages: await threadMessages(db, m.thread_key, m.id), email: m.from_addr });
      const stop = (r.triage?.stop ?? 0) >= 0.5, personal = r.triage?.stance === 'grieving_personal' || r.triage?.kind === 'personal';
      if (stop || personal) {                                            // no outreach after "stop" or a personal disclosure
        await db.prepare('INSERT OR IGNORE INTO mail_stop (email_hash, reason) VALUES (?, ?)').bind(await emailHash(m.from_addr), stop ? 'asked to stop' : 'personal disclosure').run();
      }
      const draft = await db.prepare(`INSERT INTO mail_messages (mailbox, kind, direction, status, from_addr, to_addr, subject, text, html, in_reply_to, thread_key, error)
        VALUES ('anis', 'reply', 'out', 'draft', ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(FROM_ADDR, m.from_addr, reSubject(m.subject), tidy(r.reply), toHtml(tidy(r.reply)),
        m.message_id, m.thread_key, `source:${m.id}; anis:${r.status}${r.triage?.stance ? `; stance:${r.triage.stance}` : ''}`).first();
      await db.prepare(`UPDATE mail_messages SET status = 'drafted' WHERE id = ?`).bind(m.id).run();
      await notifyReviewer(env, settings, draft, m);
    } catch (e) {
      await db.prepare(`UPDATE mail_messages SET status = 'new', error = ? WHERE id = ?`).bind(String(e.message).slice(0, 300), m.id).run();
    }
  }
}

/** Letters Anís starts: only while switched on, only to whom the rules allow now, one pending draft per person. */
export async function planOutreach(env) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  if (settings.outreach_enabled !== 'on') return;
  const { results: people } = await db.prepare(`SELECT from_addr, max(id) last_id FROM mail_messages WHERE direction = 'in' AND mailbox = 'anis'
    AND status NOT IN ('spam', 'auto', 'handled') AND from_addr != ? GROUP BY from_addr`).bind(FROM_ADDR).all();
  for (const p of people) {
    const pending = await db.prepare(`SELECT 1 x FROM mail_messages WHERE direction = 'out' AND to_addr = ? AND (status = 'draft'
      OR (kind = 'outreach' AND status = 'silent' AND created_at > datetime('now', '-1 day')))`).bind(p.from_addr).first();
    if (pending) continue;
    const row = { to_addr: p.from_addr, kind: 'outreach' };
    const facts = await sendFacts(db, row, settings);
    if (!sendDecision(facts, settings).ok) continue;
    const last = await db.prepare('SELECT * FROM mail_messages WHERE id = ?').bind(p.last_id).first();
    try {
      const r = await tower(env, '/outreach', { messages: await threadMessages(db, last.thread_key), step: facts.outreachSinceLastInbound, email: p.from_addr });
      if (r.silent) {
        await db.prepare(`INSERT INTO mail_messages (mailbox, kind, direction, status, to_addr, error) VALUES ('anis', 'outreach', 'out', 'silent', ?, ?)`)
          .bind(p.from_addr, r.reason || 'nothing worth sending').run();
        continue;
      }
      const body = tidy(`${r.opening}\n\n${r.reply}`);
      const draft = await db.prepare(`INSERT INTO mail_messages (mailbox, kind, direction, status, from_addr, to_addr, subject, text, html, thread_key, error)
        VALUES ('anis', 'outreach', 'out', 'draft', ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(FROM_ADDR, p.from_addr, r.subject, body, toHtml(body),
        last.thread_key, `step:${facts.outreachSinceLastInbound}; ${r.capability}`).first();
      await notifyReviewer(env, settings, draft, null);
    } catch { /* tower unreachable: try next hour */ }
  }
}

// ── review page ──
const page = (body) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anís draft</title>
<style>body{font:16px/1.55 Georgia,serif;max-width:46em;margin:2em auto;padding:0 16px;color:#222;background:#fbfaf7}
textarea,input{width:100%;box-sizing:border-box;font:15px/1.5 ui-monospace,Menlo,monospace;padding:.6em;border:1px solid #bbb;border-radius:6px}
textarea{min-height:24em}button{font:inherit;padding:.55em 1.3em;border-radius:6px;border:1px solid #1d6b58;background:#1d6b58;color:#fff;margin-right:.6em}
button.alt{background:#fff;color:#8a2b2b;border-color:#8a2b2b}.them{color:#555;border-left:3px solid #ccc;padding-left:1em;white-space:pre-wrap}
.warn{background:#fdf0e6;border:1px solid #e3b48d;padding:.6em 1em;border-radius:6px}.meta{color:#666;font-size:14px}</style><body>${body}</body>`,
  { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export async function reviewPage(request, env) {
  const db = env.ANIS_DB;
  const url = new URL(request.url);
  const form = request.method === 'POST' ? await request.formData() : null;
  const t = url.searchParams.get('t') || form?.get('t');
  const id = await reviewId(t, env.MAIL_LINK_SECRET);
  if (!id) return page('<h1>This link is not valid</h1>');
  const d = await db.prepare(`SELECT * FROM mail_messages WHERE id = ? AND direction = 'out'`).bind(id).first();
  if (!d) return page('<h1>No such draft</h1>');
  if (d.status !== 'draft') return page(`<h1>Already ${esc(d.status)}</h1><p class="meta">${esc(d.subject)} → ${esc(d.to_addr)}${d.error ? ` · ${esc(d.error)}` : ''}</p>`);
  if (form) {
    if (form.get('action') === 'discard') {
      await db.prepare(`UPDATE mail_messages SET status = 'discarded' WHERE id = ?`).bind(id).run();
      return page('<h1>Discarded</h1><p>Nothing was sent.</p>');
    }
    const subject = String(form.get('subject') || d.subject), text = String(form.get('text') || d.text);
    await db.prepare('UPDATE mail_messages SET subject = ?, text = ?, html = ? WHERE id = ?').bind(subject, text, toHtml(text), id).run();
    const r = await deliver(env, { ...d, subject, text, html: toHtml(text) });
    return page(r.status === 'sent' ? `<h1>Sent</h1><p class="meta">to ${esc(d.to_addr)}</p>` : `<h1>Not sent: ${esc(r.status)}</h1><p>${esc(r.reason || r.error || '')}</p>`);
  }
  const settings = await loadSettings(db);
  const verdict = sendDecision(await sendFacts(db, d, settings), settings);
  const src = Number((d.error || '').match(/source:(\d+)/)?.[1]);
  const source = src ? await db.prepare('SELECT subject, text, from_name, created_at FROM mail_messages WHERE id = ?').bind(src).first() : null;
  return page(`<h1>${d.kind === 'outreach' ? 'A letter Anís wants to start' : 'Reply'} to ${esc(d.to_addr)}</h1>
<p class="meta">${esc(d.error || '')}</p>
${verdict.ok ? '' : `<p class="warn">The rules would block this right now: ${esc(verdict.reason)}</p>`}
${source ? `<h3>${esc(source.from_name || d.to_addr)} wrote (${esc(source.created_at)} UTC)</h3><div class="them">${esc(ownText(source.text))}</div>` : ''}
<form method="post"><input type="hidden" name="t" value="${esc(t)}">
<h3>Subject</h3><input name="subject" value="${esc(d.subject)}">
<h3>Letter <span class="meta">(Markdown; the footer with the pause link is added when sent)</span></h3><textarea name="text">${esc(d.text)}</textarea>
<p><button name="action" value="send">Send</button><button class="alt" name="action" value="discard">Discard</button></p></form>`);
}

// ── daily digest ──
export async function dailyDigest(env) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  const all = async (sql, ...a) => (await db.prepare(sql).bind(...a).all()).results;
  const since = "datetime('now', '-1 day')";
  const inbound = await all(`SELECT id, mailbox, status, from_addr, from_name, subject, text FROM mail_messages WHERE direction = 'in' AND created_at > ${since} ORDER BY id`);
  const out = await all(`SELECT id, kind, status, to_addr, subject, error FROM mail_messages WHERE direction = 'out' AND (sent_at > ${since} OR created_at > ${since}) ORDER BY id`);
  const pending = await all(`SELECT id, kind, to_addr, subject, created_at FROM mail_messages WHERE direction = 'out' AND status = 'draft' ORDER BY id`);
  const events = await all(`SELECT event_type, count(*) n FROM mail_events WHERE at > ${since} GROUP BY event_type`);
  const bad = await all(`SELECT event_type, recipient FROM mail_events WHERE at > ${since} AND event_type IN ('Bounce', 'Complaint', 'Reject')`);
  const stops = await all(`SELECT reason, count(*) n FROM mail_stop WHERE at > ${since} GROUP BY reason`);
  const ignored = await all(`SELECT pattern, hits, last_hit FROM mail_ignore WHERE last_hit > ${since}`);
  const count = (xs, k) => xs.reduce((m, x) => ((m[x[k]] = (m[x[k]] || 0) + 1), m), {});
  const fmt = (m) => Object.entries(m).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none';
  const line = (m) => `${m.from_name ? `${m.from_name} <${m.from_addr}>` : m.from_addr} — ${m.subject || '(no subject)'}: ${ownText(m.text).replace(/\s+/g, ' ').slice(0, 160)}`;
  const real = (box) => inbound.filter((m) => m.mailbox === box && !['spam', 'auto'].includes(m.status) && m.status !== 'unsubscribe');
  const unsubs = inbound.filter((m) => m.mailbox === 'newsletter' && m.status === 'unsubscribe');
  const links = await Promise.all(pending.map(async (p) => `  • ${p.kind} to ${p.to_addr} — ${p.subject}\n    ${await reviewUrl(p.id, env.MAIL_LINK_SECRET)}`));
  const text = [
    `Anís mail — last 24 hours (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
    `Outreach: ${settings.outreach_enabled}${settings.outreach_allowlist_only === 'on' ? ' (allowlist only)' : ''} · cadence ${settings.cadence_days} × ${Number(settings.cadence_unit_minutes || 1440) === 1440 ? 'days' : `${settings.cadence_unit_minutes} min`}`,
    '',
    `Drafts waiting for you: ${pending.length}`, ...links,
    '',
    `Received at anis@: ${fmt(count(inbound.filter((m) => m.mailbox === 'anis'), 'status'))}`, ...real('anis').map((m) => `  • ${line(m)}`),
    `Newsletter replies: ${fmt(count(inbound.filter((m) => m.mailbox === 'newsletter'), 'status'))}`, ...real('newsletter').map((m) => `  • ${line(m)}`),
    ...(unsubs.length ? [`Newsletter unsubscribe requests — pass to the team (${unsubs.length}):`, ...unsubs.map((m) => `  • ${m.from_addr}`)] : []),
    '',
    `Sent / blocked: ${fmt(count(out, 'status'))}`, ...out.filter((o) => o.status === 'blocked' || o.status === 'failed').map((o) => `  • ${o.status} ${o.kind} to ${o.to_addr}: ${o.error}`),
    `Delivery events: ${fmt(Object.fromEntries(events.map((e) => [e.event_type, e.n])))}`, ...bad.map((b) => `  • ${b.event_type}: ${b.recipient}`),
    `New pauses/stops: ${fmt(Object.fromEntries(stops.map((s) => [s.reason, s.n])))}`,
    ...(ignored.length ? [`Ignored senders: ${ignored.map((i) => `${i.pattern} (${i.hits} total)`).join(', ')}`] : []),
  ].join('\n');
  const html = `<pre style="font:14px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${esc(text).replace(/(https:\/\/siftersearch\.com\/_mail\/review\?t=[\w.]+)/g, '<a href="$1">review</a>')}</pre>`;
  await sendMail(env, { to: settings.reviewer_email, subject: `Anís mail: ${inbound.length} in · ${out.filter((o) => o.status === 'sent').length} sent · ${pending.length} drafts waiting`, text, html, system: true });
}

// Anís's letters, end to end, on Cloudflare (cron in worker/index.js). Tower only researches and writes; every letter
// to someone outside the invited list is a DRAFT Chad approves on a signed review page; every letter passes the
// engagement rules (rules.js).
//   draftReplies   every minute (≥3 min after Anís's last letter to that person): new inbound to anis@ → tower /anis/draft (one ordinary Anís turn) → sent at once to invited
//                  people (auto_send_invited; anyone who writes joins the list — Chad 10-12), otherwise a draft + review notice to Chad
//   planOutreach   hourly, only while outreach_enabled = on: welcome letters (template) for people added to the list with
//                  no history; then who is due by the rules → tower /anis/outreach → draft
//   dailyDigest    once a day: everything that happened, to the reviewer
//   reviewPage     GET shows the draft (editable) · POST send | discard. GET never changes anything.
import { bodyHtml, wrapHtml, signatureHtml, stripSignOff, answerBody, composeLetter } from './letter.js';
import { sendMail, deliver, sendFacts, loadSettings, ownText } from './index.js';
import { sendDecision, emailHash } from './rules.js';
import { conversationDigest, chatReplyHtml, embeddable } from './conversation-digest.js';
import { approveUrl } from './dewey.js';
import { emailDocument } from '../../api/lib/mail-render.js';
import { pauseToken } from './rules.js';

const TOWER = 'https://api.siftersearch.com/api/v1/anis';
const SITE = 'https://siftersearch.com';
const FROM_ADDR = 'anis@oceanlibrary.com';
const FOOTER_CUT = /\n\n—\nAnís, Ocean AI Research Assistant\.[\s\S]*$|\n\n— Anís\n(?:AI Research Assistant for Ocean 2\.0|Ocean Study Companion AI)[\s\S]*$/;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** The draft as the reader will see it (signature included; the pause footer is added at send). */
export const toHtml = (md) => wrapHtml(`${bodyHtml(stripSignOff(md))}${signatureHtml()}`);
/** Tidy a letter from the research pipeline: footnote markers copied from passages ("[^14]") never reach a reader. */
export const tidy = (t) => String(t || '').replace(/\[\^\d+\]/g, '').replace(/[ \t]+\n/g, '\n');
const reSubject = (s) => (/^re:/i.test(s || '') ? s : `Re: ${s || 'your message'}`);
// A reply stays in the reader's thread: Gmail starts a NEW thread when the subject changes, so a reading page sent under its
// own "[📖 Reading] …" subject looked like no answer at all (10-13 — it sat unread in a separate thread). Only a reply that
// OPENS a reading (their subject is not yet a reading thread) takes the guide's descriptive subject.
const READING_THREAD = /\[(📖\s*)?Reading\]/i;
export const replySubject = (theirs, guide) => (guide && !READING_THREAD.test(theirs || '') ? guide : reSubject(theirs));

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
  const { results } = await db.prepare(`SELECT id, direction, status, text FROM mail_messages WHERE thread_key = ? AND mailbox IN ('anis', 'support')
    AND ((direction = 'in' AND status NOT IN ('spam', 'auto')) OR (direction = 'out' AND status = 'sent')) ORDER BY id`).bind(threadKey).all();
  return results.filter((m) => m.id <= uptoId).map((m) => ({
    role: m.direction === 'in' ? 'user' : 'assistant',
    content: m.direction === 'in' ? ownText(m.text) : String(m.text || '').replace(FOOTER_CUT, ''),
  })).filter((m) => m.content);
}

async function tower(env, path, body) {
  const res = await fetch(`${TOWER}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': env.S1_KEY },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (res.status === 404 && body === undefined) return { status: 'unknown' };
  if (!res.ok) throw new Error(`tower ${path} ${res.status}`);
  return res.json();
}

/** One reply draft as a JOB on tower (docs/architecture/continuous-deploy.md): a research answer takes 40–120 s; asked
 *  synchronously it died at Cloudflare's ~125 s limit (524) and the next tick recomputed it, every minute. The first tick
 *  starts the job (key mail-<id>, never run twice); later ticks poll it. → the finished result, or null while it runs.
 *  A failed or lost job is retried up to 3 times, then the message is marked failed (its error says why). */
export async function draftJob(env, db, m, { call = tower } = {}) {
  const key = `mail-${m.id}`;
  const attempts = Number(/attempt (\d+)/.exec(m.error || '')?.[1] || 0);
  const j = m.status === 'drafting' ? await call(env, `/draft/job/${key}`) : { status: 'unknown' };
  if (j.status === 'done') return j.result;
  if (j.status === 'running') return null;
  // not started yet, failed, lost (its API instance was killed) or unknown (tower lost the file): (re)start it
  // only a job that RAN and failed (or was killed) counts; "unknown" = never started (tower was unreachable) → just start it
  if (j.status === 'failed' || j.status === 'lost') {
    if (attempts >= 3) {
      await db.prepare(`UPDATE mail_messages SET status = 'failed', error = ? WHERE id = ?`).bind(`draft ${j.status} after ${attempts} attempts: ${j.error || ''}`.slice(0, 300), m.id).run();
      return null;
    }
    await db.prepare('UPDATE mail_messages SET error = ? WHERE id = ?').bind(`attempt ${attempts + 1}${j.error ? `: ${j.error}` : ''}`.slice(0, 300), m.id).run();
  }
  await call(env, '/draft', { async: true, job: key, messages: await threadMessages(db, m.thread_key, m.id), email: m.from_addr });
  return null;
}

/** Invite-only alpha (Chad 2026-10-08: "no need to go to draft since this is an internal group"): letters to invited
 *  people (mail_allowlist) are sent at once; anyone else's goes to Chad as a draft. */
async function sendOrReview(env, settings, draft, source) {
  // a REPLY always goes at once (Chad 10-19: "if someone asks a question of Anis, they should get an immediate answer … I did
  // not say I wanted to be asked to approve anis emails") — the engagement rules (stop, bounces, caps) still decide in deliver()
  if (draft.kind === 'reply') return deliver(env, draft);
  const invited = settings.auto_send_invited === 'on'
    && await env.ANIS_DB.prepare('SELECT 1 x FROM mail_allowlist WHERE email = ?').bind(draft.to_addr).first();
  if (invited) return deliver(env, draft);                             // in the daily digest as sent, or blocked with why
  return notifyReviewer(env, settings, draft, source);
}

async function notifyReviewer(env, settings, draft, source) {
  const link = await reviewUrl(draft.id, env.MAIL_LINK_SECRET);
  const kind = { outreach: 'Letter Anís wants to start', welcome: 'Welcome letter' }[draft.kind] || 'Reply';
  // the draft exactly as the reader will get it (composeLetter = what sendMail sends; letters Anís starts add the pause footer)
  const letter = composeLetter(draft.text, null);
  const text = `${kind} to ${draft.to_addr} — review and send:\n${link}\n\n` +
    (source ? `THEY WROTE (${source.subject}):\n${ownText(source.text).slice(0, 1500)}\n\n` : '') + `DRAFT:\n${letter.text}`;
  const html = `<p><b>${esc(kind)}</b> to ${esc(draft.to_addr)} — <a href="${link}">review and send</a></p>` +
    (source ? `<p style="color:#555">They wrote (<i>${esc(source.subject)}</i>):</p><blockquote style="color:#555;border-left:3px solid #ccc;padding-left:1em">${esc(ownText(source.text).slice(0, 1500)).replace(/\n/g, '<br>')}</blockquote>` : '') +
    `<p style="color:#555">Draft:</p>${letter.html}<p><a href="${link}">Review and send</a></p>`;
  await sendMail(env, { to: settings.reviewer_email, subject: `[Anís draft] ${draft.subject}`, text, html, system: true });
}

/** New inbound mail to anis@ → a reply draft for review. A few per tick; failures are retried next tick. */
export const REPLY_GAP_MIN = 3;
export async function draftReplies(env, limit = 4) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  // 'drafting' = a job runs on tower: every tick polls it (draftJob) — no more "retry after 20 minutes"
  const { results } = await db.prepare(`SELECT * FROM mail_messages WHERE direction = 'in' AND mailbox = 'anis' AND status IN ('new', 'drafting')
    ORDER BY id LIMIT ?`).bind(limit).all();
  for (const m of results) {
    if (m.from_addr === FROM_ADDR || /^(no-?reply|mailer-daemon|postmaster)/i.test(m.from_addr)) {
      await db.prepare(`UPDATE mail_messages SET status = 'handled' WHERE id = ?`).bind(m.id).run();   // nothing to answer
      continue;
    }
    // answered at once — unless Anís wrote to this person under 3 minutes ago (Chad 10-13: a reader who reads, then replies,
    // gets the next page right away; a rapid volley waits out the 3 minutes)
    if (await db.prepare(`SELECT 1 x FROM mail_messages WHERE direction = 'out' AND status = 'sent' AND to_addr = ? AND created_at > datetime('now', ?)`)
      .bind(m.from_addr, `-${REPLY_GAP_MIN} minutes`).first()) continue;
    if (m.status === 'new') {
      const claim = await db.prepare(`UPDATE mail_messages SET status = 'drafting' WHERE id = ? AND status = 'new'`).bind(m.id).run();
      if (!claim.meta?.changes) continue;                                // another tick has it
    }
    try {
      const r = await draftJob(env, db, m);
      if (!r) continue;                                                  // still researching — the next tick looks again
      const stop = (r.triage?.stop ?? 0) >= 0.5, personal = r.triage?.stance === 'grieving_personal' || r.triage?.kind === 'personal';
      if (stop || personal) {                                            // no outreach after "stop" or a personal disclosure
        await db.prepare('INSERT OR IGNORE INTO mail_stop (email_hash, reason) VALUES (?, ?)').bind(await emailHash(m.from_addr), stop ? 'asked to stop' : 'personal disclosure').run();
      }
      const draft = await db.prepare(`INSERT INTO mail_messages (mailbox, kind, direction, status, from_addr, to_addr, subject, text, html, in_reply_to, thread_key, error, meta_json)
        VALUES ('anis', 'reply', 'out', 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(FROM_ADDR, m.from_addr, replySubject(m.subject, r.subject), tidy(r.reply), toHtml(tidy(r.reply)),
        m.message_id, m.thread_key, `source:${m.id}; anis:${r.status}${r.triage?.stance ? `; stance:${r.triage.stance}` : ''}`,
        JSON.stringify({ ...(r.meta || {}), conversation: r.conversationId ?? null })).first();
      await db.prepare(`UPDATE mail_messages SET status = 'drafted' WHERE id = ?`).bind(m.id).run();
      // Writing to Anís IS consent to engage (Chad 10-12: "a hyper-engagement tool … to expand the user base"): the writer
      // joins the list → this reply goes at once and the outreach cadence follows. Ignored senders never reach here
      // (dropped at inbound); a pause/stop or a personal disclosure still stops outreach (mail_stop, rules.js).
      await db.prepare(`INSERT INTO mail_allowlist (email, name, asked_by, note) VALUES (?, ?, NULL, 'wrote to Anís')
        ON CONFLICT(email) DO NOTHING`).bind(m.from_addr, m.from_name ?? null).run();
      await sendOrReview(env, settings, draft, m);
    } catch (e) {
      // tower unreachable: stay 'drafting' — the job (if started) keeps running; the next tick polls or starts it
      await db.prepare(`UPDATE mail_messages SET error = ? WHERE id = ?`).bind(String(e.message).slice(0, 300), m.id).run();
    }
  }
}

/** Fill a letter template: {{greeting}} → "Hello Name," or "Hello,"; {{intro}} → "Chad asked me to reach out and
 *  introduce myself. " when someone asked Anís to write (invite-only), else nothing. */
export const fillTemplate = (body, { name, asked_by: askedBy } = {}) => String(body)
  .replace(/\{\{greeting\}\}/g, name ? `Hello ${String(name).trim()},` : 'Hello,')
  .replace(/\{\{intro\}\}/g, askedBy ? `${String(askedBy).trim()} asked me to reach out and introduce myself. ` : '');

const fill = (t, v) => String(t).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? v[k] : m));

/**
 * A support letter (Chad hands Anís an Ocean support email, approves the answer): record their question (mailbox
 * 'support'), invite them (asked_by), send ONE letter — the welcome version if Anís has never written to them, else a
 * short reply. Chad's approval is the approval; the engagement rules still apply.
 * b: { to, name?, subject, question, answer (Markdown — a full Anís letter is trimmed to its middle), about? }
 */
export async function supportLetter(env, b) {
  const db = env.ANIS_DB;
  const to = String(b.to || '').trim().toLowerCase();
  if (!to.includes('@') || !b.question || !b.answer) return { error: 'to, question, answer required' };
  const key = `<support-${crypto.randomUUID()}@oceanlibrary.com>`;
  await db.prepare(`INSERT INTO mail_messages (mailbox, direction, status, message_id, thread_key, from_addr, from_name, to_addr, subject, text)
    VALUES ('support', 'in', 'handled', ?, ?, ?, ?, 'chad (forwarded)', ?, ?)`).bind(key, key, to, b.name ?? null, b.subject ?? '', b.question).run();
  await db.prepare(`INSERT INTO mail_allowlist (email, name, asked_by, note) VALUES (?, ?, 'Chad', 'support letter')
    ON CONFLICT(email) DO UPDATE SET name = coalesce(mail_allowlist.name, excluded.name)`).bind(to, b.name ?? null).run();
  const welcomed = await db.prepare(`SELECT 1 x FROM mail_messages WHERE direction = 'out' AND status = 'sent' AND to_addr = ?`).bind(to).first();
  const tpl = await db.prepare('SELECT subject, body FROM mail_templates WHERE key = ?').bind(welcomed ? 'support_reply' : 'support_welcome').first();
  const vars = { greeting: b.name ? `Hello ${String(b.name).trim().split(/\s+/)[0]},` : 'Hello,', about: b.about ? ` about ${b.about}` : '',
    answer: answerBody(b.answer), subject: (b.subject || 'your letter').replace(/^re:\s*/i, '') };
  const text = fill(tpl.body, vars);
  const draft = await db.prepare(`INSERT INTO mail_messages (mailbox, kind, direction, status, from_addr, to_addr, subject, text, html, thread_key, error)
    VALUES ('anis', ?, 'out', 'draft', ?, ?, ?, ?, ?, ?, 'support letter; approved by Chad') RETURNING *`)
    .bind(welcomed ? 'reply' : 'welcome', FROM_ADDR, to, fill(tpl.subject, vars), text, toHtml(text), key).first();
  return deliver(env, draft);
}

/** Welcome letters: once, to each person added to the list who has never written and has no welcome yet (any status —
 *  a discarded welcome is a decision, not a gap). Template from D1 mail_templates. When Chad asked for it (asked_by)
 *  it is SENT at once — his request is the approval; otherwise it is drafted for review. */
export async function planWelcomes(env, settings) {
  const db = env.ANIS_DB;
  settings ||= await loadSettings(db);
  const tpl = await db.prepare(`SELECT subject, body FROM mail_templates WHERE key = 'welcome'`).first();
  if (!tpl) return;
  const { results } = await db.prepare(`SELECT a.email, a.name, a.asked_by FROM mail_allowlist a
    WHERE NOT EXISTS (SELECT 1 FROM mail_messages m WHERE m.direction = 'in' AND m.from_addr = a.email)
      AND NOT EXISTS (SELECT 1 FROM mail_messages m WHERE m.direction = 'out' AND m.kind = 'welcome' AND m.to_addr = a.email)`).all();
  for (const p of results) {
    if (!sendDecision(await sendFacts(db, { to_addr: p.email, kind: 'welcome' }, settings), settings).ok) continue;   // e.g. not asked for, outreach off
    const body = fillTemplate(tpl.body, p);
    const draft = await db.prepare(`INSERT INTO mail_messages (mailbox, kind, direction, status, from_addr, to_addr, subject, text, html, error)
      VALUES ('anis', 'welcome', 'out', 'draft', ?, ?, ?, ?, ?, ?) RETURNING *`).bind(FROM_ADDR, p.email, tpl.subject, body, toHtml(body),
      p.asked_by ? `welcome template; asked by ${p.asked_by}` : 'welcome template').first();
    if (p.asked_by) await deliver(env, draft);                         // Chad asked: his request is the approval
    else await sendOrReview(env, settings, draft, null);
  }
}

/** Letters Anís starts: only while switched on, only to whom the rules allow now, one pending draft per person. */
export async function planOutreach(env) {
  const db = env.ANIS_DB;
  const settings = await loadSettings(db);
  await planWelcomes(env, settings);                                   // the welcomes Chad asked for go even while outreach is off
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
      await sendOrReview(env, settings, draft, null);
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
  return page(`<h1>${{ outreach: 'A letter Anís wants to start', welcome: 'Welcome letter' }[d.kind] || 'Reply'} to ${esc(d.to_addr)}</h1>
<p class="meta">${esc(d.error || '')}</p>
${verdict.ok ? '' : `<p class="warn">The rules would block this right now: ${esc(verdict.reason)}</p>`}
${source ? `<h3>${esc(source.from_name || d.to_addr)} wrote (${esc(source.created_at)} UTC)</h3><div class="them">${esc(ownText(source.text))}</div>` : ''}
<h3>As it will be sent</h3><div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:12px 16px">${composeLetter(d.text, null).html}</div>
${d.kind === 'reply' ? '' : '<p class="meta">(plus the pause footer)</p>'}
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
  const support = await all(`SELECT o.to_addr, o.subject, o.status FROM mail_messages o WHERE o.direction = 'out' AND o.error LIKE 'support letter%' AND o.created_at > ${since}`);
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
    `Received at dewey@: ${fmt(count(inbound.filter((m) => m.mailbox === 'dewey'), 'status'))}`,
    ...(support.length ? [`Support letters answered by Anís (${support.length}):`, ...support.map((x) => `  • ${x.status}: ${x.to_addr} — ${x.subject}`)] : []),
    `Newsletter replies: ${fmt(count(inbound.filter((m) => m.mailbox === 'newsletter'), 'status'))}`, ...real('newsletter').map((m) => `  • ${line(m)}`),
    ...(unsubs.length ? [`Newsletter unsubscribe requests — pass to the team (${unsubs.length}):`, ...unsubs.map((m) => `  • ${m.from_addr}`)] : []),
    '',
    `Sent / blocked: ${fmt(count(out, 'status'))}`, ...out.filter((o) => o.status === 'blocked' || o.status === 'failed').map((o) => `  • ${o.status} ${o.kind} to ${o.to_addr}: ${o.error}`),
    `Delivery events: ${fmt(Object.fromEntries(events.map((e) => [e.event_type, e.n])))}`, ...bad.map((b) => `  • ${b.event_type}: ${b.recipient}`),
    `New pauses/stops: ${fmt(Object.fromEntries(stops.map((s) => [s.reason, s.n])))}`,
    ...(ignored.length ? [`Ignored senders: ${ignored.map((i) => `${i.pattern} (${i.hits} total)`).join(', ')}`] : []),
  ].join('\n');
  const mailHtml = `<pre style="font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:#444">${esc(text).replace(/(https:\/\/siftersearch\.com\/_mail\/review\?t=[\w.]+)/g, '<a href="$1">review</a>')}</pre>`;
  // EVERY CONVERSATION as the reader saw it (Chad 10-22: "daily digests of every Anís conversation … exactly as it is seen
  // by the recipient so I can tweak"); the mail activity above becomes the appendix. No conversations → no email.
  const until = new Date();
  const g = await gatherConversations(env, { until, settings });
  if (!g.conversations.length) return { sent: false, conversations: 0 };
  const d = conversationDigest(g.conversations, { date: until.toISOString().slice(0, 10), reviewer: settings.reviewer_email,
    fullUrl: await digestUrl(until, env.MAIL_LINK_SECRET), mailHtml, skipped: g.skipped });
  const subject = `Anís conversations — ${until.toISOString().slice(0, 10)} · ${d.conversations} conversation${d.conversations === 1 ? '' : 's'} · ${d.replies} repl${d.replies === 1 ? 'y' : 'ies'}`
    + `${d.flagged ? ` · ${d.flagged} flagged` : ''}${d.held ? ` · ${d.held} held` : ''}${g.towerDown ? ' · web chat unavailable' : ''}`;
  await sendMail(env, { to: settings.reviewer_email, subject, text: `${d.text}\n\n${text}`, html: d.html, system: true });
  return { sent: true, conversations: d.conversations, replies: d.replies, truncated: d.truncated };
}

// ── the conversation digest's data: email threads from D1 (the letters exactly as sent), web chat / widget rounds from
// tower's exchange log (/anis/digest), joined on the reader and time so each letter gets its audit and thread ──
const QUIET = new Set(['battery@siftersearch.com', 'test-rerun@siftersearch.com']);   // test batteries: counted, not shown
const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const atMs = (s) => Date.parse(String(s || '').replace(' ', 'T') + (/[zZ+]/.test(String(s)) ? '' : 'Z'));
const LETTER_TYPE = { welcome: 'welcome letter', outreach: 'outreach letter' };
const RECIPE = { define: 'CTAI term study', source: 'source hunt', original: 'original text', research: 'research answer', language: 'language answer', position: 'position answer' };
const routeType = (route, status) => (!route ? null : status === 'canned' || route.gate === 'canned' ? 'canned' : route.gate === 'tarpit' ? 'triage: tarpit'
  : RECIPE[route.strategy] || (route.strategy ? `answer (${route.strategy})` : null));
// (the draft's error note 'source:N; anis:<status>' is cleared when it is sent, so this mostly sees drafts)
const fromError = (row) => {
  const anis = /anis:(\w+)/.exec(row.error || '')?.[1];
  if (/^support letter/.test(row.error || '')) return 'support letter';
  return LETTER_TYPE[row.kind] || { reading: 'reading guide', canned: 'canned', tarpit: 'triage: tarpit', answered: 'answer' }[anis] || 'reply';
};

/** → { conversations, skipped, towerDown } for the `hours` before `until`. */
export async function gatherConversations(env, { until = new Date(), hours = 24, settings = null, fetchTower = null } = {}) {
  const db = env.ANIS_DB;
  settings ||= await loadSettings(db);
  const end = until.getTime(), start = end - hours * 3600e3;
  // Dewey's letters too (mailbox 'dewey', channel 'dewey' → the digest's own "Dewey" section, Chad 10-23)
  const rows = (await db.prepare(`SELECT * FROM mail_messages WHERE mailbox IN ('anis', 'support', 'dewey') AND created_at >= ? AND created_at < ?
      AND NOT (direction = 'in' AND status IN ('spam', 'auto', 'bounce', 'list')) AND NOT (direction = 'out' AND status IN ('discarded', 'silent')) ORDER BY id`)
    .bind(sqlTime(start), sqlTime(end)).all()).results;
  const get = fetchTower || ((path) => fetch(`${TOWER}${path}`, { headers: { 'x-internal-key': env.S1_KEY } }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  const tower = await get(`/digest?hours=${hours}&until=${encodeURIComponent(until.toISOString())}`);
  // tower's email rounds, per reader, to give each letter its audit / meter / thread
  const towerEmail = new Map();
  for (const p of tower?.people || []) for (const r of p.rounds) {
    if (r.channel !== 'email' || !p.person?.email) continue;
    const k = p.person.email.toLowerCase();
    towerEmail.set(k, [...(towerEmail.get(k) || []), { ...r, thread: p.thread, used: false }]);
  }
  const match = (addr, at) => {
    const best = (towerEmail.get(String(addr).toLowerCase()) || []).filter((r) => !r.used && Math.abs(atMs(r.at) - atMs(at)) < 20 * 60e3)
      .sort((a, b) => Math.abs(atMs(a.at) - atMs(at)) - Math.abs(atMs(b.at) - atMs(at)))[0];
    if (best) best.used = true;
    return best || null;
  };
  let skipped = 0;
  const threads = new Map();
  for (const m of rows) {
    const key = m.thread_key || `id:${m.id}`;
    const dewey = m.mailbox === 'dewey';
    if (!threads.has(key)) threads.set(key, { key, channel: dewey ? 'dewey' : 'email', thread: null, person: null, types: [], items: [] });
    const c = threads.get(key);
    if (m.direction === 'in') {
      c.person ||= { email: m.from_addr, name: m.from_name };
      let im = null; try { im = m.meta_json ? JSON.parse(m.meta_json) : null; } catch { /* old row */ }
      // Dewey: what the door rules / the screen / the reply rules decided, and why (Chad 10-23: silence + a note in the digest)
      const why = dewey && !['answered', 'drafted', 'new'].includes(m.status) ? `${m.status}${m.error ? ` — ${m.error}` : ''}` : m.status;
      const scr = dewey && im?.screen ? `screen: ${im.screen.reason}${im.screen_usd != null ? ` · $${Number(im.screen_usd).toFixed(5)}` : ''}` : dewey && im?.screen_error ? `screen failed (${im.screen_error}) — rules alone` : null;
      c.items.push({ kind: 'in', at: m.created_at, from: m.from_addr, fromName: m.from_name, subject: m.subject, text: ownText(m.text || ''), status: why, channel: c.channel,
        screen: scr, screen_usd: dewey ? Number(im?.screen_usd) || 0 : 0 });
      continue;
    }
    if (dewey) {                                   // Dewey's letter exactly as sent (its stored HTML); no tower round to match
      let meta = null; try { meta = m.meta_json ? JSON.parse(m.meta_json) : null; } catch { /* none */ }
      const type = { stranger: 'how to contribute', live: 'now live', request: 'book request' }[m.kind] || 'dewey receipt';
      c.person ||= { email: m.to_addr, name: null };
      c.items.push({ kind: 'out', at: m.sent_at || m.created_at, to: m.to_addr, subject: m.subject, html: embeddable(m.html || ''), text: m.text, status: m.status, channel: 'dewey',
        meta: { type, models: [], latency_ms: null, ...(meta || {}), usd: meta?.work_usd ?? meta?.usd ?? null, ...(meta?.type === 'dewey' ? { type } : {}) }, audit: null, error: m.error,
        work_usd: Number(meta?.work_usd) || 0, review: m.kind === 'request' && m.status === 'draft' ? await approveUrl(env) : null });
      if (!c.types.includes(type)) c.types.push(type);
      continue;
    }
    c.person ||= { email: m.to_addr, name: null };
    const t = match(m.to_addr, m.created_at);
    let meta = null; try { meta = m.meta_json ? JSON.parse(m.meta_json) : null; } catch { /* old row */ }
    // rows from before 10-22 carry no meter: the type from tower's route, the latency = how long the reader waited
    const lastIn = [...c.items].reverse().find((x) => x.kind === 'in');
    meta ||= t?.meta || { type: routeType(t?.route, t?.status) || fromError(m), models: [], usd: null,
      latency_ms: lastIn && m.kind === 'reply' ? atMs(m.sent_at || m.created_at) - atMs(lastIn.at) : null };
    if (!meta.type) meta.type = fromError(m);
    if (meta.conversation || t?.thread) c.thread ||= meta.conversation || t.thread;
    // the letter as it went out: the stored send-time HTML; rows from before 10-22 lack the pause footer → composed again
    let html = m.html;
    if (!html || (m.status === 'sent' && m.kind !== 'reply' && !/Rather not hear/.test(html))) {
      const pause = m.kind === 'reply' ? null : `${SITE}/_mail/pause?t=${await pauseToken(String(m.to_addr).toLowerCase(), env.MAIL_LINK_SECRET)}`;
      html = composeLetter(m.text || '', pause).html;
    }
    c.items.push({ kind: 'out', at: m.sent_at || m.created_at, to: m.to_addr, subject: m.subject, html, text: m.text, status: m.status, channel: 'email',
      meta, audit: t?.audit || null, review: await reviewUrl(m.id, env.MAIL_LINK_SECRET) });
    if (!c.types.includes(meta.type)) c.types.push(meta.type);
  }
  const conversations = [];
  for (const c of threads.values()) {
    if (QUIET.has(String(c.person?.email || '').toLowerCase())) { skipped += c.items.filter((x) => x.kind === 'out').length; continue; }
    conversations.push(c);
  }
  // web chat, widget — and email rounds tower answered that never went through the mailbox (none expected)
  for (const p of tower?.people || []) {
    const email = String(p.person?.email || '').toLowerCase();
    const rounds = p.rounds.filter((r) => r.channel !== 'email' || !r.used && !(towerEmail.get(email) || []).find((x) => x.at === r.at && x.used));
    if (!rounds.length) continue;
    if (QUIET.has(email)) { skipped += rounds.length; continue; }
    const c = { key: p.thread, channel: rounds[0].channel || p.channel, thread: p.thread, person: p.person, types: [], items: [] };
    for (const r of rounds) {
      c.items.push({ kind: 'in', at: r.asked_at || r.at, from: p.person?.email || '', fromName: p.person?.name || null, text: r.question, status: r.status === 'failed' ? 'failed' : null, channel: r.channel });
      const meta = r.meta || { type: 'answer', models: [], usd: null, latency_ms: null };
      c.items.push({ kind: 'out', at: r.at, to: p.person?.email || '', html: r.channel === 'email' ? composeLetter(r.reply || '', null).html : chatReplyHtml(r.reply), text: r.reply,
        status: r.status, channel: r.channel, meta, audit: r.audit });
      if (!c.types.includes(meta.type)) c.types.push(meta.type);
    }
    conversations.push(c);
  }
  conversations.sort((a, b) => atMs(a.items[0]?.at) - atMs(b.items[0]?.at));
  return { conversations, skipped, towerDown: !tower };
}

// ── the digest as a page (signed link; the email links here when it passes ~1 MB) ──
async function digestSig(untilSec, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`anis-digest:${untilSec}`))).slice(0, 32);
}
export const digestUrl = async (until, secret) => { const u = Math.floor(until.getTime() / 1000); return `${SITE}/_mail/digest?t=${u}.${await digestSig(u, secret)}`; };
export async function digestPage(request, env) {
  const [u, s] = String(new URL(request.url).searchParams.get('t') || '').split('.');
  if (!/^\d+$/.test(u || '') || s !== (await digestSig(u, env.MAIL_LINK_SECRET))) return page('<h1>This link is not valid</h1>');
  const until = new Date(Number(u) * 1000);
  const settings = await loadSettings(env.ANIS_DB);
  const g = await gatherConversations(env, { until, settings });
  const d = conversationDigest(g.conversations, { date: until.toISOString().slice(0, 10), reviewer: settings.reviewer_email, skipped: g.skipped, maxBytes: Infinity });
  return new Response(emailDocument(d.html, { title: `Anís conversations ${until.toISOString().slice(0, 10)}` }),
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

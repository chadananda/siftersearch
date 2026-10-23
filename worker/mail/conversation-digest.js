// Chad's daily CONVERSATION digest (10-22: "every Anís conversation … exactly as it is seen by the recipient so I can
// tweak"): a summary (counts by channel and type, flagged / held answers, failures, cost), a jump list, then one section
// per conversation in order — each inbound message as the reader wrote it, each Anís reply exactly as it reached them
// (the letter HTML that went to SES; a web-chat answer rendered as the chat shows it), with subject, from/to (redacted to
// initials@domain unless it is Chad), time (MST), channel, turn type, models, cost and latency, plus the links to act:
// the review page, the admin thread, and the prompt/persona files that turn type used. Past ~1 MB the remaining
// conversations are listed with a link to the full digest page. Pure HTML/text from data. Deps: letter.js.
import { bodyHtml, plainText } from './letter.js';

export const MAX_BYTES = 950_000;
const REPO = 'https://github.com/chadananda/siftersearch/blob/main/';
const ADMIN_THREAD = 'https://siftersearch.com/admin/anis#threads/';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHANNEL = { email: 'email', 'widget-chat': 'widget', 'site-chat': 'web chat', dewey: 'Dewey email' };

/** "lalf1919@gmail.com" → "l@gmail.com"; the reviewer (Chad) stays whole. Pure. */
export function redactEmail(addr, reviewer = '') {
  const a = String(addr || '').trim().toLowerCase();
  if (!a.includes('@')) return a ? '(no address)' : '';
  if (reviewer && a === String(reviewer).toLowerCase()) return a;
  const [local, domain] = a.split('@');
  return `${local.split(/[._+-]/).filter(Boolean).map((w) => w[0]).join('')}@${domain}`;
}
/** "Lal Fernando" → "L. F." Pure. */
export const redactName = (n) => String(n || '').split(/\s+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');

/** UTC "2026-10-22 23:41:50" → "2026-10-22 16:41 MST" (Arizona time, no daylight saving). Pure. */
export function mst(utc) {
  const t = Date.parse(String(utc || '').replace(' ', 'T') + (/[zZ+]/.test(String(utc)) ? '' : 'Z'));
  if (!Number.isFinite(t)) return '';
  return `${new Date(t - 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')} MST`;
}

/** The files to edit for a turn type: persona, prompt, the type's own module, the model table, the letter look. Pure. */
export function configFiles(type = '', channel = 'email') {
  if (channel === 'dewey') return ['api/lib/dewey/mail.js', 'worker/mail/dewey.js', 'api/routes/dewey-mail.js'];
  const own = /reading/.test(type) ? ['api/lib/assistant/reading.js'] : /term study/.test(type) ? ['api/lib/assistant/ctai-term.js', 'api/lib/assistant/respond.js']
    : /canned|triage/.test(type) ? ['api/lib/assistant/canned.js', 'api/lib/assistant/triage.js'] : /research/.test(type) ? ['api/lib/assistant/respond.js', 'api/lib/assistant/researcher.js']
      : ['api/lib/assistant/respond.js'];
  return ['api/lib/assistant/soul.md', 'api/lib/assistant/prompt.js', ...own, 'api/lib/model-roles.js', ...(channel === 'email' ? ['worker/mail/letter.js'] : [])];
}

/** A stored letter → the fragment to embed: a full document's body only, never a script or an event handler. Pure. */
export function embeddable(html) {
  let s = String(html || '');
  const body = s.match(/<div class="em-body"[^>]*>([\s\S]*)<\/div>\s*<\/body>/i) || s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (body) s = body[1];
  return s.replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '').replace(/<(script|iframe|object|embed|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"');
}

const money = (usd) => (usd == null ? '—' : usd < 0.01 ? `$${Number(usd).toFixed(4)}` : `$${Number(usd).toFixed(2)}`);
const secs = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const chip = (t, color = '#55606a') => `<span style="display:inline-block;font:11px/1.6 ui-monospace,Menlo,monospace;color:${color};border:1px solid ${color}55;border-radius:3px;padding:0 5px;margin:0 4px 2px 0">${esc(t)}</span>`;

/** Is this reply one to look at: the auditor flagged it, or it is held / blocked / failed. Pure. */
export function replyState(r) {
  const a = r.audit || {};
  const flagged = a.state === 'done' && (a.answered === 'no' || a.answered === 'partly' || (a.problems || []).length > 0);
  const held = ['draft', 'blocked'].includes(r.status);
  const failed = ['failed', 'suppressed'].includes(r.status);
  return { flagged, held, failed };
}

function inboundHtml(m, reviewer) {
  return `<div style="margin:0 0 14px">
  <div style="font:12px/1.5 ui-monospace,Menlo,monospace;color:#7a8389">${esc(mst(m.at))} · ${esc(CHANNEL[m.channel] || m.channel)} · from ${esc(m.fromName ? `${reviewer && m.from === reviewer ? m.fromName : redactName(m.fromName)} ` : '')}&lt;${esc(redactEmail(m.from, reviewer))}&gt;${m.subject ? ` · <b>${esc(m.subject)}</b>` : ''}${m.status && !['new', 'drafted', 'answered'].includes(m.status) ? ` · ${chip(m.status, '#b33')}` : ''}</div>
  <div dir="auto" style="white-space:pre-wrap;font-size:15px;color:#222;background:#f6f4ef;border-left:3px solid #c9bfae;padding:8px 12px;border-radius:2px">${esc(String(m.text || '').slice(0, 6000))}</div>
</div>`;
}

function replyHtml(r, reviewer) {
  const st = replyState(r);
  const meta = r.meta || {};
  const head = `${esc(mst(r.at))} · ${esc(CHANNEL[r.channel] || r.channel)} · ${r.channel === 'dewey' ? 'Dewey' : 'Anís'} → &lt;${esc(redactEmail(r.to, reviewer) || 'web visitor')}&gt;${r.subject ? ` · <b>${esc(r.subject)}</b>` : ''}`;
  const chips = [chip(meta.type || 'reply', '#1f6f8b'), meta.models?.length ? chip(meta.models.join(' + ')) : '', chip(money(meta.usd)), chip(secs(meta.latency_ms)),
    r.status && r.status !== 'answered' && r.status !== 'sent' ? chip(r.status, st.held || st.failed ? '#b33' : '#55606a') : '',
    st.flagged ? chip(`audit: ${r.audit.answered === 'no' ? 'not answered' : r.audit.answered === 'partly' ? 'partly answered' : 'problems'}`, '#b33') : r.audit?.state === 'done' ? chip('audit: fine', '#3a7') : ''].join('');
  const problems = st.flagged ? `<div style="font-size:13px;color:#7a2e2e;margin:6px 0 0">${r.audit.summary && r.audit.summary !== 'fine' ? `${esc(r.audit.summary)}` : ''}${(r.audit.problems || []).length
    ? `<ul style="margin:4px 0 0;padding-left:18px">${r.audit.problems.slice(0, 6).map((p) => `<li><b>${esc(p.kind)}</b> — ${esc(p.detail)}</li>`).join('')}</ul>` : ''}</div>` : '';
  const how = r.channel === 'email' || r.channel === 'dewey' ? (r.status === 'sent' ? 'the letter exactly as sent' : `the letter — ${r.status}${r.error ? `: ${r.error}` : ''}`) : 'as the chat showed it';
  return `<div style="margin:0 0 18px">
  <div style="font:12px/1.5 ui-monospace,Menlo,monospace;color:#7a8389">${head}</div>
  <div style="margin:3px 0 6px">${chips}</div>
  <div style="font:10px ui-monospace,Menlo,monospace;color:#9aa5aa;text-transform:uppercase;letter-spacing:.12em;margin:0 0 2px">${how}</div>
  <div style="border:1px solid #d9e2e6;border-radius:6px;padding:14px 18px;background:#fff">${r.html}</div>${problems}
  ${r.review ? `<div style="font-size:12.5px;margin-top:4px"><a href="${esc(r.review)}" style="color:#1f6f8b">${st.held ? 'Review and send' : 'Open this letter’s review page'}</a></div>` : ''}
</div>`;
}

function linksHtml(c) {
  const files = configFiles(c.types[0] || '', c.channel);
  return `<div style="font-size:12.5px;color:#55606a;margin:2px 0 14px">Tweak: ${c.thread ? `<a href="${ADMIN_THREAD}${esc(c.thread)}" style="color:#1f6f8b">admin thread</a> · ` : ''}${files.map((f) => `<a href="${REPO}${f}" style="color:#1f6f8b;font-family:ui-monospace,Menlo,monospace">${esc(f.split('/').pop())}</a>`).join(' · ')}</div>`;
}

/** Render one conversation's section. Pure. */
export function conversationHtml(c, i, reviewer) {
  const who = c.person?.email ? redactEmail(c.person.email, reviewer) : c.person?.name || 'web visitor';
  return `<div style="margin:0 0 30px">
  <a name="c${i + 1}" id="c${i + 1}"></a>
  <div style="font:12px ui-monospace,Menlo,monospace;color:#2f5d8a;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid #e3ebee;padding-bottom:6px;margin-bottom:6px">${i + 1}. ${esc(who)} · ${esc(CHANNEL[c.channel] || c.channel)} · ${c.items.filter((x) => x.kind === 'out').length} repl${c.items.filter((x) => x.kind === 'out').length === 1 ? 'y' : 'ies'}</div>
  ${linksHtml(c)}
  ${c.items.map((x) => (x.kind === 'in' ? inboundHtml(x, reviewer) : replyHtml(x, reviewer))).join('\n')}
</div>`;
}

/** The summary numbers. Pure. */
export function summarize(conversations) {
  const replies = conversations.flatMap((c) => c.items.filter((x) => x.kind === 'out'));
  const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const priced = replies.filter((r) => r.meta?.usd != null);
  const usd = priced.length ? priced.reduce((s, r) => s + Number(r.meta.usd), 0) : null;   // null = nothing metered (turns before 10-22)
  return { conversations: conversations.length, inbound: conversations.reduce((n, c) => n + c.items.filter((x) => x.kind === 'in').length, 0), replies: replies.length,
    byChannel: count(conversations, (c) => CHANNEL[c.channel] || c.channel), byType: count(replies, (r) => r.meta?.type || 'reply'),
    flagged: replies.filter((r) => replyState(r).flagged), held: replies.filter((r) => replyState(r).held), failed: replies.filter((r) => replyState(r).failed),
    failedInbound: conversations.flatMap((c) => c.items.filter((x) => x.kind === 'in' && x.status === 'failed')), usd };
}

/**
 * conversations: [{ key, channel, thread?, person:{name,email}, types:[…], items:[ {kind:'in', at, from, fromName, subject, text, status, channel}
 *   | {kind:'out', at, to, subject, html, text, status, channel, meta, audit, review} ] }] (items in order)
 * → { html, text, conversations, replies, truncated }
 */
export function conversationDigest(conversations, { date = '', reviewer = '', fullUrl = '', mailHtml = '', skipped = 0, maxBytes = MAX_BYTES } = {}) {
  // Dewey's contributor mail is its own section, after Anís's conversations (Chad 10-23)
  conversations = [...conversations.filter((c) => c.channel !== 'dewey'), ...conversations.filter((c) => c.channel === 'dewey')];
  const firstDewey = conversations.findIndex((c) => c.channel === 'dewey');
  const s = summarize(conversations);
  const fmt = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} <b>${n}</b>`).join(' · ') || '—';
  const look = [...s.flagged.map((r) => ['flagged', r]), ...s.held.map((r) => ['held', r]), ...s.failed.map((r) => ['failed', r])];
  const where = (r) => conversations.findIndex((c) => c.items.includes(r)) + 1;
  const summary = `<div style="background:#f4f7fa;border:1px solid #dde6ef;border-radius:8px;padding:14px 18px;margin:0 0 20px;font-size:14.5px;line-height:1.8">
  <b>${s.conversations}</b> conversation${s.conversations === 1 ? '' : 's'} · <b>${s.inbound}</b> message${s.inbound === 1 ? '' : 's'} in · <b>${s.replies}</b> repl${s.replies === 1 ? 'y' : 'ies'} · metered cost <b>${money(s.usd)}</b><br>
  By channel: ${fmt(s.byChannel)}<br>By type: ${fmt(s.byType)}<br>
  <span style="color:${look.length || s.failedInbound.length ? '#b33' : '#3a7'}">Flagged <b>${s.flagged.length}</b> · held <b>${s.held.length}</b> · failed <b>${s.failed.length + s.failedInbound.length}</b></span>
  ${look.length ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px">${look.map(([k, r]) => `<li><a href="#c${where(r)}" style="color:#b33">${k}</a> — #${where(r)} ${esc(r.subject || (r.text || '').slice(0, 60))}</li>`).join('')}</ul>` : ''}
  ${skipped ? `<div style="font-size:12.5px;color:#7a8389">${skipped} test-battery exchange${skipped === 1 ? '' : 's'} not shown.</div>` : ''}
</div>`;
  const jump = `<div style="margin:0 0 24px;font-size:14px;line-height:1.8"><div style="font:11px monospace;color:#999;text-transform:uppercase;letter-spacing:.14em">Conversations</div>${conversations.map((c, i) => {
    const st = c.items.filter((x) => x.kind === 'out').map(replyState);
    const mark = st.some((x) => x.flagged || x.held || x.failed) ? ' <span style="color:#b33">●</span>' : '';
    const first = c.items.find((x) => x.kind === 'in') || c.items[0];
    return `<div><a href="#c${i + 1}" style="color:#1f6f8b">${i + 1}. ${esc(c.person?.email ? redactEmail(c.person.email, reviewer) : c.person?.name || 'web visitor')}</a> · ${esc(CHANNEL[c.channel] || c.channel)} · ${esc((first?.subject || first?.text || '').replace(/\s+/g, ' ').slice(0, 70))}${mark}</div>`;
  }).join('')}</div>`;
  const head = `<div style="max-width:720px;font-family:Georgia,serif;color:#222">
  <div style="font-family:'Palatino Linotype',Palatino,Georgia,serif;font-style:italic;font-size:26px;color:#2f5d8a">Anís — every conversation</div>
  <div style="font:11px monospace;color:#999;text-transform:uppercase;letter-spacing:.2em;margin:0 0 18px">${esc(date)} · last 24 h${fullUrl ? ` · <a href="${esc(fullUrl)}" style="color:#999">open as a page</a>` : ''}</div>
  ${summary}${jump}`;
  const tail = `${mailHtml ? `<div style="margin-top:28px"><div style="font:11px monospace;color:#999;text-transform:uppercase;letter-spacing:.14em;margin:0 0 8px">Mail</div>${mailHtml}</div>` : ''}</div>`;
  let size = head.length + tail.length;
  let truncated = 0;
  const DEWEY_HEAD = `<div style="font-family:'Palatino Linotype',Palatino,Georgia,serif;font-style:italic;font-size:24px;color:#6b4f2a;border-top:2px solid #e8dfd0;padding-top:14px;margin:34px 0 14px">Dewey — contributor mail</div>`;
  const sections = conversations.map((c, i) => {
    const full = (i === firstDewey ? DEWEY_HEAD : '') + conversationHtml(c, i, reviewer);
    if (!truncated && size + full.length <= maxBytes) { size += full.length; return full; }
    truncated += 1;
    return `<div style="margin:0 0 10px"><a name="c${i + 1}" id="c${i + 1}"></a>${i + 1}. ${esc(c.person?.email ? redactEmail(c.person.email, reviewer) : 'web visitor')} — too long for one email: <a href="${esc(fullUrl)}#c${i + 1}" style="color:#1f6f8b">read it on the digest page</a></div>`;
  });
  const html = `${head}${truncated ? `<p style="color:#b33;font-size:14px">This digest passed ~1 MB: the last ${truncated} conversation${truncated === 1 ? ' is' : 's are'} on <a href="${esc(fullUrl)}">the digest page</a>.</p>` : ''}${sections.join('\n')}${tail}`;
  const text = [`Anís — every conversation · ${date} · last 24 h`, `${s.conversations} conversations · ${s.inbound} in · ${s.replies} replies · ${money(s.usd)}`,
    `Flagged ${s.flagged.length} · held ${s.held.length} · failed ${s.failed.length + s.failedInbound.length}`, fullUrl ? `Full digest: ${fullUrl}` : '', '',
    ...conversations.map((c, i) => [...(i === firstDewey ? ['', '── DEWEY — contributor mail ──'] : []), `${i + 1}. ${c.person?.email ? redactEmail(c.person.email, reviewer) : 'web visitor'} · ${CHANNEL[c.channel] || c.channel}`,
      ...c.items.map((x) => (x.kind === 'in' ? `  ${mst(x.at)} THEY WROTE: ${String(x.text || '').replace(/\s+/g, ' ').slice(0, 300)}`
        : `  ${mst(x.at)} ${x.channel === 'dewey' ? 'DEWEY' : 'ANÍS'} (${x.meta?.type || 'reply'}, ${money(x.meta?.usd)}, ${secs(x.meta?.latency_ms)}${x.status && x.status !== 'sent' && x.status !== 'answered' ? `, ${x.status}` : ''}): ${plainText(x.text || '').replace(/\s+/g, ' ').slice(0, 400)}`)),
    ].join('\n'))].join('\n');
  return { html, text, conversations: s.conversations, replies: s.replies, flagged: s.flagged.length, held: s.held.length, truncated };
}

/** A web-chat reply as the chat shows it (its Markdown rendered). Pure. */
export const chatReplyHtml = (md) => `<div style="font-family:Georgia,serif;font-size:15.5px;line-height:1.6;color:#2b2621">${bodyHtml(md || '')}</div>`;

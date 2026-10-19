// Anís's daily digest — her CONVERSATIONS, the way Jafar's digest shows his (Chad 10-19: "replicate this for Anis … follow
// conversations early on to head off poor answers"): the day's numbers, the replies that NEED A LOOK first (the auditor
// found them unanswered, partly answered, or with problems — with its reasons), who asked, then every question and answer
// as the reader saw it. Pure HTML from the tower's /anis/digest data. Deps: letter.js bodyHtml (the email renderer).
import { bodyHtml } from './letter.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const when = (s) => String(s || '').replace('T', ' ').slice(0, 16) + ' UTC';
const who = (p) => (p?.person?.name && p.person.email ? `${p.person.name} <${p.person.email}>` : p?.person?.email || p?.person?.name || 'someone');
const label = (c) => ({ email: 'email', 'widget-chat': 'web chat', 'site-chat': 'site chat' }[c] || c || 'chat');

/** A reply needs a look: the auditor says not (fully) answered, or lists problems. Pure. */
export function needsLook(r) {
  const a = r.audit || {};
  return a.state === 'done' && (a.answered === 'no' || a.answered === 'partly' || (a.problems || []).length > 0);
}
const auditLine = (a) => {
  if (!a || a.state === 'pending') return '<span style="color:#999">audit pending</span>';
  if (a.state !== 'done') return '<span style="color:#999">audit unavailable</span>';
  const ok = !(a.answered === 'no' || a.answered === 'partly' || (a.problems || []).length);
  return ok ? '<span style="color:#3a7">audit: fine</span>'
    : `<span style="color:#b33">audit: ${esc(a.answered === 'no' ? 'not answered' : a.answered === 'partly' ? 'partly answered' : 'problems')}${a.why ? ` · ${esc(a.why)}` : ''}</span>`;
};
const problems = (a) => ((a?.problems || []).length ? `<ul style="margin:6px 0 0;padding-left:18px;color:#7a2e2e;font-size:13px">${a.problems.slice(0, 6).map((p) => `<li><b>${esc(p.kind)}</b> — ${esc(p.detail)}</li>`).join('')}</ul>` : '')
  + (a?.summary && a.summary !== 'fine' ? `<div style="font-size:13px;color:#7a2e2e;margin-top:4px">${esc(a.summary)}</div>` : '');

const round = (r, { flagged = false } = {}) => `<div style="margin:0 0 20px;padding-left:14px;border-left:2px solid ${flagged ? '#d9a3a3' : '#c9d7e8'}">
    <div style="font-size:12px;color:#aaa;margin-bottom:4px">${when(r.at)} · ${esc(label(r.channel))} · ${esc(r.status || '')}${r.route?.strategy ? ` · ${esc(r.route.strategy)}` : ''} · ${auditLine(r.audit)}</div>
    <div style="font-size:16px;color:#111;font-weight:bold;margin-bottom:6px;white-space:pre-wrap">${esc(String(r.question).slice(0, 1500))}</div>
    <div style="font-size:15px;color:#333;line-height:1.6">${bodyHtml(r.reply || '')}</div>${flagged ? problems(r.audit) : ''}
  </div>`;

/** data: { hours, people: [{ person, rounds }] }; mailHtml: the mail activity block (optional). → { html, questions, flagged } */
export function digestHtml(data, { mailHtml = '', date = new Date().toISOString().slice(0, 10) } = {}) {
  const people = data?.people || [];
  const all = people.flatMap((p) => p.rounds.map((r) => ({ ...r, p })));
  const flagged = all.filter(needsLook);
  const audited = all.filter((r) => r.audit?.state === 'done').length;
  const byPerson = new Map();
  for (const p of people) { const k = who(p); byPerson.set(k, [...(byPerson.get(k) || []), ...p.rounds]); }
  const askers = [...byPerson.entries()].sort((a, b) => b[1].length - a[1].length);
  const stats = `<div style="background:#f4f7fa;border:1px solid #dde6ef;border-radius:8px;padding:16px 20px;margin-bottom:24px;font-size:15px;line-height:1.9">
      <strong>${all.length}</strong> question${all.length === 1 ? '' : 's'} in the last ${data?.hours || 24}h · from <strong>${askers.length}</strong> ${askers.length === 1 ? 'person' : 'people'}<br>
      <strong>${audited}</strong> audited · <strong style="color:${flagged.length ? '#b33' : '#3a7'}">${flagged.length}</strong> need${flagged.length === 1 ? 's' : ''} a look</div>`;
  const head = (t) => `<div style="font:11px monospace;color:#999;text-transform:uppercase;letter-spacing:.14em;margin:0 0 12px">${t}</div>`;
  const look = flagged.length ? `${head('Needs a look')}${flagged.map((r) => `<div style="font:12px monospace;color:#7a2e2e;margin-bottom:6px">${esc(who(r.p))}</div>${round(r, { flagged: true })}`).join('')}` : '';
  const whoBlock = askers.length ? `<div style="margin-bottom:24px">${head('Who asked')}${askers.map(([k, rs]) => `<div style="font-size:14px;color:#333">${esc(k)} — <strong>${rs.length}</strong></div>`).join('')}</div>` : '';
  const threads = askers.map(([k, rs]) => `<div style="margin:0 0 10px"><div style="font:12px monospace;color:#2f5d8a;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:12px">${esc(k)} · ${rs.length}</div>
      ${rs.map((r) => round(r, { flagged: needsLook(r) })).join('')}</div>`).join('');
  const html = `<div style="max-width:680px;font-family:Georgia,serif;color:#222">
    <div style="font-family:'Palatino Linotype',Palatino,Georgia,serif;font-style:italic;font-size:26px;color:#2f5d8a;margin-bottom:2px">Anís — daily digest</div>
    <div style="font:11px monospace;color:#999;text-transform:uppercase;letter-spacing:.2em;margin-bottom:22px">${esc(date)}</div>
    ${stats}${look}${whoBlock}${head('All questions &amp; answers')}${threads || '<p style="color:#999">No questions in this window.</p>'}
    ${mailHtml ? `<div style="margin-top:28px">${head('Mail')}${mailHtml}</div>` : ''}
  </div>`;
  return { html, questions: all.length, flagged: flagged.length };
}

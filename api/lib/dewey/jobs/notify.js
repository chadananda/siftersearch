// Dewey completion notices (Chad 10-28): chat card ALWAYS; HTML email only when asked for (per job, or a per-person setting) or when the
// job was started by email. Templates, never model-written. Tower builds the data; the Worker sends mail via ZeptoMail (worker/mail/dewey.js
// deweyJobMail) from /api/v1/dewey-mail/outbox. Links to documents appear only for children that reached `published` (rendered AND searchable).
import { createHmac } from 'node:crypto';
import * as realRepo from '../../repos/dewey-jobs-repo.js';
import { isTerminal } from './states.js';
import { labelOf } from './status.js';
import { docUrl } from './live.js';
import { whoOf } from './policy.js';

const SITE = 'https://siftersearch.com';
const secret = () => process.env.INTERNAL_API_KEY || '';
export const jobSig = (id, action = 'view') => createHmac('sha256', secret()).update(`dewey-job:${Number(id)}:${action}`).digest('hex').slice(0, 24);
export const jobSigOk = (id, t, action = 'view') => typeof t === 'string' && t.length === 24 && t === jobSig(id, action);
export const jobUrl = (id) => `${SITE}/dewey/job/${Number(id)}?t=${jobSig(id)}`;
const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'there';
const plural = (n, w, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const cell = (s) => String(s ?? '—').replace(/\|/g, '/').replace(/\s+/g, ' ').trim() || '—';
const MAX_ROWS = 25;

/** Should this job's finish be emailed? Asked per job (notify.email), started by email, or the person's standing setting. */
export const wantsEmail = ({ channel, emailMe = false, pref = false }) => channel === 'email' || !!emailMe || !!pref;

/** The facts of a finished (or waiting) job, from its children. Pure. */
export function summarize(job, kids = []) {
  const rows = kids.length ? kids : [job];
  const out = { label: labelOf(job), added: [], dupes: [], skipped: [], failed: [], needs: [], handed: [], indexing: [], total: kids.length || 1 };
  for (const k of rows) {
    const r = k.result || {}, name = k.params?.name || r.title || labelOf(k).replace(/[“”]/g, '');
    if (k.state === 'published') out.added.push({ title: r.title || name, author: r.author || null, url: r.url || (r.doc_id ? docUrl(r.doc_id) : null) });
    else if (k.state === 'handed-off') out.handed.push({ name: r.title || name, note: r.note || 'sent to the media library' });
    else if (k.state === 'skipped' || k.state === 'cancelled') (r.reason === 'duplicate' ? out.dupes : out.skipped).push({ name, why: r.reason === 'duplicate' ? (r.why || 'already in the library') : (r.why || r.reason || 'skipped'), matched: r.duplicate_of || null });
    else if (k.state === 'failed') out.failed.push({ name, why: k.error || 'could not be read' });
    else if (k.state === 'awaiting-decision') out.needs.push({ name: r.title || name, item_id: k.item_id || r.item_id || null });
    else if (r.outcome === 'indexing') out.indexing.push({ name: r.title || name });
  }
  return out;
}

const up = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const headline = (s, job) => {
  if (job.state === 'failed') return up(`${s.label} did not work out: ${job.error || 'an error'}.`);
  const bits = [];
  if (s.added.length) bits.push(`${plural(s.added.length, 'work')} added to the library`);
  if (s.dupes.length) bits.push(`${s.dupes.length} already there`);
  if (s.handed.length) bits.push(`${s.handed.length} sent to the media library`);
  if (s.skipped.length) bits.push(`${s.skipped.length} skipped`);
  if (s.failed.length) bits.push(`${s.failed.length} unreadable`);
  if (s.needs.length) bits.push(`${s.needs.length} waiting for your decision`);
  return up(`${s.label}: ${plural(s.total, 'file')} — ${bits.join(', ') || 'nothing new'}.`);
};

/** The chat message (Markdown) for a stage. */
export function chatText(job, kids, stage) {
  const s = summarize(job, kids);
  const lines = [stage === 'decision' ? `**${headline(s, job)}**` : `**Finished.** ${headline(s, job)}`];
  for (const a of s.added.slice(0, MAX_ROWS)) lines.push(`- Added: ${a.url ? `[${a.title}](${a.url})` : a.title}${a.author ? ` — ${a.author}` : ''}`);
  if (s.added.length > MAX_ROWS) lines.push(`- …and ${s.added.length - MAX_ROWS} more added`);
  for (const d of s.dupes.slice(0, 10)) lines.push(`- Already in the library: ${d.name}${d.why && d.why !== 'already in the library' ? ` (${d.why})` : ''}`);
  for (const d of s.skipped.slice(0, 10)) lines.push(`- Skipped: ${d.name} — ${d.why}`);
  for (const d of s.failed.slice(0, 10)) lines.push(`- Could not read: ${d.name} — ${d.why}`);
  for (const d of s.handed.slice(0, 10)) lines.push(`- ${d.name}: ${d.note}`);
  if (s.needs.length) lines.push(`- Waiting for you: ${s.needs.slice(0, 10).map((n) => n.name).join('; ')}${s.needs.length > 10 ? '…' : ''} — answer in the Review list or reply “add them” here.`);
  return lines.join('\n');
}

/** The email for a stage: { subject, md, buttons:[{label,url}] }. Buttons name their outcomes. */
export function emailFor(job, kids, stage, { name = null } = {}) {
  const s = summarize(job, kids);
  const subject = job.state === 'failed' ? `Dewey: ${s.label} did not work out`
    : stage === 'decision' ? `Dewey: ${s.needs.length} of ${s.total} files need your decision (${s.label})`
      : `Dewey: ${s.added.length} of ${plural(s.total, 'file')} added from ${s.label.replace(/[“”]/g, '').replace(/^your ZIP /, '').replace(/^the file from /, '')}`;
  const md = [`Dear ${first(name)},`, '', headline(s, job), ''];
  if (s.added.length) {
    md.push(`**Added to the library (${s.added.length})**`, '', '| Title | Author | Link |', '| --- | --- | --- |');
    for (const a of s.added.slice(0, MAX_ROWS)) md.push(`| ${cell(a.title)} | ${cell(a.author)} | ${a.url ? `[read it](${a.url})` : '—'} |`);
    if (s.added.length > MAX_ROWS) md.push('', `…and ${s.added.length - MAX_ROWS} more; the full list is on the report page.`);
    md.push('');
  }
  const list = (title, rows, f) => { if (rows.length) { md.push(`**${title} (${rows.length})**`, ''); for (const r of rows.slice(0, MAX_ROWS)) md.push(`- ${f(r)}`); md.push(''); } };
  list('Already in the library', s.dupes, (d) => `${cell(d.name)}${d.why && d.why !== 'already in the library' ? ` — ${cell(d.why)}` : ''}`);
  list('Sent to the media library', s.handed, (d) => `${cell(d.name)} — ${cell(d.note)}`);
  list('Skipped, and why', s.skipped, (d) => `${cell(d.name)} — ${cell(d.why)}`);
  list('Could not be read', s.failed, (d) => `${cell(d.name)} — ${cell(d.why)}`);
  list('Needs you', s.needs, (d) => cell(d.name));
  if (s.indexing.length) md.push(`${plural(s.indexing.length, 'work')} still being made searchable; the report page shows when they are live.`, '');
  md.push('With thanks,');
  const buttons = [];
  if (s.needs.length) buttons.push({ label: `Review the ${s.needs.length} waiting work${s.needs.length === 1 ? '' : 's'}`, url: `${SITE}/dewey/job/${job.id}?t=${jobSig(job.id)}` });
  buttons.push({ label: s.added.length ? `See all ${s.added.length} added work${s.added.length === 1 ? '' : 's'}` : 'See the full report', url: jobUrl(job.id) });
  return { subject, md: md.join('\n'), buttons };
}

const stageOf = (job) => (isTerminal(job.state) ? 'final' : 'decision');

/** Chat notices for jobs that finished or are waiting: one message per stage per job (role 'notice' in the member's thread). */
export async function noticePass({ repo = realRepo, append, userIdOf, now = () => new Date().toISOString() } = {}) {
  const app = append || (await import('../../repos/dewey-repo.js')).appendMessage;
  const uid = userIdOf || (async (email) => (await (await import('../../repos/contributors-repo.js')).userByEmail(email))?.id);
  let sent = 0;
  for (const job of await repo.noticeCandidates()) {
    const stage = stageOf(job), chatted = job.notify?.chatted || {};
    if (chatted[stage]) continue;
    if (stage === 'decision' && job.counts?.found == null && job.kind === 'intake') continue;
    const id = await uid(whoOf(job.created_by));
    const kids = await repo.childrenOf(job.id);
    if (id) {
      const text = chatText(job, kids, stage);
      await app(id, 'notice', text, { parts: [{ kind: 'job', text, url: jobUrl(job.id), state: job.state, counts: job.counts }] });
      sent++;
    }
    await repo.updateJob(job.id, { notify: { ...job.notify, chatted: { ...chatted, [stage]: now() } } });
  }
  return { sent };
}

/** What the Worker should email now. → [{ key, to, name, subject, md, buttons }] (job notices + the operator's 80 % spend note). */
export async function outbox({ repo = realRepo, nameOf = async () => null, admin = () => (process.env.DEWEY_ADMIN_EMAILS || 'chadananda@gmail.com').split(',')[0].trim() } = {}) {
  const mails = [];
  for (const job of await repo.noticeCandidates()) {
    const stage = stageOf(job);
    if (!job.notify?.email || job.notify?.emailed?.[stage] || !job.created_by) continue;
    const kids = await repo.childrenOf(job.id), to = whoOf(job.created_by);
    mails.push({ key: `job:${job.id}:${stage}`, to, ...emailFor(job, kids, stage, { name: await nameOf(to) }) });
  }
  const day = repo.dayOf(), n80 = await repo.getFlag(`note80:${day}`);
  if (n80 && !(await repo.getFlag(`note80-sent:${day}`))) {
    const g = JSON.parse(n80);
    mails.push({ key: `note80:${day}`, to: admin(), subject: `Dewey: ${Math.round((g.spent / g.ceiling) * 100)}% of today's spend ceiling used`,
      md: `Dear Chad,\n\nDewey has spent $${Number(g.spent).toFixed(2)} of today's $${g.ceiling} ceiling (80% reached). At 100% every new job is refused until midnight UTC or until you lift the pause.\n\nTo see where it went: the dewey-jobs ops report. To stop everything now: set DEWEY_V2=0 or the paused flag.\n\nWith thanks,`, buttons: [] });
  }
  return mails;
}

export async function ack(key, { repo = realRepo, now = () => new Date().toISOString() } = {}) {
  let m = /^job:(\d+):(final|decision)$/.exec(key);
  if (m) { const job = await repo.getJob(Number(m[1])); if (!job) return false; await repo.updateJob(job.id, { notify: { ...job.notify, emailed: { ...(job.notify?.emailed || {}), [m[2]]: now() } } }); return true; }
  m = /^note80:(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (m) { await repo.setFlag(`note80-sent:${m[1]}`, now()); return true; }
  return false;
}

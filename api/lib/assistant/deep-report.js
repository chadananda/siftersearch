// Deep reports (Chad 11-03): when Jev's triage says depth = deep_report, deep research runs as a JOB on the deep-research
// worker queue (never inline); the finished record becomes a report (JSON + HTML/markdown/text) sent by mail. Chat offers
// it; Jev reads acceptance from the history (triage accepts_offer), never a word rule. Deps: deep-research.js, services/email.js.
// DELIVERY (Chad 11-03, launch): a report is never sent from tower. It goes to the report OUTBOX; the Worker's mail system
// pulls it (GET /api/v1/anis/outbox, worker/mail/drafting.js reportDrafts) and stores it as a draft Chad approves.
// ANIS_REPORT_SEND=direct (off by default) restores sending straight from tower after the launch period.
import { mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

export const REPORT_TEXT = {
  offer: 'This question deserves more than one reply can hold, so I have begun a fuller report across the library. Would you like me to email it to you when it is ready?',
  askEmail: 'Gladly. What email address should I send the report to?',
  ready: (email) => `The report is ready. I will send it to ${email} shortly.`,
  queued: (email) => `The report is still being prepared. I will send it to ${email} when it is finished.`,
  emailFollows: 'A fuller report on this question is being prepared, and I will send it to you in a separate letter when it is finished.',
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const parse = (j, d) => { if (j && typeof j === 'object') return j; try { return JSON.parse(j) ?? d; } catch { return d; } };

/** An email address the reader typed (structure only: a token with one @ and a dotted domain). */
export function emailIn(text) {
  for (const raw of String(text || '').split(/\s+/)) {
    const t = raw.replace(/^[<("'[]+|[>)"'\].,;:!?]+$/g, '');
    const at = t.indexOf('@');
    if (at < 1 || at !== t.lastIndexOf('@')) continue;
    const domain = t.slice(at + 1);
    if (domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')) return t;
  }
  return null;
}

/** Pending offers, by conversation: { researchId, question, at }. File-backed so any API instance reads it. */
export function offerStore(dir = process.env.VITEST ? mkdtempSync(join(tmpdir(), 'anis-offers-')) : join(process.cwd(), 'data', 'anis', 'report-offers')) {
  const file = (k) => join(dir, `${createHash('sha256').update(String(k)).digest('hex').slice(0, 32)}.json`);
  return {
    async get(k) { try { return JSON.parse(readFileSync(file(k), 'utf8')); } catch { return null; } },
    async set(k, v) { mkdirSync(dir, { recursive: true }); writeFileSync(file(k), JSON.stringify({ ...v, at: v.at ?? new Date().toISOString() })); },
    async del(k) { rmSync(file(k), { force: true }); },
  };
}

/** Reports waiting for the Worker to draft them for Chad's approval. File-backed, one file per key; ack removes it. */
export function reportOutbox(dir = process.env.VITEST ? mkdtempSync(join(tmpdir(), 'anis-outbox-')) : join(process.cwd(), 'data', 'anis', 'report-outbox')) {
  const file = (k) => join(dir, `${createHash('sha256').update(String(k)).digest('hex').slice(0, 32)}.json`);
  return {
    async put(m) { mkdirSync(dir, { recursive: true }); writeFileSync(file(m.key), JSON.stringify({ ...m, at: m.at ?? new Date().toISOString() })); },
    async list() {
      let names = []; try { names = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
      return names.map((f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean)
        .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    },
    async ack(k) { const f = file(k); if (!existsSync(f)) return false; rmSync(f, { force: true }); return true; },
  };
}

const sourceUrl = (q) => (q.source_url && q.external_para_id ? `${q.source_url.replace(/\/?$/, '/')}?paraId=${q.external_para_id}` : q.source_url || null);

/** A completed deep_research record → the report JSON (null until complete). Citations are numbered linked passages. */
export function buildReport(rec) {
  if (!rec || rec.status !== 'complete') return null;
  const summary = parse(rec.summary_json, {}) || {};
  const citations = [];
  const sections = (parse(rec.sections_json, []) || []).filter((s) => s?.quotes?.length).map((s) => ({
    heading: s.label || s.heading || '', summary: s.summary || '',
    passages: s.quotes.map((q) => {
      const ref = citations.length + 1;
      citations.push({ ref, title: q.source_title || null, author: q.source_author || null, url: sourceUrl(q), para_id: q.para_id ?? null, tradition: q.tradition ?? null });
      return { ref, text: q.excerpt || '', note: q.contextual_note || null };
    }),
  }));
  return { id: rec.id, title: rec.canonical_question, question: rec.canonical_question, summary: summary.overview || '', sections, citations,
    status: rec.status, completed_at: rec.completed_at ?? null };
}

/** The report as an email: { subject, html (inner body; sendEmail wraps it), markdown (an email reply), text }. */
export function renderReport(r) {
  const cite = (ref) => r.citations[ref - 1];
  const label = (c) => [c.author, c.title].filter(Boolean).join(', ') || 'Source';
  const html = [`<h1>${esc(r.title)}</h1>`, r.summary ? `<p>${esc(r.summary)}</p>` : '',
    ...r.sections.map((s) => [`<h2>${esc(s.heading)}</h2>`, s.summary ? `<p>${esc(s.summary)}</p>` : '',
      ...s.passages.map((p) => { const c = cite(p.ref); return `<blockquote><p>${esc(p.text)}</p><p>${c.url ? `<a href="${esc(c.url)}">${esc(label(c))}</a>` : esc(label(c))}</p></blockquote>`; })].join('\n'))].join('\n');
  const markdown = [`# ${r.title}`, r.summary, ...r.sections.flatMap((s) => [`## ${s.heading}`, s.summary,
    ...s.passages.map((p) => { const c = cite(p.ref); return `> ${p.text}\n>\n> ${c.url ? `[${label(c)}](${c.url})` : label(c)}`; })])].filter(Boolean).join('\n\n');
  const text = [r.title, r.summary, ...r.sections.flatMap((s) => [s.heading.toUpperCase(), s.summary,
    ...s.passages.map((p) => { const c = cite(p.ref); return `"${p.text}"\n  ${label(c)}${c.url ? ` ${c.url}` : ''}`; })])].filter(Boolean).join('\n\n');
  return { subject: `Report: ${r.title}`, html, markdown, text };
}

/** The strategy (tools.js deep_report): queue the job, return at once. ctx.request = (question) → { id, status }. */
export async function startDeepReport(input = {}, ctx = {}) {
  const question = String(input.question || '').trim();
  if (!question) return null;
  const request = ctx.request || (await import('../deep-research.js')).requestDeepResearch;
  const r = await request(question);
  return r ? { researchId: r.id, status: r.status } : null;
}

/** Reports service. Every dependency is injectable; defaults are the live repo, queue and mail. */
export function makeReports({ request, load, sendMail, addNotify, pending, mark, store = offerStore(), outbox = reportOutbox(), mode = process.env.ANIS_REPORT_SEND } = {}) {
  const dr = () => import('../deep-research.js');
  const get = async (id) => (load ? load(id) : (await dr()).getDeepResearchById(id));
  const mail = async (m) => (sendMail ? sendMail(m) : (await import('../../services/email.js')).sendEmail(m));
  const report = async (id) => buildReport(await get(id));
  // default: an approval draft for the Worker (text = the report's Markdown, which the review page edits and re-renders)
  const send = async (rep, email) => {
    const { subject, html, text, markdown } = renderReport(rep);
    if (mode === 'direct') { await mail({ to: email, subject, html, text }); return 'sent'; }
    await outbox.put({ key: `report-${rep.id}-${String(email).toLowerCase()}`, research_id: rep.id, to: email, subject, html, text: markdown });
    return 'drafted';
  };
  return {
    report,
    start: (question) => startDeepReport({ question }, request ? { request } : {}),
    offer: (key, v) => store.set(key, v),
    pending: (key) => store.get(key),
    clear: (key) => store.del(key),
    /** Finished → an approval draft (or, with ANIS_REPORT_SEND=direct, a send); else record the address for the worker. */
    async deliver({ researchId, email }) {
      const rep = await report(researchId);
      if (rep) { const how = await send(rep, email); return { ready: true, [how]: true, report: rep }; }
      await (addNotify ? addNotify(researchId, email) : (await dr()).addNotifyEmail(researchId, email));
      return { queued: true };
    },
    /** The worker, after a job completes: draft (or send) for every waiting address, then mark them. Returns how many. */
    async sendPending(researchId) {
      const rep = await report(researchId);
      if (!rep) return 0;
      const rows = await (pending ? pending(researchId) : (await dr()).getPendingNotifications(researchId));
      const done = [];
      for (const row of rows || []) { try { await send(rep, row.email); done.push(row.id); } catch { /* left pending: the next completion pass retries */ } }
      if (done.length) await (mark ? mark(done) : (await dr()).markNotificationsSent(done));
      return done.length;
    },
  };
}

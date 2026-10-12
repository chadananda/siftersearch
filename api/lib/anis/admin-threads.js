// Anís Threads (admin, Chad 10-12: "follow all Anís threads, including the conclusion summary of the quality of each
// post … audit each interaction to determine if a better search strategy was warranted"). Joins the conversations
// (anis-threads-repo) with the strategy auditor's verdicts (audit-store-repo; written by scripts/audit/audit-exchanges.mjs)
// and names email correspondents from the mail store (participant ids are address hashes). Deps injected for tests.
import { auditsFor } from '../repos/audit-store-repo.js';
import { emailHash } from './pause-link.js';

const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

/** Was a better search strategy warranted? The auditor's own fields: a wrong/acceptable choice, a different best one,
 *  or a request no strategy in the catalogue serves (new_strategy.suggested). */
export function strategyFlag(v) {
  if (!v) return { warranted: false, why: null };
  const why = [];
  if (v.strategy_verdict && v.strategy_verdict !== 'right') why.push(`strategy ${v.strategy_verdict}`);
  if (v.best_strategy && v.strategy_used && v.best_strategy !== v.strategy_used) why.push(`${v.strategy_used} → ${v.best_strategy}`);
  if (v.new_strategy?.suggested) why.push(`new strategy: ${v.new_strategy.need || 'unmet need'}`);
  return { warranted: why.length > 0, why: why.join('; ') || null };
}

/** One reply's audit, flattened for the page. */
export function auditView(a) {
  if (!a) return { state: 'pending' };
  if (a.status !== 'done' || !a.v) return { state: 'error', error: a.error || null };
  const v = a.v, flag = strategyFlag(v);
  // the model sometimes returns the problems array JSON-encoded as a string (10-12: "2,702 problems" = characters)
  let problems = v.problems;
  if (typeof problems === 'string') { try { problems = JSON.parse(problems); } catch { problems = [{ where: 'reply', kind: 'other', detail: problems }]; } }
  if (!Array.isArray(problems)) problems = [];
  return { state: 'done', audited_at: a.audited_at, summary: v.summary || null, strategy_used: v.strategy_used, strategy_verdict: v.strategy_verdict,
    best_strategy: v.best_strategy, better_strategy_warranted: flag.warranted, why: flag.why, answered: v.evidence?.answered, cause: v.evidence?.cause,
    format_fit: v.format_verdict?.fit, better_format: v.format_verdict?.better, problems, new_strategy: v.new_strategy || null,
    data_gap: v.data_gap?.found ? v.data_gap.detail || 'yes' : null, reader_feedback: v.reader_feedback?.present ? v.reader_feedback : null };
}

/** participant id ("email:<hash>") → { email, name } from the mail store's correspondents. */
let peopleCache = { at: 0, map: null };
export async function mailPeople({ fetchImpl = fetch, base = 'https://siftersearch.com', key = process.env.INTERNAL_API_KEY, fresh = false } = {}) {
  if (!fresh && peopleCache.map && Date.now() - peopleCache.at < 10 * 60 * 1000) return peopleCache.map;
  const map = new Map();
  if (!key) return map;
  try {
    const r = await fetchImpl(`${base}/_mail/messages?mailbox=anis&direction=in&limit=500`, { headers: { 'x-internal-key': key }, signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    for (const m of j.messages || (Array.isArray(j) ? j : [])) if (m.from_addr) map.set(`email:${emailHash(m.from_addr)}`, { email: m.from_addr, name: m.from_name || null });
    if (map.size) peopleCache = { at: Date.now(), map };
  } catch (err) { console.warn(`anis threads: correspondents' names unavailable (${err.message})`); }   // names are a convenience
  return map;
}

const personOf = (pid, people) => (pid && people.get(pid)) || (pid?.startsWith('email:') ? { email: null, name: 'email correspondent' } : { email: null, name: pid ? 'web visitor' : 'unknown' });

/** The thread list with each thread's audit roll-up. filter: all | strategy (better strategy warranted) | problems | pending */
export async function threadsOverview({ listThreads, audits = auditsFor, people = mailPeople }, { days = 30, filter = 'all' } = {}) {
  const rows = await listThreads({ days });
  const ids = rows.flatMap((t) => String(t.reply_ids || '').split(',').map(Number).filter(Boolean));
  const [byId, who] = [audits(ids), await people()];
  const threads = rows.map((t) => {
    const views = String(t.reply_ids || '').split(',').map(Number).filter(Boolean).map((id) => auditView(byId.get(id)));
    const done = views.filter((v) => v.state === 'done');
    return {
      id: t.id, channel: t.channel, title: t.title || null, first_question: (t.first_question || '').slice(0, 240), started_at: t.started_at, last_at: t.last_at,
      person: personOf(t.participant_id, who), replies: t.replies, audited: done.length, pending: views.filter((v) => v.state === 'pending').length,
      better_strategy: done.filter((v) => v.better_strategy_warranted).length, problems: done.reduce((n, v) => n + v.problems.length, 0),
      not_answered: done.filter((v) => v.answered === 'no' || v.answered === 'partly').length,
      latest_summary: [...done].reverse().find((v) => v.summary && v.summary !== 'fine')?.summary || (done.length ? 'fine' : null),
    };
  });
  const keep = { strategy: (t) => t.better_strategy > 0, problems: (t) => t.problems > 0 || t.not_answered > 0, pending: (t) => t.pending > 0 }[filter];
  const totals = { threads: threads.length, replies: threads.reduce((n, t) => n + t.replies, 0), audited: threads.reduce((n, t) => n + t.audited, 0),
    better_strategy: threads.reduce((n, t) => n + t.better_strategy, 0), problems: threads.reduce((n, t) => n + t.problems, 0) };
  return { days, filter, totals, threads: keep ? threads.filter(keep) : threads };
}

/** One thread: every round (question → reply) with the route taken and its audit. */
export async function threadDetail({ thread, messages, audits = auditsFor, people = mailPeople }, sessionId) {
  const t = await thread(sessionId);
  if (!t) return null;
  const rows = await messages(sessionId);
  const replies = rows.filter((r) => r.role === 'assistant');
  const [byId, who] = [audits(replies.map((r) => r.id)), await people()];
  const rounds = new Map();
  for (const r of rows) {
    const k = r.round_index;
    if (!rounds.has(k)) rounds.set(k, { round: k, question: null, reply: null });
    const e = rounds.get(k);
    if (r.role === 'user') e.question ??= { text: r.content, at: r.created_at };
    else {
      const p = safeJson(r.path_json) || {};
      e.reply = { id: r.id, text: r.content, status: r.status, at: r.answered_at || r.created_at, channel: r.channel,
        route: { gate: p.gate || null, strategy: p.recipe || p.plan?.shape || null, format: p.format?.id || null, retrieved: p.retrieved ?? p.passages ?? null },
        audit: auditView(byId.get(Number(r.id))) };
    }
  }
  return { id: t.id, channel: t.channel, title: t.title, started_at: t.started_at, last_activity: t.last_activity, person: personOf(t.participant_id, who), rounds: [...rounds.values()] };
}

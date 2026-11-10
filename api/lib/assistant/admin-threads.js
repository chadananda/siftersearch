// Anís Threads (admin, Chad 10-12: "follow all Anís threads, including the conclusion summary of the quality of each
// post … audit each interaction to determine if a better search strategy was warranted"). Joins the conversations
// (anis-threads-repo) with the strategy auditor's verdicts (audit-store-repo; written by scripts/audit/audit-exchanges.mjs)
// and names email correspondents from the mail store (participant ids are address hashes). Deps injected for tests.
import { auditsFor } from '../repos/audit-store-repo.js';
import fs from 'fs';
import { emailHash } from './pause-link.js';
import { turnType } from './turn-meta.js';
import { conversationTotals } from './progress.js';
import { sourceTier } from './source-tier.js';
import { expandTrace, hitDocIds } from '../search-trace.js';

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

/** participant id ("email:<hash>") → { email, name } from the mail store's correspondents.
 *  10-14 (Chad: "you show each item as 'email correspondent' but do not say who"): one slow fetch under load left the
 *  whole list nameless, because a failure cached nothing. Now the last good list is kept — in memory and on disk — and a
 *  failed refresh serves it; only a never-seen address falls back to its short hash. */
let peopleCache = { at: 0, map: null };
const PEOPLE_FILE = process.env.ANIS_PEOPLE_CACHE || 'data/anis-correspondents.json';
function loadPeopleFile() {
  try { return new Map(Object.entries(JSON.parse(fs.readFileSync(PEOPLE_FILE, 'utf8')))); } catch { return null; }
}
function savePeopleFile(map) {
  try { fs.writeFileSync(PEOPLE_FILE, JSON.stringify(Object.fromEntries(map))); } catch { /* the in-memory copy still serves */ }
}
export async function mailPeople({ fetchImpl = fetch, base = 'https://siftersearch.com', key = process.env.INTERNAL_API_KEY, fresh = false, persist = true } = {}) {
  // the file is shared by every API process (pm2 cluster) and fed by rememberCorrespondent, so read it on every call
  const known = new Map([...(persist ? loadPeopleFile() || [] : []), ...(peopleCache.map || [])]);
  if (!fresh && peopleCache.map && Date.now() - peopleCache.at < 10 * 60 * 1000) return known;
  if (!key) return known;
  try {
    const r = await fetchImpl(`${base}/_mail/messages?mailbox=anis&direction=in&limit=500`, { headers: { 'x-internal-key': key }, signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const map = new Map(known);                              // addresses that aged out of the last 500 keep their names
    for (const m of j.messages || (Array.isArray(j) ? j : [])) if (m.from_addr) map.set(`email:${emailHash(m.from_addr)}`, { email: m.from_addr, name: m.from_name || known.get(`email:${emailHash(m.from_addr)}`)?.name || null });
    if (map.size) { peopleCache = { at: Date.now(), map }; if (persist) savePeopleFile(map); }
    return map;
  } catch (err) {
    console.warn(`anis threads: correspondents' names unavailable (${err.message}); serving the last known list`);
    peopleCache = { at: Date.now() - 9 * 60 * 1000, map: known };   // retry in a minute, not on every view
    return known;
  }
}

/** Record an email correspondent locally when Anís answers them (routes/assistant-mail.js) — names never wait on the
 *  network (10-14: the tower→mail-store fetch timed out and a whole list read "unknown address"). */
export function rememberCorrespondent(email, name = null, { persist = true } = {}) {
  if (!email) return;
  const pid = `email:${emailHash(email)}`;
  const map = new Map([...(persist ? loadPeopleFile() || [] : []), ...(peopleCache.map || [])]);
  if (map.get(pid)?.email === email && (map.get(pid)?.name || !name)) return;
  map.set(pid, { email: String(email).trim().toLowerCase(), name: name || map.get(pid)?.name || null });
  peopleCache = { at: peopleCache.at, map };
  if (persist) savePeopleFile(map);
}
export const _resetPeople = () => { peopleCache = { at: 0, map: null }; };

export const personOf = (pid, people) => (pid && people.get(pid))
  || (pid?.startsWith('email:') ? { email: null, name: `unknown address ${pid.slice(6, 12)}` } : { email: null, name: pid ? 'web visitor' : 'unknown' });

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
// ── search introspection (Chad 11-04: "no reason you should have to write code to check search history") ──────────────────
/** A turn's traced searches (search_trace rows) → [{ trace_id, endpoint, tool, step, query, filters, ms, results, hits (top n, titled) }]. */
export function searchesView(rows = [], titles = new Map(), n = 10) {
  return rows.map((r) => {
    const x = expandTrace(r, titles);
    return { trace_id: x.trace_id, at: x.created_at ?? null, endpoint: x.endpoint, tool: x.tool ?? null, step: x.step ?? null, route: x.route ?? null,
      parent: x.parent_trace ?? null, query: x.query, filters: x.filters, ms: x.total_ms, results: x.result_count, top1_layer: x.top1_layer,
      hits: (x.hits || []).slice(0, n) };
  });
}
/** The passages the writer had (path.evidence) with their standing, and which of them the reply cites (its link is in the text). */
export function writerView(evidence = [], replyText = '') {
  const text = String(replyText || '');
  const writer_passages = (evidence || []).map((e, i) => {
    let tier = null;
    try { tier = sourceTier({ author: e.author, title: e.title, religion: e.religion }); } catch { tier = null; }
    return { n: i + 1, title: e.title ?? null, author: e.author ?? null, url: e.url ?? null, tier, cited: !!(e.url && text.includes(e.url)) };
  });
  return { writer_passages, cited: writer_passages.filter((p) => p.cited).map(({ n, title, author, url, tier }) => ({ n, title, author, url, tier })) };
}
const byTurn = (rows = []) => rows.reduce((m, r) => { if (r.turn_id) (m.get(r.turn_id) || m.set(r.turn_id, []).get(r.turn_id)).push(r); return m; }, new Map());
/** "<thread>:<round>" → { thread, round } (thread ids may hold ':'; the round is after the last one). */
export const parseTurnId = (id) => { const s = String(id || ''); const i = s.lastIndexOf(':'); const round = Number(s.slice(i + 1));
  return i > 0 && Number.isInteger(round) ? { thread: s.slice(0, i), round } : null; };

/**
 * ONE turn, fully: the question, the route, every search it made (top 20 each, titled), the writer's passages and what the
 * reply cites. deps: { thread, messages, traces(turnId), titles(ids) }.
 */
export async function turnTrace({ thread, messages, traces, titles }, turnId) {
  const k = parseTurnId(turnId);
  if (!k) return null;
  const t = await thread(k.thread);
  if (!t) return null;
  const rows = (await messages(k.thread)).filter((r) => Number(r.round_index) === k.round);
  const q = rows.find((r) => r.role === 'user'), a = rows.find((r) => r.role === 'assistant');
  const tr = await traces(String(turnId));
  const names = await titles(hitDocIds(tr)).catch(() => new Map());
  const p = safeJson(a?.path_json) || {};
  return { turn: String(turnId), thread: k.thread, round: k.round, question: q?.content ?? null, reply: a?.content ?? null, status: a?.status ?? null,
    route: { gate: p.gate || null, kind: p.kind || null, strategy: p.recipe || p.plan?.shape || null, plan: p.plan || null },
    // Jev's decisions for the turn (strategy, refers-back, lookup kind, sides, side books, named units), without what he saw
    decisions: (Array.isArray(p.decisions) ? p.decisions : []).map((d) => ({ point: d.point, by: d.by, chosen: d.chosen, probabilities: d.probabilities ?? null, reason: d.reason ?? null })),
    // the strategy graph's steps with their wall ms (round 4: a 14 s prayer retrieval had no stage below 'planned-search' to blame)
    ...(Array.isArray(p.steps) && p.steps.length ? { steps: p.steps.map((x) => ({ graph: x.graph ?? null, node: x.node, step: x.step, ms: x.ms ?? null, edge: x.edge ?? null })) } : {}),
    searches: searchesView(tr, names, 20), ...writerView(p.evidence, a?.content) };
}

export async function threadDetail({ thread, messages, audits = auditsFor, people = mailPeople, traces = null, titles = null }, sessionId) {
  const t = await thread(sessionId);
  if (!t) return null;
  const rows = await messages(sessionId);
  const replies = rows.filter((r) => r.role === 'assistant');
  const [byId, who] = [audits(replies.map((r) => r.id)), await people()];
  // the thread's searches (one indexed read), grouped by turn; titles for their ranked lists in one more
  const traced = traces ? await traces(sessionId).catch(() => []) : [];
  const turns = byTurn(traced);
  const names = traced.length && titles ? await titles(hitDocIds(traced)).catch(() => new Map()) : new Map();
  const rounds = new Map();
  for (const r of rows) {
    const k = r.round_index;
    if (!rounds.has(k)) rounds.set(k, { round: k, question: null, reply: null });
    const e = rounds.get(k);
    if (r.role === 'user') e.question ??= { text: r.content, at: r.created_at };
    else {
      const p = safeJson(r.path_json) || {};
      e.reply = { id: r.id, text: r.content, status: r.status, at: r.answered_at || r.created_at, channel: r.channel,
        route: { gate: p.gate || null, strategy: p.recipe || p.plan?.shape || null, format: p.format?.id || null, retrieved: p.retrieved ?? p.passages ?? null,
          // Jev's depth sets the length frame (150–250 words vs 500–900) and the reply cap: a short reply is traced to it (11-04)
          ...(p.triage?.depth ? { depth: p.triage.depth, depth_confidence: p.triage.depth_confidence ?? null } : {}),
          ...(p.plan ? { plan: p.plan } : {}),   // every route, not only Jev-planned ones (r5: source/term/language turns showed no history_turns)
          ...(p.timeline?.length ? { timeline: p.timeline, llm: p.llm || [], search_detail: p.search_detail || null } : {}),   // how the strategy was chosen: jev | jev:cached | backstop + reason
          ...(p.evidence?.length ? { evidence: p.evidence } : {}) },   // the passages the writer had (title, author, url, text ≤1200): answer-stage defects are traced against them (r9)
        // per round: the searches it made (top 10 each), the writer's passages with their standing, and what the reply cites
        ...(traces ? { searches: searchesView(turns.get(`${sessionId}:${k}`) || [], names, 10), ...writerView(p.evidence, r.content) } : {}),
        audit: auditView(byId.get(Number(r.id))),
        // type · models · usd · latency (turn-meta.js; turns before 10-22 carry no meter → type and latency only)
        meta: p.meta || { type: turnType({ status: r.status, gate: p.gate, kind: p.kind, recipe: p.recipe, format: p.format?.id ?? p.format }), models: [], usd: null,
          latency_ms: p.timings?.total_ms ?? null } };
    }
  }
  return { id: t.id, channel: t.channel, title: t.title, started_at: t.started_at, last_activity: t.last_activity, person: personOf(t.participant_id, who), rounds: [...rounds.values()],
    // time and cost of the whole conversation (sum of its rounds' meta)
    totals: conversationTotals([...rounds.values()].map((e) => e.reply).filter(Boolean)) };
}

/** The audits as a WORK QUEUE (Chad 10-12: "whatever the audits identify as a useful extension for our search strategies is
 *  our highest priority"): strategy switches the auditor asked for, unmet needs (new strategies), why answers fell short,
 *  data gaps and problem kinds — each ranked by frequency, with up to 5 threads to read. Pure over audit rows. */
export function strategyGaps(rows = []) {
  const done = rows.filter((r) => r.status === 'done' && r.v);
  const bump = (m, key, r, extra) => {
    if (!key) return;
    const e = m.get(key) || { key, n: 0, threads: [], ...extra };
    e.n++; if (r.session_id && !e.threads.includes(r.session_id) && e.threads.length < 5) e.threads.push(r.session_id);
    m.set(key, e);
  };
  const switches = new Map(), needs = new Map(), causes = new Map(), gaps = new Map(), problems = new Map();
  for (const r of done) {
    const v = r.v;
    if (v.best_strategy && v.strategy_used && v.best_strategy !== v.strategy_used) bump(switches, `${v.strategy_used} → ${v.best_strategy}`, r);
    if (v.new_strategy?.suggested) bump(needs, String(v.new_strategy.need || 'unnamed need').trim(), r, { route: v.new_strategy.route || null });
    if (v.evidence?.answered && !['fully', 'not-applicable'].includes(v.evidence.answered)) bump(causes, v.evidence.cause || 'other', r);
    if (v.data_gap?.found) bump(gaps, String(v.data_gap.detail || 'unnamed').trim(), r);
    let ps = v.problems;
    if (typeof ps === 'string') { try { ps = JSON.parse(ps); } catch { ps = []; } }
    for (const p of Array.isArray(ps) ? ps : []) bump(problems, `${p.where || '?'} · ${p.kind || 'other'}`, r);
  }
  const ranked = (m, n = 15) => [...m.values()].sort((a, b) => b.n - a.n).slice(0, n);
  return { audited: done.length, warranted: done.filter((r) => strategyFlag(r.v).warranted).length,
    switches: ranked(switches), needs: ranked(needs, 30), shortfalls: ranked(causes), data_gaps: ranked(gaps, 30), problems: ranked(problems) };
}

/** THE DAILY DIGEST's conversations (Chad 10-19: "replicate [Jafar's daily digest] for Anis … follow conversations early on
 *  to head off poor answers"): every round answered in the last `hours`, grouped by person, each with its audit — the
 *  reviewer's own (test) questions left out. → { hours, people: [{ person, channel, rounds: [{ at, question, reply, status,
 *  route, audit }] }] } */
export async function digestConversations({ listThreads, thread, messages, audits = auditsFor, people = mailPeople }, { hours = 24, exclude = [], until = null } = {}) {
  const end = until ? Date.parse(until) : Date.now();
  const since = end - hours * 3600e3;
  const at = (s) => Date.parse(String(s || '').replace(' ', 'T') + (/[zZ+]/.test(String(s)) ? '' : 'Z'));
  const rows = await listThreads({ days: Math.ceil((Date.now() - since) / 86400e3) + 1, limit: 500 });
  const skip = new Set(exclude.map((e) => String(e).toLowerCase()));
  const out = [];
  for (const t of rows) {
    if (at(t.last_at) < since) continue;   // (a thread active after `end` may still hold rounds inside the window)
    const d = await threadDetail({ thread, messages, audits, people }, t.id);
    if (!d || (d.person?.email && skip.has(d.person.email.toLowerCase()))) continue;
    const rounds = d.rounds.filter((r) => r.reply && at(r.reply.at) >= since && at(r.reply.at) < end).map((r) => ({ at: r.reply.at, asked_at: r.question?.at || null,
      question: r.question?.text || '', reply: r.reply.text, status: r.reply.status, channel: r.reply.channel || d.channel, route: r.reply.route, audit: r.reply.audit, meta: r.reply.meta }));
    if (rounds.length) out.push({ thread: d.id, person: d.person, channel: d.channel, rounds });
  }
  return { hours, people: out };
}

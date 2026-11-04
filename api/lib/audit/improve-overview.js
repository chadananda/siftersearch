// improve-overview — GET /api/admin/anis/improve-overview's shape (the progress page, AnisImprove.svelte): is Anís getting better,
// what the loop is doing, what changed, what is under test, what waits for Claude Code. Pure: the route passes repo reads
// (improve-repo improveOverviewData, the strategy promotion ledger, untried candidates, gap counts, the improve cap, the worker's
// heartbeat). The state and sentence are deterministic. No question text anywhere (rows carry ids and trace links only).
import { rankImprovements, scenariosOf } from './improve.js';
import { targetClass, targetOf } from './improve-targets.js';
import { runStateOf } from './behavior-proposal.js';

const DAY = 86400000;
const MIN_SCORED = 5;             // fewer scored items than this → no score for the window (the weak rate stands in)
const SCORE_STEP = 0.3, WEAK_STEP = 0.03;
const msOf = (s) => (s ? Date.parse(`${String(s).replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'}`) : NaN);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const winScore = (w) => (w && w.score_n >= MIN_SCORED ? r2(w.score_sum / w.score_n) : null);
const winWeak = (w) => (w && w.judged ? r3(w.weak / w.judged) : null);

/** improving | steady | worse | stalled | idle — stalled: work waits but nothing was judged in the last hour; idle: nothing waits,
 *  nothing under test, nothing judged in the last hour; otherwise the 7-day score vs the 7 before (±0.3), else the weak rate (±3 pts). */
export function overviewState({ backlog = 0, judged_last_hour = 0, testing_now = 0, score_7d = null, score_prev_7d = null, weak_rate_7d = null, weak_rate_prev_7d = null }) {
  if (backlog > 0 && !judged_last_hour) return 'stalled';
  if (!backlog && !testing_now && !judged_last_hour) return 'idle';
  if (score_7d != null && score_prev_7d != null) {
    const d = score_7d - score_prev_7d;
    return d >= SCORE_STEP ? 'improving' : d <= -SCORE_STEP ? 'worse' : 'steady';
  }
  if (weak_rate_7d != null && weak_rate_prev_7d != null) {
    const d = weak_rate_7d - weak_rate_prev_7d;
    return d <= -WEAK_STEP ? 'improving' : d >= WEAK_STEP ? 'worse' : 'steady';
  }
  return 'steady';
}

/** Why the loop is stalled, when it can be told: the improve cap, a silent worker, or the worker's own spend-cap wait. */
export function stallReason({ cap = null, heartbeat = null } = {}) {
  if (cap?.blocking) return `improve spend cap reached ($${r2(cap.spent_usd)} of $${r2(cap.cap_usd)})`;
  if (!heartbeat) return 'improve worker not reporting';
  if (heartbeat.health === 'silent') return 'improve worker silent';
  if (heartbeat.state?.doing === 'spend-cap wait') return 'waiting on a spend cap';
  return null;
}

const examplesOf = (keys, evidence) => [...keys].reverse().map((k) => {
  const e = evidence.get(k); if (!e) return null;
  return { trace: e.turn_id ? `/api/admin/anis/turns/${encodeURIComponent(e.turn_id)}/trace` : e.kind === 'search' ? `/api/admin/search-trace/${encodeURIComponent(e.ref_id)}` : null,
    thread: e.session_id ? `/admin/anis#threads:${encodeURIComponent(e.session_id)}` : null };
}).filter((x) => x && (x.trace || x.thread)).slice(0, 3);

/** Promotion-ledger rows → timeline entries (promote, rollback; a reject reads "tried, kept current"). Dry runs are not changes. */
export function strategyChanges(promotions = []) {
  return promotions.filter((p) => ['promote', 'reject', 'rollback'].includes(p.action)).map((p) => {
    const n = p.decision?.numbers || {};
    return { at: p.created_at, kind: 'strategy', strategy: p.strategy_id, version: p.version, from_version: p.parent_version ?? null,
      verdict: p.action === 'promote' ? 'promoted' : p.action === 'reject' ? 'kept current' : 'rolled back',
      before: p.action === 'rollback' ? null : r2(n.mean_current), after: p.action === 'rollback' ? null : r2(n.mean_candidate), n: n.n_class ?? null,
      reason: p.action === 'reject' ? (p.decision?.failed?.[0] ?? null) : p.action === 'rollback' ? (p.decision?.restored != null ? `restored v${p.decision.restored}` : null) : null,
      change: p.change ?? null };
  });
}

/** Decision-theory ledger rows (jev-theories-repo listTheories) → timeline entries: tested theories (won | lost) with the accuracy
 *  before/after on the gate's frozen sets and their sizes; a won theory says whether its candidate was promoted (shipped). */
export function theoryChanges(theories = []) {
  return theories.filter((t) => ['won', 'lost'].includes(t.verdict)).map((t) => {
    const n = t.result || {};
    return { at: t.created_at, kind: 'theory', id: t.id, gate: t.gate, theory: t.theory?.kind ?? t.kind ?? null, verdict: t.verdict === 'won' ? (n.promoted ? 'shipped' : 'won, not promoted') : 'lost',
      before: r3(n.before), after: r3(n.after), n_historic: n.n_historic ?? null, n_synthetic: n.n_synthetic ?? null, broken: n.broken ?? null,
      strategy: t.strategy_id ?? null, version: t.version ?? null, reason: t.verdict === 'lost' ? (n.failed?.[0] ?? null) : n.promoted ? null : (n.promotion_failed?.[0] ?? null),
      change: t.theory?.what ?? n.label ?? null };
  });
}

/** Per Jev gate: Jev's accuracy on its frozen sets (historic + synthetic) from the newest tested theory — the shipped variant's
 *  accuracy when it shipped, else the baseline's. → [{ gate, accuracy, n, at }] */
export function gateAccuracy(theories = []) {
  const out = new Map();
  for (const t of [...theories].sort((a, b) => (msOf(b.created_at) || 0) - (msOf(a.created_at) || 0))) {
    const n = t.result || {};
    if (!['won', 'lost'].includes(t.verdict) || out.has(t.gate) || n.before == null) continue;
    out.set(t.gate, { gate: t.gate, accuracy: r3(t.verdict === 'won' && n.promoted ? n.after : n.before), n: (n.n_historic || 0) + (n.n_synthetic || 0), at: t.created_at });
  }
  return [...out.values()];
}

/** The cost ladder (code → jev → llm-fast) over the registered activities (catalog rows with `tier`). Shares by count of
 *  activities, not by calls or dollars (llm_fast_usd_share stays null until per-tier spend is attributed). */
export function ladderShares(ladder = []) {
  const n = ladder.length;
  const count = (t) => ladder.filter((a) => a.tier === t).length;
  return { activities: n, by_tier: { code: count('code'), jev: count('jev'), 'llm-fast': count('llm-fast') },
    jev_code_share: n ? r3((count('code') + count('jev')) / n) : null, llm_fast_share: n ? r3(count('llm-fast') / n) : null, llm_fast_usd_share: null,
    llm_fast: ladder.filter((a) => a.tier === 'llm-fast').map((a) => a.name) };
}

/**
 * input: { data: improveOverviewData() | null, promotions: ledger rows (+ parent_version, change), candidates: untried candidates
 * [{ id, version, created_at, change }], gaps: { open, designed }, cap: capStatus() row for 'improve', heartbeat: readServices()
 * row for siftersearch-improve, theories: listTheories() rows (30 days), decisions: theoryCounts() (7 days), runs: behaviorRunStates(),
 * ladder: activityCatalog() rows, anisCap: capStatus() row for 'anis', now }. → { available, headline, flow, decisions, changes, testing, waiting, spend }
 */
export function improveOverview({ data = null, promotions = [], candidates = [], gaps = { open: 0, designed: 0 }, cap = null, heartbeat = null,
  theories = [], decisions = null, runs = new Map(), ladder = [], anisCap = null, now = Date.now() } = {}) {
  const d = data || { daily: [], w7: null, wprev: null, counts: {}, improvements: [], evidence: new Map() };
  const c = d.counts || {};
  const since7 = now - 7 * DAY;
  const in7 = (s) => msOf(s) >= since7;

  const byDay = new Map(d.daily.map((r) => [r.day, r]));
  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(now - (29 - i) * DAY).toISOString().slice(0, 10), r = byDay.get(day);
    return { day, judged: r?.judged || 0, weak_rate: r?.judged ? r3(r.weak / r.judged) : null, score: r && r.score_n ? r2(r.score_sum / r.score_n) : null };
  });
  const head = { score_7d: winScore(d.w7), score_prev_7d: winScore(d.wprev), weak_rate_7d: winWeak(d.w7), weak_rate_prev_7d: winWeak(d.wprev),
    judged_7d: d.w7?.judged || 0, judged_today: c.judged_today || 0, judged_last_hour: c.judged_last_hour || 0, backlog: c.backlog || 0 };

  const rows = d.improvements.map((r) => ({ ...r, target: r.target || targetOf(r), evidence: safeJson(r.evidence_json) || [] }));
  const code = rows.filter((r) => targetClass(r.target) === 'code'), dataRows = rows.filter((r) => targetClass(r.target) === 'data');
  const isOpen = (r) => ['open', 'accepted'].includes(r.status);
  const openCode = code.filter(isOpen);
  const changesS = strategyChanges(promotions);
  const s7 = changesS.filter((x) => in7(x.at));
  const promoted7 = s7.filter((x) => x.verdict === 'promoted'), kept7 = s7.filter((x) => x.verdict === 'kept current');
  const testing = candidates.map((x) => ({ strategy: x.id, version: x.version, since: x.created_at ?? null, change: x.change ?? null }));
  const ageH = (r) => (Number.isFinite(msOf(r.first_seen)) ? Math.round((now - msOf(r.first_seen)) / 3600000) : null);

  const flow = {
    judged: head.judged_7d, weak: d.w7?.weak || 0, diagnosed: c.diagnosed_7d || 0,
    data: { suggested: dataRows.filter((r) => in7(r.first_seen)).length, tested: promoted7.length + kept7.length, promoted: promoted7.length,
      rejected: kept7.length, testing_now: testing.length },
    code: { suggested: code.filter((r) => in7(r.first_seen)).length, open: openCode.length,
      done: code.filter((r) => r.status === 'done' && in7(r.status_at)).length, rejected: code.filter((r) => r.status === 'rejected' && in7(r.status_at)).length,
      oldest_open_hours: openCode.length ? Math.max(...openCode.map(ageH).filter((h) => h != null), 0) : null },
    gaps: { open: gaps.open || 0, designed: gaps.designed || 0 },
  };

  const state = overviewState({ ...head, testing_now: testing.length });
  const reason = state === 'stalled' ? stallReason({ cap, heartbeat }) : null;
  const deltas = promoted7.map((x) => (x.after != null && x.before != null ? x.after - x.before : null)).filter((x) => x != null);
  const meanDelta = deltas.length ? r2(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;
  const lead = { improving: 'Improving', steady: 'Learning', worse: 'Slipping', stalled: 'Stalled', idle: 'Idle' }[state];
  const first = state === 'stalled' ? `${plural(head.backlog, 'answer')} waiting, none judged in the last hour${reason ? ` (${reason})` : ''}`
    : `${plural(head.judged_today, 'answer')} judged today`;
  const sentence = `${lead}: ${first}; ${plural(flow.data.tested, 'strategy change')} tested this week, ${promoted7.length} promoted`
    + `${meanDelta != null ? ` (${meanDelta >= 0 ? '+' : ''}${meanDelta})` : ''}${testing.length ? `, ${testing.length} testing now` : ''}. `
    + `${plural(openCode.length, 'code behaviour')} waiting for Claude Code.`;

  const changesC = code.filter((r) => r.status === 'done' && r.status_at).map((r) => ({ at: r.status_at, kind: 'code', id: r.id,
    scenarios: scenariosOf(r), change: r.change, note: r.status_note ?? null, by: r.reviewed_by ?? null }));
  const changes = [...changesS, ...changesC, ...theoryChanges(theories)].sort((a, b) => (msOf(b.at) || 0) - (msOf(a.at) || 0)).slice(0, 30);

  const waiting = rankImprovements(openCode).map((r) => { const scenarios = scenariosOf(r), run = runStateOf(r.id, scenarios, runs);
    return { id: r.id, target: r.target, stage: r.stage, file: r.file ?? null, scenarios, change: r.change, evidence_n: r.evidence_n || 1, severity: r.severity || 1,
      age_hours: ageH(r), examples: examplesOf(r.evidence, d.evidence), run: scenarios.length ? run : null }; });
  const shares = ladderShares(ladder);
  const replies = c.replies_today || 0;

  return {
    available: !!data, generated_at: new Date(now).toISOString(),
    headline: { score_7d: head.score_7d, score_prev_7d: head.score_prev_7d, weak_rate_7d: head.weak_rate_7d, weak_rate_prev_7d: head.weak_rate_prev_7d,
      judged_7d: head.judged_7d, judged_today: head.judged_today, judged_last_hour: head.judged_last_hour, backlog: head.backlog, daily,
      status: { state, sentence, reason },
      // north star: the share of steps on the cheap rungs (code + Jev), Jev's accuracy per gate on its frozen sets, $ per Anís turn
      // today (anis spend group ÷ replies recorded today, battery turns included), the llm-fast share
      ladder: shares, gate_accuracy: gateAccuracy(theories),
      usd_per_turn: anisCap && replies ? r3((anisCap.spent_usd || 0) / replies) : null, replies_today: replies },
    flow, decisions: { theories_tested_7d: decisions?.theories_tested_7d ?? 0, shipped_7d: decisions?.shipped_7d ?? 0, synthetic_cases: decisions?.synthetic_cases ?? 0 },
    changes, testing, waiting,
    spend: { today_usd: r2(cap?.spent_usd ?? c.today_usd ?? 0), cap_usd: cap?.cap_usd ?? null, blocking: !!cap?.blocking },
  };
}

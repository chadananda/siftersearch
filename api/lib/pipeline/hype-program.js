// HyPE program: ops job `hype-program` (tier-ordered submit → collect loop on makeHypeBatch, one budget key, per-batch quality ledger,
// auto-pause against an explicit baseline, 1% grader) and report `hype-quality`. Params: tier, maxUsd, sampleRate, dryRun, setBaseline, resume …
// Spend: every call bills to `hype-program` (HyPE, disambiguation, grading, embeddings); ceiling HYPE_PROGRAM_USD_MONTH, pace month/30.
// A spent ceiling ends the run QUIETLY (status 'budget'); a quality pause ends it as phase 'stopped' (the act-now mail). Deps all injectable.
import { withAIContext } from '../ai-context.js';
import { HYPE_VERSION } from '../rag/enrich/retrieval.js';
import { TIER_ORDER, PASSES, selectTier, countTiers } from './hype-tiers.js';
import { createStore, measureDoc, sumAcc, rates, gradeSummary, compare, DEFAULT_MIN_SAMPLE } from './hype-ledger.js';

export const BUDGET_KEY = 'hype-program';
export const EST_USD_PER_REQUEST = 0.00018;   // measured 10-28: 38,275 batch requests = $6.94 (Haiku 5.5, Message Batches, 50% off)
export const EST_FORMULA = 'est $ = requests x $0.18 per 1000 (measured 10-28: 38,275 requests = $6.94); requests = pending paragraphs + extra slices for paragraphs over 4000 chars (ceil(chars/1500) each). HyPE batch only: disambiguation, grading and embeddings bill to the same key but are not in this estimate.';
export const DEFAULT_ROUND_PARAS = 10000, DEFAULT_SAMPLE_RATE = 0.01, DEFAULT_MAX_GRADE = 200;

export const monthlyUsd = (env = process.env) => { const v = Number(env.HYPE_PROGRAM_USD_MONTH); return Number.isFinite(v) && v > 0 ? v : 0; };

/** How much may still be spent now: the tightest of month ceiling, daily pace (month/30) and the job's own maxUsd — all net of
 *  what is in flight (batch spend is metered at collect, so a submitted batch counts at the estimate until then). */
export function budgetRoom({ monthUsd, spentMonth = 0, spentToday = 0, inflightUsd = 0, jobSpent = 0, maxUsd = null }) {
  const pace = monthUsd / 30;
  const room = { month: monthUsd - spentMonth - inflightUsd, day: pace - spentToday - inflightUsd, job: maxUsd == null ? Infinity : maxUsd - jobSpent - inflightUsd };
  const [binding, usd] = Object.entries(room).sort((a, b) => a[1] - b[1])[0];
  return { usd: Math.max(0, usd), binding, room, pace, monthUsd, spentMonth, spentToday, inflightUsd };
}

const r2 = (n) => Math.round(n * 100) / 100;
async function defaults(over) {
  const spendRepo = () => import('../repos/ai-usage-repo.js');
  return {
    env: process.env, store: createStore(), select: selectTier, count: countTiers, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), rand: Math.random,
    makeHb: async (o) => (await import('./hype-batch-app.js')).makeHypeBatch(o, BUDGET_KEY),
    spend: { month: async () => (await (await spendRepo()).monthSpendByCaller())[BUDGET_KEY] || 0, today: async () => (await (await spendRepo()).dailySpendByCaller())[BUDGET_KEY] || 0 },
    rows: async (ids) => (await import('../repos/hype-program-repo.js')).hypeRows(ids),
    judge: async (a) => (await import('./hype-judge.js')).judgeHype(a),
    log: async (kind, text) => (await import('../repos/activity-repo.js')).logActivity(kind, text),
    draining: async () => (await import('../drain.js')).isDraining(),
    ...over,
  };
}

/** dryRun: ¶ / requests / estimated $ per tier (plan only, no spend). */
function dryRunReport(counts, tier, d) {
  const monthUsd = monthlyUsd(d.env), tiers = {}, total = { pending: 0, requests: 0, usd: 0 };
  for (const t of TIER_ORDER) {
    if (tier && t !== tier) continue;
    tiers[t] = {};
    for (const p of PASSES) {
      const c = counts[t][p], usd = r2(c.requests * EST_USD_PER_REQUEST);
      tiers[t][p] = { docs: c.docs, paragraphs: c.total, done: c.done, pending: c.pending, requests: c.requests, estUsd: usd };
      total.pending += c.pending; total.requests += c.requests; total.usd += usd;
    }
  }
  total.usd = r2(total.usd);
  const pace = monthUsd / 30;
  return { dryRun: true, version: HYPE_VERSION, formula: EST_FORMULA, estUsdPerRequest: EST_USD_PER_REQUEST, tiers, total,
    budget: { monthUsd, paceUsdPerDay: r2(pace), daysAtPace: pace ? Math.ceil(total.usd / pace) : null, envSet: monthUsd > 0 } };
}

// summed grade counts of ledger entries → counts + percentages
const GRADE0 = () => ({ paragraphs: 0, questions: 0, searchable: 0, answered: 0, distinct: 0, missed: 0 });
function sumGrades(es) {
  const g = GRADE0(); for (const e of es) for (const k of Object.keys(g)) g[k] += e.grade?.[k] || 0;
  const pct = (n) => (g.questions ? Math.round((1000 * n) / g.questions) / 10 : null);
  return { ...g, searchablePct: pct(g.searchable), answeredPct: pct(g.answered), distinctPct: pct(g.distinct) };
}

/** setBaseline: the pilot's ledger entries → the stored baseline (explicit, never guessed). params.setBaseline = true | { tier?, last?, batches?: [ids], margin? } */
function setBaselineFrom(sb, tierParam, store) {
  const o = sb === true ? {} : sb, tier = o.tier || tierParam || null;
  let es = store.ledger().filter((e) => !tier || e.tier === tier);
  if (o.batches?.length) es = es.filter((e) => o.batches.includes(e.id)); else es = es.slice(-(o.last || 5));
  if (!es.length) return { status: 'error', error: `no ledger batches${tier ? ` for tier ${tier}` : ''} to build a baseline from — run a pilot first` };
  const r = rates(sumAcc(es.map((e) => e.totals)));
  const g = sumGrades(es);
  const base = { ...r, searchablePct: g.searchablePct, answeredPct: g.answeredPct, distinctPct: g.distinctPct, gradedQuestions: g.questions, at: new Date().toISOString(), from: es.map((e) => e.id) };
  store.setBaseline(tier || '*', base);
  return { status: 'baseline-set', tier: tier || '*', baseline: base };
}

export async function hypeProgramJob(params = {}, deps = {}) {
  const d = await defaults(deps);
  const { tier = null, maxUsd = null, dryRun = false, setBaseline = null, resume = false, limit = Infinity, noDisambig = false, upgrade = false,
    sampleRate = DEFAULT_SAMPLE_RATE, pollMs = 60000, margin = {}, minSample = DEFAULT_MIN_SAMPLE, maxGrade = DEFAULT_MAX_GRADE, roundParas = DEFAULT_ROUND_PARAS } = params;
  if (tier && !TIER_ORDER.includes(tier)) return { status: 'error', error: `tier must be one of ${TIER_ORDER.join(', ')}` };
  if (dryRun) return dryRunReport(await d.count({ version: HYPE_VERSION }), tier, d);
  if (setBaseline) return setBaselineFrom(setBaseline, tier, d.store);
  if (!tier) return { status: 'error', error: `tier required (${TIER_ORDER.join(' | ')})` };
  if (!(Number(maxUsd) > 0)) return { status: 'error', error: 'maxUsd required (> 0): this job spends money' };
  const monthUsd = monthlyUsd(d.env);
  if (!monthUsd) return { status: 'budget', reason: 'HYPE_PROGRAM_USD_MONTH is not set — the program spends nothing without a monthly ceiling' };
  if (resume) d.store.clearPause();
  const sum = { tier, rounds: 0, paragraphs: 0, requests: 0, batches: 0, written: 0, failed: 0, exhausted: 0, gated: 0, spendRefused: 0, unplannable: 0, errors: [] };
  const stopFor = (p) => ({ ...sum, phase: 'stopped', reason: `quality: ${p.reason}`, pausedAt: p.at, batch: p.batch });
  return withAIContext({ billTo: BUDGET_KEY, stage: 'hype', caller: BUDGET_KEY }, async () => {
    // free measurement of each doc as it settles; the batch's entry (+ the 1% grade, + the auto-pause) when its last doc has
    const measure = async ({ docId, outcomes, result, truncated }) => measureDoc({ outcomes, result, truncated, rows: await d.rows(outcomes.map((o) => o.id)), version: HYPE_VERSION, sampleRate, rand: d.rand });
    const onBatchDone = async ({ id, at, model, version, requests, tag, acc }) => {
      const total = sumAcc(Object.values(acc)), r = rates(total), t = tag?.tier || 'unknown';
      let graded = [], gradeErrors = 0;
      const picked = total.sampleIds.slice(0, maxGrade), rows = picked.length ? await d.rows(picked) : [];
      for (const row of rows) {
        let qs = []; try { const q = JSON.parse(row.hyp_questions); qs = Array.isArray(q) ? q : q?.questions || []; } catch { /* none */ }
        if (!qs.length) continue;
        try { graded.push(await d.judge({ docId: row.doc_id, paragraph: row.text, original: row.original_text, questions: qs })); } catch (e) { gradeErrors++; if (/cap|budget/i.test(`${e?.name} ${e?.message}`)) break; }   // a refused grade never stops the program
      }
      const grade = { ...gradeSummary(graded), sampled: picked.length, errors: gradeErrors };
      const baseline = d.store.baselineFor(t), violations = compare(r, baseline, { margin, minSample, grade });
      d.store.appendLedger({ id, at: new Date(at).toISOString(), doneAt: new Date().toISOString(), tier: t, pass: tag?.pass || null, model, version, requests, totals: { ...total, sampleIds: undefined, sampled: picked.length }, rates: r, grade, violations, baselineAt: baseline?.at || null });
      if (violations.length) {
        const reason = `batch ${id} (${t}) worse than baseline: ${violations.map((v) => `${v.metric} ${v.value} vs ${v.baseline} (limit ${v.limit})`).join('; ')}`;
        d.store.setPause({ at: new Date().toISOString(), tier: t, batch: id, reason, violations });
        await d.log('hype', `⏸ hype-program paused — ${reason}`.slice(0, 200));
      }
    };
    const hb = await d.makeHb({ measure, onBatchDone });
    const inflightUsd = () => hb.status().batches.reduce((n, b) => n + b.requests, 0) * EST_USD_PER_REQUEST;
    // collect until nothing is pending. true = the service is draining (batches stay in hype-batch/state.json: the resume picks them up)
    const settleAll = async () => {
      for (;;) {
        const c = await hb.collect();
        sum.written += c.written; sum.failed += c.failed; sum.exhausted += c.exhausted; sum.errors.push(...c.errors.slice(0, 3));
        if (!c.pending || d.store.pause()) return false;
        if (await d.draining()) return true;
        await d.sleep(pollMs);
      }
    };
    const spent0 = await d.spend.month();
    for (;;) {
      if (await settleAll()) return { ...sum, yielded: true, resume: { ...params } };
      const p = d.store.pause(); if (p) return stopFor(p);
      const [spentMonth, spentToday] = await Promise.all([d.spend.month(), d.spend.today()]);
      const room = budgetRoom({ monthUsd, spentMonth, spentToday, inflightUsd: inflightUsd(), jobSpent: Math.max(0, spentMonth - spent0), maxUsd: Number(maxUsd) });
      const n = Math.min(roundParas, Math.floor(room.usd / EST_USD_PER_REQUEST), limit - sum.paragraphs);
      if (n < 1) return { ...sum, status: room.usd < EST_USD_PER_REQUEST ? 'budget' : 'limit', binding: room.binding, budget: { ...room, room: undefined } };   // quiet stop: by design, no phase 'stopped'
      sum.rounds++;
      let sent = false, progressed = false;
      for (const pass of PASSES) {
        const key = `${tier}:${pass}:${noDisambig ? 'nd' : 'dis'}`, cur = d.store.cursors()[key] || { after: 0, skip: [] }, skip = new Set(cur.skip);
        const sel = await d.select({ tier, pass, limit: n, after: cur.after, skip });
        const save = (extra = []) => d.store.setCursor(key, { after: sel.cursor, skip: [...skip, ...extra] });
        if (!sel.paragraphs) { save(); progressed ||= sel.cursor !== cur.after; continue; }
        const sub = await hb.submit(sel.docs.map((x) => x.docId), { limit: n, noDisambig, upgrade, idsByDoc: Object.fromEntries(sel.docs.map((x) => [x.docId, x.ids])), tag: { tier, pass } });
        if (sub.over_budget) return { ...sum, status: 'budget', binding: 'anthropic' };
        const bad = [...sub.gated.map((g) => g.docId), ...sub.spendRefused];
        sum.gated += sub.gated.length; sum.spendRefused += sub.spendRefused.length; save(bad);
        sum.paragraphs += sub.paragraphs; sum.requests += sub.requests; sum.batches += sub.batches.length;
        if (!sub.paragraphs && !bad.length) { sum.unplannable += sel.docs.length; save(sel.docs.map((x) => x.docId)); sent = true; await d.log('hype', `${tier}/${pass} · ${sel.docs.length} docs yielded nothing to plan (capped or already copied) — skipped`); break; }   // never re-select what the planner will not send
        if (sub.paragraphs || bad.length) { sent = true; await d.log('hype', `${tier}/${pass} · ${sub.paragraphs} ¶ in ${sub.batches.length} batch(es) · ${sub.requests} requests · est $${r2(sub.requests * EST_USD_PER_REQUEST)}${bad.length ? ` · ${bad.length} docs skipped` : ''}`); break; }
      }
      if (!sent) { if (progressed) continue; return { ...sum, status: 'complete' }; }
    }
  });
}

/** Report hype-quality: spend this month, ¶ done/remaining per tier, ledger metrics vs baseline (per tier and per batch), grades. params { tier?, last? (batches shown, 20), counts? (false skips the library scan) } */
export async function hypeQualityReport(params = {}, deps = {}) {
  const d = await defaults(deps), { tier = null, last = 20, counts = true } = params, monthUsd = monthlyUsd(d.env);
  const [spentMonth, spentToday] = await Promise.all([d.spend.month(), d.spend.today()]);
  const ledger = d.store.ledger().filter((e) => !tier || e.tier === tier), perTier = {};
  for (const t of TIER_ORDER) {
    const es = ledger.filter((e) => e.tier === t); if (!es.length) continue;
    perTier[t] = { batches: es.length, requests: es.reduce((n, e) => n + (e.requests || 0), 0), rates: rates(sumAcc(es.map((e) => e.totals))), grade: sumGrades(es),
      baseline: d.store.baselineFor(t) };
  }
  const c = counts ? await d.count({ version: HYPE_VERSION }) : null;
  const progress = c && Object.fromEntries(TIER_ORDER.filter((t) => !tier || t === tier).map((t) => [t, Object.fromEntries(PASSES.map((p) => [p, { done: c[t][p].done, remaining: c[t][p].pending, total: c[t][p].total, estUsdRemaining: r2(c[t][p].requests * EST_USD_PER_REQUEST) }]))]));
  return { version: HYPE_VERSION, budget: { monthUsd, spentMonth: r2(spentMonth), spentToday: r2(spentToday), paceUsdPerDay: r2(monthUsd / 30), remainingMonth: r2(monthUsd - spentMonth) },
    paused: d.store.pause(), baselines: d.store.baselines(), progress, tiers: perTier,
    batches: ledger.slice(-last).map((e) => ({ id: e.id, at: e.doneAt || e.at, tier: e.tier, pass: e.pass, requests: e.requests, rates: e.rates, grade: e.grade && { sampled: e.grade.sampled, questions: e.grade.questions, searchablePct: e.grade.searchablePct, answeredPct: e.grade.answeredPct, distinctPct: e.grade.distinctPct, missedPerParagraph: e.grade.missedPerParagraph }, violations: e.violations })) };
}

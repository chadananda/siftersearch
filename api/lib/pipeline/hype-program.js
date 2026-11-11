// HyPE program: ops job `hype-program` (tier-ordered submit → collect loop on makeHypeBatch, one budget key, per-batch quality ledger,
// auto-pause against an explicit baseline, a fixed-sample quality check) and report `hype-quality`. Params: tier, maxUsd, sampleRate, dryRun, setBaseline, resume …
// Spend: every call bills to `hype-program` (HyPE, disambiguation, grading, embeddings); ceiling HYPE_PROGRAM_USD_MONTH, pace month/30.
// A spent ceiling ends the run QUIETLY (status 'budget'); a quality pause ends it as phase 'stopped' (the act-now mail). Deps all injectable.
import { withAIContext } from '../ai-context.js';
import { HYPE_VERSION } from '../rag/enrich/retrieval.js';
import { TIER_ORDER, PASSES, FAITHS, selectTier, countTiers } from './hype-tiers.js';
import { createStore, measureDoc, sumAcc, rates, gradeSummary, compare, DEFAULT_MIN_SAMPLE, GRADE_KEYS } from './hype-ledger.js';
import { RUBRIC, JUDGE_MODEL, judgeUser } from './hype-rubric.js';
import { parseJudge } from './hype-judge.js';
import { isCreditRefusal } from '../spend-caps.js';

export const BUDGET_KEY = 'hype-program';
export const EST_USD_PER_REQUEST = 0.00018;   // measured 10-28: 38,275 batch requests = $6.94 (Haiku 5.5, Message Batches, 50% off)
export const EST_USD_PER_CHECK = 0.0075;   // ESTIMATE (not yet metered): ~1.1k in + ~0.8k out tokens at Sonnet 4.6 batch prices (50% off); replace with the metered mean after the pilot
// Quality checks (Chad 11-10): a fixed sample, not a share — enough to catch a drop, small next to generation. Each tier first
// gets CHECK_TIER_TARGET checked paragraphs (the baseline sample), then CHECK_PER_BATCH in every later batch (drift watch).
// The checks go as their own Message Batch (half price, Chad 11-10 "even the checks should be done in batches"): submitted when a
// generation batch settles, collected on a later loop; their grades patch that batch's ledger entry and may pause the program then.
export const CHECK_TIER_TARGET = 300, CHECK_PER_BATCH = 3;
export const EST_FORMULA = 'est $ = generation + checks. generation = requests x $0.18 per 1000 (measured 10-28: 38,275 requests = $6.94); requests = pending paragraphs + extra slices for paragraphs over 4000 chars (ceil(chars/1500) each). checks = per tier 300 + 3 per batch of 10,000 paragraphs, x $0.0075 each (estimate, batch price). Both bill to hype-program and obey its monthly ceiling. Disambiguation and embeddings are not in this estimate.';
const WAIT_CHUNK_MS = 15 * 60_000;   // while waiting for the next UTC day, look again (drain / pause) at least this often
export const DEFAULT_ROUND_PARAS = 10000, DEFAULT_SAMPLE_RATE = 0.01, DEFAULT_MAX_GRADE = 200;

export const DEFAULT_MONTH_USD = 1000;   // Chad 11-09: at most $1000/month for everything HyPE; config/spend-caps.json `monthly` carries the same number to the gate
export const monthlyUsd = (env = process.env) => { const e = env.HYPE_PROGRAM_USD_MONTH; if (e == null || e === '') return DEFAULT_MONTH_USD; const v = Number(e); return Number.isFinite(v) && v > 0 ? v : 0; };   // unset = 1000; junk or 0 = spend nothing

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
    env: process.env, store: createStore(), select: selectTier, count: countTiers, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), rand: Math.random, now: () => Date.now(),
    makeHb: async (o) => (await import('./hype-batch-app.js')).makeHypeBatch(o, BUDGET_KEY),
    spend: { month: async () => (await (await spendRepo()).monthSpendByCaller())[BUDGET_KEY] || 0, today: async () => (await (await spendRepo()).dailySpendByCaller())[BUDGET_KEY] || 0 },
    rows: async (ids) => (await import('../repos/hype-program-repo.js')).hypeRows(ids),
    checks: async () => (await import('./hype-batch-app.js')).makeHypeChecks(BUDGET_KEY),
    log: async (kind, text) => (await import('../repos/activity-repo.js')).logActivity(kind, text),
    draining: async () => (await import('../drain.js')).isDraining(),
    seed: async (p) => (await import('./hype-bank-seed.js')).hypeBankSeedJob(p),
    reapply: async (t) => (await import('./hype-bank-seed.js')).reapplyBankSeeds(t),
    ...over,
  };
}

/** How many sampled paragraphs this batch may check: fill the tier's baseline sample first, then a few per batch. Pure over the ledger. */
export function checksFor(tier, store, maxGrade = DEFAULT_MAX_GRADE) {
  const done = store.ledger().filter((e) => e.tier === tier).reduce((n, e) => n + (e.grade?.paragraphs || 0), 0);
  return Math.min(maxGrade, Math.max(CHECK_PER_BATCH, CHECK_TIER_TARGET - done));
}
/** Checks `pending` paragraphs will need (estimate): a few per batch, + the tier's baseline sample when withTarget (once per tier). Pure. */
export const checksEst = (pending, withTarget = true) => (pending > 0 ? (withTarget ? CHECK_TIER_TARGET : 0) + CHECK_PER_BATCH * Math.ceil(pending / DEFAULT_ROUND_PARAS) : 0);

/** dryRun: ¶ / requests / estimated $ (generation + checks) per tier (plan only, no spend). */
function dryRunReport(counts, tier, d) {
  const monthUsd = monthlyUsd(d.env), tiers = {}, total = { pending: 0, requests: 0, checks: 0, generationUsd: 0, checkUsd: 0, usd: 0 };
  for (const t of TIER_ORDER) {
    if (tier && t !== tier) continue;
    tiers[t] = {}; let target = true;
    for (const p of PASSES) {
      const c = counts[t][p], gen = r2(c.requests * EST_USD_PER_REQUEST), checks = checksEst(c.pending, target), chk = r2(checks * EST_USD_PER_CHECK);
      if (checks) target = false;
      tiers[t][p] = { docs: c.docs, paragraphs: c.total, done: c.done, pending: c.pending, requests: c.requests, checks, generationUsd: gen, checkUsd: chk, estUsd: r2(gen + chk) };
      total.pending += c.pending; total.requests += c.requests; total.checks += checks; total.generationUsd += gen; total.checkUsd += chk;
    }
  }
  total.generationUsd = r2(total.generationUsd); total.checkUsd = r2(total.checkUsd); total.usd = r2(total.generationUsd + total.checkUsd);
  const pace = monthUsd / 30;
  return { dryRun: true, version: HYPE_VERSION, formula: EST_FORMULA, estUsdPerRequest: EST_USD_PER_REQUEST, tiers, total,
    budget: { monthUsd, paceUsdPerDay: r2(pace), daysAtPace: pace ? Math.ceil(total.usd / pace) : null, monthsAtCeiling: monthUsd ? r2(total.usd / monthUsd) : null, envSet: monthUsd > 0 } };
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
  // tradition (Chad 11-10, planning/anis-tradition-rollout.md): its question bank is seeded FIRST (hype-bank-seed), and its seeds are
  // re-merged after the tier completes (a regeneration replaces a paragraph's questions). The tier selection itself is not tradition-filtered.
  const { tradition = null } = params;
  if (dryRun) return { ...dryRunReport(await d.count({ version: HYPE_VERSION }), tier, d), ...(tradition ? { seed: await d.seed({ tradition, dry: true }) } : {}) };
  if (setBaseline) return setBaselineFrom(setBaseline, tier, d.store);
  if (!tier) return { status: 'error', error: `tier required (${TIER_ORDER.join(' | ')})` };
  if (!(Number(maxUsd) > 0)) return { status: 'error', error: 'maxUsd required (> 0): this job spends money' };
  const monthUsd = monthlyUsd(d.env);
  if (!monthUsd) return { status: 'budget', reason: 'HYPE_PROGRAM_USD_MONTH is 0 or not a number — the program spends nothing without a monthly ceiling' };
  if (resume) d.store.clearPause();
  let seed = null;
  if (tradition && !params.seedDone) {
    seed = await d.seed({ maxUsd, pollMs, ...(params.seedResume || {}), tradition });
    if (seed?.yielded) return { tier, seed, yielded: true, resume: { ...params, seedResume: seed.resume } };
    if (seed?.status === 'error') return { status: 'error', error: `bank seeding: ${seed.error}`, seed };
    params = { ...params, seedDone: true, seedResume: undefined };   // every later resume skips it
  }
  const sum = { tier, ...(seed ? { seed: { status: seed.status, pairs: seed.pairs, seeded: seed.seeded ?? 0, rejected: seed.rejected ?? 0 } } : {}), rounds: 0, paragraphs: 0, requests: 0, batches: 0, written: 0, failed: 0, exhausted: 0, gated: 0, spendRefused: 0, unplannable: 0, errors: [] };
  const stopFor = (p) => ({ ...sum, phase: 'stopped', reason: `quality: ${p.reason}`, pausedAt: p.at, batch: p.batch });
  return withAIContext({ billTo: BUDGET_KEY, stage: 'hype', caller: BUDGET_KEY }, async () => {
    // free measurement of each doc as it settles; the batch's entry (+ the 1% grade, + the auto-pause) when its last doc has
    const measure = async ({ docId, outcomes, result, truncated }) => measureDoc({ outcomes, result, truncated, rows: await d.rows(outcomes.map((o) => o.id)), version: HYPE_VERSION, sampleRate, rand: d.rand });
    const pauseFor = async (id, t, violations) => {
      const reason = `batch ${id} (${t}) worse than baseline: ${violations.map((v) => `${v.metric} ${v.value} vs ${v.baseline} (limit ${v.limit})`).join('; ')}`;
      d.store.setPause({ at: new Date().toISOString(), tier: t, batch: id, reason, violations });
      await d.log('hype', `⏸ hype-program paused — ${reason}`.slice(0, 200));
    };
    let checker = null; const checks = async () => (checker ||= await d.checks());
    // the grading requests for sampled paragraph ids (the judge reads each one's written questions)
    const gradeReqs = async (ids) => {
      const reqs = [];
      for (const row of ids.length ? await d.rows(ids) : []) {
        let qs = []; try { const q = JSON.parse(row.hyp_questions); qs = Array.isArray(q) ? q : q?.questions || []; } catch { /* none */ }
        if (qs.length) reqs.push({ custom_id: `d${row.doc_id}_p${row.id}`, system: RUBRIC, user: judgeUser(row.text, row.original_text, qs), maxTokens: 4000 });
      }
      return reqs;
    };
    // Anthropic has no credit: a WAIT, never a failure (Chad 11-11). Recorded in the summary; nothing is marked failed/exhausted, no cursor moves.
    const markCredit = () => {
      if (!sum.creditWait || sum.creditWait.resolvedAt) { sum.creditWait = { since: new Date(d.now()).toISOString(), probes: 0 }; d.log('hype', 'hype-program: Anthropic has no credit — waiting in place (in-flight batches keep being collected); resumes when credit returns').catch(() => {}); }
      sum.creditWait.probes++;
    };
    const creditBack = () => { if (sum.creditWait && !sum.creditWait.resolvedAt) { sum.creditWait.resolvedAt = new Date(d.now()).toISOString(); d.log('hype', 'hype-program: Anthropic credit is back — continuing').catch(() => {}); } };
    // a settled generation batch: free rates now (may pause at once); the sampled paragraphs go out as one check batch
    const onBatchDone = async ({ id, at, model, version, requests, tag, acc }) => {
      const total = sumAcc(Object.values(acc)), r = rates(total), t = tag?.tier || 'unknown';
      const picked = total.sampleIds.slice(0, checksFor(t, d.store, maxGrade)), reqs = await gradeReqs(picked);
      const grade = { sampled: picked.length, requests: reqs.length };
      if (reqs.length) try { grade.pending = await (await checks()).create(reqs, { model: JUDGE_MODEL }); }
      catch (e) {   // a refused check never stops the program; no credit DEFERS it (the sampled ids are kept, collectChecks sends them when credit returns)
        if (isCreditRefusal(e)) { grade.deferred = picked; markCredit(); } else { grade.errors = reqs.length; grade.firstError = String(e?.message || e).slice(0, 300); }
      }
      const baseline = d.store.baselineFor(t), violations = compare(r, baseline, { margin, minSample });
      d.store.appendLedger({ id, at: new Date(at).toISOString(), doneAt: new Date().toISOString(), tier: t, pass: tag?.pass || null, model, version, requests, totals: { ...total, sampleIds: undefined, sampled: picked.length }, rates: r, grade, violations, baselineAt: baseline?.at || null });
      if (violations.length) await pauseFor(id, t, violations);
    };
    // check batches that have ended → grades into their ledger entry (+ the grade comparison, which may pause). → how many still pending
    const collectChecks = async () => {
      let pending = 0;
      // checks that were refused for no credit: send them now (still no credit → they stay deferred and count as pending)
      for (const e of d.store.ledger().filter((x) => x.grade?.deferred)) {
        try {
          const reqs = await gradeReqs(e.grade.deferred), { deferred, ...g } = e.grade;
          if (!reqs.length) { d.store.updateLedger(e.id, { grade: { ...g, requests: 0 } }); continue; }
          const pend = await (await checks()).create(reqs, { model: JUDGE_MODEL });
          d.store.updateLedger(e.id, { grade: { ...g, requests: reqs.length, pending: pend } }); creditBack();
        } catch (err) {
          if (isCreditRefusal(err)) { markCredit(); pending++; continue; }
          const { deferred, ...g } = e.grade; d.store.updateLedger(e.id, { grade: { ...g, errors: e.grade.deferred.length, firstError: String(err?.message || err).slice(0, 300) } });
        }
      }
      for (const e of d.store.ledger().filter((x) => x.grade?.pending)) {
        const c = await checks(), bid = e.grade.pending;
        let st = null; try { st = await c.status(bid); } catch { /* try again next loop */ }
        if (!st?.ended) { pending++; continue; }
        const graded = []; let errors = 0, firstError = null;
        for await (const x of c.results(bid)) {
          const docId = Number(/^d(\d+)_/.exec(x.custom_id || '')?.[1]) || null;
          try { await c.meter({ model: JUDGE_MODEL, docId, ok: x.ok, usage: x.usage, error: x.error }); } catch { /* metering never loses a grade */ }
          const v = x.ok ? parseJudge(x.text) : null;
          if (!v || v.unparsed != null) { errors++; firstError ||= (x.error || `unparsed: ${v?.unparsed}`).slice(0, 300); continue; }
          graded.push(v);
        }
        const grade = { ...gradeSummary(graded), sampled: e.grade.sampled, checkBatch: bid, errors, ...(firstError ? { firstError } : {}) };
        const gv = compare(e.rates, d.store.baselineFor(e.tier), { margin, minSample, grade }).filter((v) => GRADE_KEYS.includes(v.metric));
        d.store.updateLedger(e.id, { grade, violations: [...(e.violations || []), ...gv], checkedAt: new Date().toISOString() });
        if (gv.length) await pauseFor(e.id, e.tier, gv);
      }
      return pending;
    };
    const hb = await d.makeHb({ measure, onBatchDone });
    const inflightUsd = () => hb.status().batches.reduce((n, b) => n + b.requests, 0) * EST_USD_PER_REQUEST
      + d.store.ledger().reduce((n, e) => n + (e.grade?.pending ? e.grade.requests || 0 : 0), 0) * EST_USD_PER_CHECK;
    // collect until nothing is pending. true = the service is draining (batches stay in hype-batch/state.json: the resume picks them up)
    const settleAll = async () => {
      for (;;) {
        const c = await hb.collect();
        sum.written += c.written; sum.failed += c.failed; sum.exhausted += c.exhausted; sum.errors.push(...c.errors.slice(0, 3));
        await collectChecks();
        if (!c.pending || d.store.pause()) return false;
        if (await d.draining()) return true;
        await d.sleep(pollMs);
      }
    };
    const spent0 = await d.spend.month();
    let wrapped = false;   // a scan that began mid-library rescans once from the top before the tier is called written
    for (;;) {
      if (await settleAll()) return { ...sum, yielded: true, resume: { ...params } };
      const p = d.store.pause(); if (p) return stopFor(p);
      const [spentMonth, spentToday] = await Promise.all([d.spend.month(), d.spend.today()]);
      const room = budgetRoom({ monthUsd, spentMonth, spentToday, inflightUsd: inflightUsd(), jobSpent: Math.max(0, spentMonth - spent0), maxUsd: Number(maxUsd) });
      const n = Math.min(roundParas, Math.floor(room.usd / EST_USD_PER_REQUEST), limit - sum.paragraphs);
      // the day's pace is used up (month still has room): wait for the next UTC day and carry on — month ceiling, job cap and quality pause still end the run
      if (n < 1 && room.binding === 'day' && room.room.month >= EST_USD_PER_REQUEST && room.room.job >= EST_USD_PER_REQUEST) {
        if (await d.draining()) return { ...sum, yielded: true, resume: { ...params } };
        const at = d.now(), ms = Date.parse(`${new Date(at).toISOString().slice(0, 10)}T00:00:00Z`) + 86_400_000 - at;
        if (!sum.waitingSince) { sum.waitingSince = new Date(at).toISOString(); sum.waits = (sum.waits || 0) + 1; await d.log('hype', `hype-program: today's pace ($${r2(room.pace)}) is spent — waiting for the next UTC day`); }
        await d.sleep(Math.max(1000, Math.min(ms + 1000, WAIT_CHUNK_MS))); continue;
      }
      delete sum.waitingSince;
      if (n < 1) return { ...sum, status: room.usd < EST_USD_PER_REQUEST ? 'budget' : 'limit', binding: room.binding, budget: { ...room, room: undefined } };   // quiet stop: by design, no phase 'stopped'
      sum.rounds++;
      let sent = false, progressed = false, refused = false, creditHit = null;
      for (const [faith, pass] of FAITHS.flatMap((f) => PASSES.map((p) => [f, p]))) {
        const key = `${tier}:${faith}:${pass}:${noDisambig ? 'nd' : 'dis'}`, cur = d.store.cursors()[key] || { after: 0, skip: [] }, skip = new Set(cur.skip);
        const sel = await d.select({ tier, pass, faith, limit: n, after: cur.after, skip });
        const save = (extra = []) => d.store.setCursor(key, { after: sel.cursor, skip: [...skip, ...extra] });
        if (!sel.paragraphs) { save(); progressed ||= sel.cursor !== cur.after; continue; }
        const sub = await hb.submit(sel.docs.map((x) => x.docId), { limit: n, noDisambig, upgrade, idsByDoc: Object.fromEntries(sel.docs.map((x) => [x.docId, x.ids])), tag: { tier, pass } });
        if (sub.over_budget) return { ...sum, status: 'budget', binding: 'anthropic' };
        // no credit: what was sent is in flight; the rest stays unsent and the cursor does NOT move (the next round re-selects it)
        if (sub.creditOut) { sum.paragraphs += sub.paragraphs; sum.requests += sub.requests; sum.batches += sub.batches.length; creditHit = sub.creditOut; markCredit(); break; }
        if (sub.batches.length) creditBack();
        const bad = sub.gated.map((g) => g.docId);   // a gate refusal (daily pace / month) is a WAIT, not a verdict on the doc: never added to the skip list
        if (sub.gated.length && !sum.gatedWhy) sum.gatedWhy = sub.gated.slice(0, 3);   // why docs were refused (e.g. not yet disambiguated) — visible in the result
        sum.gated += sub.gated.length; sum.spendRefused += sub.spendRefused.length; save(bad);
        if (sub.spendRefused.length && !sub.paragraphs) refused = true;
        sum.paragraphs += sub.paragraphs; sum.requests += sub.requests; sum.batches += sub.batches.length;
        if (!sub.paragraphs && !bad.length && !sub.spendRefused.length) { sum.unplannable += sel.docs.length; save(sel.docs.map((x) => x.docId)); sent = true; await d.log('hype', `${tier}/${faith}/${pass} · ${sel.docs.length} docs yielded nothing to plan (capped or already copied) — skipped`); break; }   // never re-select what the planner will not send
        if (sub.paragraphs || bad.length) { sent = true; await d.log('hype', `${tier}/${faith}/${pass} · ${sub.paragraphs} ¶ in ${sub.batches.length} batch(es) · ${sub.requests} requests · est $${r2(sub.requests * EST_USD_PER_REQUEST)}${bad.length ? ` · ${bad.length} docs skipped` : ''}`); break; }
      }
      if (creditHit) {
        if (await d.draining()) return { ...sum, yielded: true, resume: { ...params } };
        await d.sleep(Math.max(1000, Math.min(creditHit.retryAfterMs ?? WAIT_CHUNK_MS, WAIT_CHUNK_MS))); continue;   // re-probe when the credit wait is over (settleAll at the loop top keeps collecting)
      }
      if (!sent && refused) { if (await d.draining()) return { ...sum, yielded: true, resume: { ...params } }; await d.sleep(Math.min(pollMs, WAIT_CHUNK_MS)); continue; }   // the gate said not now: re-read the budget and try again
      if (!sent) {
        if (progressed) continue;
        // a cursor left at the end by earlier runs found nothing → start once more from the top before calling the tier written
        // (Chad 11-11: stale end-of-library cursors made a full core run 'complete' with 0 ¶ while ~$245 of core was pending)
        if (!wrapped) {
          wrapped = true; const mode = `:${noDisambig ? 'nd' : 'dis'}`, all = d.store.cursors(); let moved = false;
          for (const [k, c] of Object.entries(all)) if (k.startsWith(`${tier}:`) && k.endsWith(mode) && c?.after) { d.store.setCursor(k, { ...c, after: 0 }); moved = true; }
          if (moved) continue;
        }
        // the tier is written: wait for its last checks (their grades may still pause it), then report
        while (await collectChecks()) { if (d.store.pause()) break; if (await d.draining()) return { ...sum, yielded: true, resume: { ...params } }; await d.sleep(pollMs); }
        const p2 = d.store.pause(); if (p2) return stopFor(p2);
        if (tradition) try { sum.reapplied = await d.reapply(tradition); } catch (e) { sum.errors.push(`reapply: ${String(e?.message || e).slice(0, 200)}`); }
        return { ...sum, status: 'complete' };
      }
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
    paused: d.store.pause(), baselines: d.store.baselines(), progress, doctrinalByTradition: c?.traditions ?? null, tiers: perTier,
    batches: ledger.slice(-last).map((e) => ({ id: e.id, at: e.doneAt || e.at, tier: e.tier, pass: e.pass, requests: e.requests, rates: e.rates, grade: e.grade && { sampled: e.grade.sampled, questions: e.grade.questions, searchablePct: e.grade.searchablePct, answeredPct: e.grade.answeredPct, distinctPct: e.grade.distinctPct, missedPerParagraph: e.grade.missedPerParagraph }, violations: e.violations })) };
}

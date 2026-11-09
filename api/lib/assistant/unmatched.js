// Unmatched runtime (Chad 11-08): Jev found no strategy → (1) a fast model checks Jev did not simply miss an existing strategy or a
// pending candidate (records the miss; a candidate it picks is reused), (2) else Opus designs a candidate
// graph on the fly (saved as a CANDIDATE; replay + promotion unchanged) and it runs for this turn. Any failure → null (the
// researcher / general reply). Runs where the researcher would, on every channel; only the narration is live-only.
// Deps: strategy-candidates-repo, strategy-design, strategy-gaps, narrate, ai-context (strategyPin runs a not-yet-active graph).
import { randomUUID } from 'node:crypto';
import { catalog } from '../repos/strategies-repo.js';
import { candidatesDb, listCandidates, recordGap, logDesign, saveCandidate, pinFor } from '../repos/strategy-candidates-repo.js';
import { designCandidate, opusCall } from './strategy-design.js';
import { IMPROVE_CFG } from './strategy-gaps.js';
import { withAIContext } from '../ai-context.js';
import { narrate } from './narrate.js';
import { route, planUnmatched, activateProvisional, logFallbackDefect, GENERAL_RESEARCH } from './strategy-planner.js';
import { logPlanner } from '../repos/strategy-planner-repo.js';

const CFG = IMPROVE_CFG.unmatched;
export const RECHECK_ROLE = 'anis-unmatched-recheck';
export const RECHECK_CALLER = 'unmatched-recheck';
export const DESIGN_CALLER = 'unmatched-design';

/** Jev's answer is "no strategy": the default key today ('other'), 'unmatched' once renamed. A missing answer (Jev down) is not. Pure. */
/** ANIS_UNMATCHED_PLANNER (default on). 0 = the emergency rollback to the earlier behaviour (recheck, v1 design, researcher). */
export const plannerOn = () => process.env.ANIS_UNMATCHED_PLANNER !== '0';
export const isUnmatched = (s) => ['other', 'unmatched'].includes(s?.strategy?.choice);

/** Run fn with the direction's candidate strategy pinned (a candidate is in no catalog; graphFor/template read the pin). */
export const withStrategyPin = (direction, fn) => (direction?.strategyPin ? withAIContext({ strategyPin: direction.strategyPin }, fn) : fn());

const race = (p, ms) => { let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error('timeout')), ms); t.unref?.(); })]).finally(() => clearTimeout(t)); };
const firstJson = (t) => { const s = String(t || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

export const RECHECK_SYSTEM = `You help Anís, a research assistant over a Bahá'í and interfaith library. A small classifier (Jev) found NO strategy for the reader's latest message.
Below are the strategies Anís has (name: what it is for). Decide whether ONE of them fits what the reader asks for, i.e. whether the classifier simply missed it.
Judge by what the reader asks the assistant to DO, in the context of the thread. If none fits well, answer null.
Answer with ONE JSON object and nothing else: {"strategy":"<name>"|null,"confidence":0.0-1.0}`;

/** Default fast recheck (Haiku): → { strategy: name|null, confidence } | null */
export async function haikuRecheck({ question, thread, options }) {
  const [{ chatCompletion }, { modelFor }] = await Promise.all([import('../ai.js'), import('../model-roles.js')]);
  const user = `STRATEGIES:\n${options.map((o) => `- ${o.name}: ${o.description}`).join('\n')}\n\nTHREAD (latest last):\n${thread}\n\nLATEST MESSAGE:\n${question}`;
  const res = await race(chatCompletion([{ role: 'system', content: RECHECK_SYSTEM }, { role: 'user', content: user }],
    { ...modelFor(RECHECK_ROLE), temperature: 0, maxTokens: CFG.recheck_max_tokens, thinking: false, caller: RECHECK_CALLER }), CFG.recheck_timeout_ms);
  const j = firstJson(res?.content ?? res);
  return j ? { strategy: typeof j.strategy === 'string' ? j.strategy : null, confidence: Number(j.confidence) || 0 } : null;
}

const designCall = (role, system, user, maxTokens) => opusCall(role, system, user, maxTokens, DESIGN_CALLER);
const threadOf = (messages = []) => messages.slice(-4).map((m) => `${m.role}: ${String(m.content || '').slice(0, 600)}`).join('\n');

/**
 * Resolve an Unmatched turn. `run(choice)` executes a strategy exactly as a Jev-chosen one (respond.js passes its own closure) and
 * returns its output (null = nothing to execute). On success the direction now names the strategy (and pins a candidate), so every
 * downstream gate treats the turn as strategy-chosen → { via, name, out }; otherwise the direction is untouched → null.
 * io (injectable for tests): { db, cat, recheck, call, rand }.
 */
export async function resolveUnmatched({ direction, messages, question, onEvent = () => {}, run }, io = {}) {
  const log = direction.decisions, channel = direction.channel, t0 = Date.now();
  const rec = (point, o) => log?.record?.(point, { by: 'code', saw: question, ...o });
  const turnId = direction.turnId ? String(direction.turnId) : `unmatched:${randomUUID()}`;
  const jev = direction.strategy.strategy;
  let db, cat;
  const adopt = async (choice, via, extra = {}) => {
    const before = direction.strategy, pin = direction.strategyPin;
    direction.strategy = { ...before, strategy: { ...jev, choice, was: jev.choice, via } };
    if (extra.pin) direction.strategyPin = extra.pin;
    let out = null;
    try { out = await run(direction.strategy); } catch (err) { console.warn('anis unmatched run failed', err?.message); }
    if (out) return { via, name: choice, out };
    direction.strategy = before; if (extra.pin) direction.strategyPin = pin;
    rec('unmatched:fallback', { chosen: 'researcher', reason: `${via} ${choice}: executor found nothing`, ms: Date.now() - t0 });
    return null;
  };
  // The two paths (Chad 11-09): not a query -> conversational (no planner); a query -> a strategy ONLY: recheck/pending candidate, else a tree planned now,
  // run this turn and saved (EXTEND loop); a planner failure runs the stored general_research tree and is logged as a defect against the planner.
  const planned = async () => {
    const r = await route({ question, messages, strategy: null }, { cat, gate: io.gate, record: (x) => rec('route', { by: 'code', chosen: x.kind === 'strategy' ? `${x.name}@${x.version}` : 'conversational', reason: JSON.stringify(x).slice(0, 300), ms: Date.now() - t0 }),
      defect: (why) => { try { logFallbackDefect(db, { question, why }); } catch { /* a log never fails a turn */ } },
      reuse: async () => {
        const pending = listCandidates(db);
        const options = [...cat.strategies.filter((s) => s.description && !['other', 'unmatched'].includes(s.name)).map((s) => ({ name: s.name, description: s.description })), ...pending.map((c) => ({ name: c.id, description: c.description, candidate: c }))];
        const re = await (io.recheck || haikuRecheck)({ question, thread: threadOf(messages), options }).catch((err) => { console.warn('anis unmatched recheck failed', err?.message); return null; });
        const hit = re?.strategy && re.confidence >= CFG.recheck_min_confidence ? options.find((o) => o.name === re.strategy) : null;
        rec('unmatched:recheck', { by: 'llm', options: options.map((o) => o.name), chosen: hit?.name ?? null, probabilities: re?.strategy ? { [re.strategy]: re.confidence } : null, ms: Date.now() - t0 });
        if (!hit) return null;
        recordGap(db, { turn_id: turnId, thread_id: null, question, label: hit.name, source: 'recheck', jev_choice: jev.choice, jev_confidence: jev.confidence ?? null, reason: 'unmatched:recheck' });
        narrate(onEvent, channel, 'unmatched.recheck_fit', {}, io);
        const pin = hit.candidate ? pinFor(db, hit.candidate.id, hit.candidate.version) : null;
        return hit.candidate && !pin ? null : { name: hit.name, version: pin?.version ?? null, pin };
      },
      plan: async () => {
        narrate(onEvent, channel, 'unmatched.new', {}, io); narrate(onEvent, channel, 'unmatched.planning', {}, io);
        recordGap(db, { turn_id: turnId, thread_id: null, question, label: 'unmatched', source: 'unmatched', jev_choice: jev.choice, jev_confidence: jev.confidence ?? null, reason: 'unmatched:plan' });
        const p = await (io.plan || ((turn) => planUnmatched(turn, { db, cat, listCandidates, ...(io.call ? { call: io.call } : {}) })))({ question, messages });
        if (p?.ok) narrate(onEvent, channel, 'unmatched.planned', {}, io);
        return p;
      } });
    if (r.kind === 'conversational') return { via: 'conversational', name: null, out: null, route: r };
    if (r.source === 'matched') return await adopt(r.name, 'recheck', r.pin ? { pin: r.pin } : {});
    if (r.source === 'planned') {
      if (r.sets) direction.strategy = { ...direction.strategy, strategy: { ...jev, sets: r.sets } };   // setting_of: the existing strategy runs with these settings
      const out = await adopt(r.name, r.sets ? 'setting_of' : 'design', r.pin ? { pin: r.pin } : {});
      if (out && r.saved) { try { activateProvisional(db, r.saved); } catch (err) { console.warn('anis provisional promotion failed', err?.message); } }   // joins Jev's cards, on probation
      return out;
    }
    try { logPlanner(db, { kind: 'route', loop: 'EXTEND', strategy_id: GENERAL_RESEARCH, note: r.defect }); } catch { /* log only */ }
    return await adopt(GENERAL_RESEARCH, 'fallback', {});
  };
  try {
    db = io.db || candidatesDb(); cat = io.cat || catalog();
    const pending = listCandidates(db);
    if (plannerOn()) return await planned();
    // (a) RECHECK: did Jev simply fail to pick a good strategy? The active strategies AND the pending candidates, by description — an
    // earlier on-the-fly design is reused only when the model picks it (never by word overlap: intent is never word parsing, Chad 11-03)
    const options = [...cat.strategies.filter((s) => s.description && !['other', 'unmatched'].includes(s.name)).map((s) => ({ name: s.name, description: s.description })),
      ...pending.map((c) => ({ name: c.id, description: c.description, candidate: c }))];
    const re = await (io.recheck || haikuRecheck)({ question, thread: threadOf(messages), options }).catch((err) => { console.warn('anis unmatched recheck failed', err?.message); return null; });
    const hit = re?.strategy && re.confidence >= CFG.recheck_min_confidence ? options.find((o) => o.name === re.strategy) : null;
    rec('unmatched:recheck', { by: 'llm', options: options.map((o) => o.name), chosen: hit?.name ?? null, probabilities: re?.strategy ? { [re.strategy]: re.confidence } : null, ms: Date.now() - t0 });
    if (hit) {
      // Jev's miss, recorded so his context can be tuned (and a cluster of misses can still become a design)
      recordGap(db, { turn_id: turnId, thread_id: null, question, label: hit.name, source: 'recheck', jev_choice: jev.choice, jev_confidence: jev.confidence ?? null, reason: 'unmatched:recheck' });
      narrate(onEvent, channel, 'unmatched.recheck_fit', {}, io);
      const pin = hit.candidate ? pinFor(db, hit.candidate.id, hit.candidate.version) : null;
      const r = (!hit.candidate || pin) && await adopt(hit.name, 'recheck', pin ? { pin } : {});
      if (r) return r;
      return null;
    }
    // (c) DESIGN: Opus builds a candidate for this one question; it is saved as a candidate (replay + promotion decide if it goes active)
    narrate(onEvent, channel, 'unmatched.new', {}, io);
    narrate(onEvent, channel, 'unmatched.planning', {}, io);
    recordGap(db, { turn_id: turnId, thread_id: null, question, label: 'unmatched', source: 'unmatched', jev_choice: jev.choice, jev_confidence: jev.confidence ?? null, reason: 'unmatched:design' });
    const cluster = { key: `unmatched#${turnId}`, label: 'unmatched', questions: [question], reasons: [], gaps: [] };
    const d = await race(designCandidate(cluster, { cat, call: io.call || designCall, pending }), CFG.design_timeout_ms);
    if (!d.ok) {
      logDesign(db, { cluster_key: cluster.key, label: 'unmatched', status: 'dropped', attempts: d.attempts, usd: d.usd, errors: d.errors, turn_ids: [turnId] });
      rec('unmatched:design', { by: 'llm', chosen: null, reason: `dropped: ${d.errors?.[0] || 'no valid design'}`, ms: Date.now() - t0 });
      return null;
    }
    const saved = saveCandidate(db, d.normalized, { by: 'unmatched-live' });
    logDesign(db, { cluster_key: cluster.key, label: 'unmatched', status: d.dedupe ? 'version' : 'new', strategy_id: saved.id, version: saved.version, attempts: d.attempts, usd: d.usd, turn_ids: [turnId] });
    rec('unmatched:design', { by: 'llm', chosen: `${saved.id}@${saved.version}`, reason: `${d.dedupe ? 'version of an existing strategy' : 'new candidate'}; $${(d.usd || 0).toFixed(4)}`, ms: Date.now() - t0 });
    narrate(onEvent, channel, 'unmatched.planned', {}, io);
    return await adopt(saved.id, 'design', { pin: pinFor(db, saved.id, saved.version) });
  } catch (err) {
    console.warn('anis unmatched failed', err?.message);
    rec('unmatched:fallback', { chosen: 'researcher', reason: String(err?.message || err).slice(0, 160), ms: Date.now() - t0 });
    return null;
  }
}

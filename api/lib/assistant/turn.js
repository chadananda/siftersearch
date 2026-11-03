// One Anis turn, for any channel (PRD §2): log the message first → Jev triage → canned reply, hidden tarpit, or the
// research answer (respond.js) → output check → voice lint → complete the log with the path. Transport-neutral: the
// widget streams onEvent, email uses the returned text. Every non-research reply costs zero LLM tokens.
// Deps (injectable): exchange-log, triage, canned, strikes, lint, channels, respond.
import { makeLimits } from './limits.js';
import { loadReaderCard } from './reader-card.js';
import { resolveQuery } from './short-turn.js';
import { openExchange, closeExchange, failExchange } from './exchange-log.js';
import { triageMessage, routeTriage, outputBreaksPersona, T } from './triage.js';
import { cannedReply } from './canned.js';
import { strikes as liveStrikes, tarpitResponse } from './strikes.js';
import { lintReply } from './lint.js';
import { channelFor } from './channels.js';
import { turnMeta } from './turn-meta.js';
import { progressText } from './progress.js';
import { chooseStrategy, strategyOf } from './strategy-choice.js';
import { timeoutDecision, jevTimeoutsOf } from './jev-call.js';   // W3: Jev chooses the strategy from context
import { restate, understoodText, tarpitPhrase } from './understanding.js';   // W3: the "what I understood" line
import { decisionLog } from './decision-log.js';
import { withAIContext, currentAIContext } from '../ai-context.js';
import { timed, timelineOf } from './timeline.js';
import { phraseStage } from './phrases.js';
import { resolveLookup } from './lookup.js';
import { makeReports, renderReport, emailIn, REPORT_TEXT } from './deep-report.js';   // Jev depth = deep_report → a queued job + mail

const OUTPUT_BREAK = 0.8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastUser = (messages) => [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';

const liveLimits = makeLimits();
async function defaultDeps() {
  const { anisRespond } = await import('./respond.js');
  return { respond: anisRespond, triage: triageMessage, outputCheck: outputBreaksPersona, open: openExchange, close: closeExchange,
    fail: failExchange, strikes: liveStrikes, sleep, lookup: resolveLookup, limits: liveLimits, card: loadReaderCard, resolve: resolveQuery, reports: makeReports() };
}

/**
 * @param {object} a
 * @param {Array}  a.messages       the thread; last = the new message
 * @param {string} [a.channel]      registry id; privileged channels need a.trusted (our own adapter)
 * @param {object} [a.profile]      { persona_name, default_tradition, mission, scope_config }
 * @param {object} [a.participant]  { id, authed, userId }
 * @param {string} [a.conversationId] a thread the client asks to resume (honoured only if owned)
 * @param {string} [a.clientKey]    strike key (participant id, else IP)
 */
// Every turn runs under a per-turn METER (ai-context): each model call's model and cost land in the turn's path.meta
// (type · models · usd · latency) — what the daily conversation digest shows (Chad 10-22). An outer meter is reused.
export async function anisTurn(args) {
  const outer = currentAIContext().meter, timeline = currentAIContext().timeline || [];
  if (Array.isArray(outer)) return withAIContext({ timeline }, () => turnBody(args, outer, timeline));
  const meter = [];
  return withAIContext({ meter, timeline }, () => turnBody(args, meter, timeline));
}

async function turnBody({ messages, channel: channelName = 'widget-chat', trusted = false, profile = {}, participant = {},
  conversationId = null, clientKey = null, onEvent: rawEvent = () => {}, research = undefined, engine = undefined, llm = undefined, variants = undefined, deps }, meter = [], timeline = []) {
  const d = { ...(deps ? {} : await defaultDeps()), ...(deps || {}) };
  // every stage event also says, in words, what Anís is doing (the site chat shows it)
  const onEvent = (ev) => { rawEvent(ev); const p = ev?.type === 'stage' ? progressText(ev.stage) : null; if (p) rawEvent({ type: 'progress', stage: ev.stage, text: p }); };
  const channel = channelFor(channelName, { trusted });
  const text = lastUser(messages);
  const name = profile.persona_name || 'Anís';
  const seed = `${text}:${new Date().toISOString().slice(0, 10)}`;
  const t0 = Date.now();
  const who = clientKey || participant.id || 'anon';
  const logArgs = { participantId: participant.id ?? null, userId: participant.userId ?? null, conversationId, channel: channel.id, text };

  // F15: kill switch + per-person / global hourly caps — a fixed reply, no classifier, no LLM
  const capped = d.limits?.(who);
  if (capped) {
    onEvent({ type: 'text', content: capped.reply });
    return { reply: capped.reply, status: 'limited', limit: capped.reason, citations: [], retrieved: [], plan: null, conversationId: null, timings: { total_ms: Date.now() - t0 } };
  }

  // Tarpit: templates only — no classifier, no LLM — at the pace of the path it imitates.
  if (d.strikes.inTarpit(who)) {
    const ex = await d.open(logArgs).catch(() => null);
    if (ex) onEvent({ type: 'session', conversation_id: ex.conversationId });
    const tp = tarpitResponse(text, { name });
    if (tp.looksLike === 'research') {
      // the same shape and pace as a real research turn: the neutral word, a decision's delay, an "understood" line (templates, no model)
      onEvent({ type: 'stage', stage: 'understand' });
      await d.sleep(500 + Math.floor(Math.random() * 600));
      onEvent({ type: 'understood', text: understoodText(tarpitPhrase(seed)) });
      onEvent({ type: 'stage', stage: 'search' }); onEvent({ type: 'sources', sources: [], plan: null, ms: 180 });
      onEvent({ type: 'status', text: 'Searching more widely…' });
    }
    await d.sleep(tp.delayMs);
    onEvent({ type: 'stage', stage: 'craft' }); onEvent({ type: 'text', content: tp.text });
    if (ex) await d.close({ ...ex, reply: tp.text, status: 'tarpit', path: { gate: 'tarpit', meta: turnMeta({ status: 'tarpit', meter, ms: Date.now() - t0 }) }, channel: channel.id }).catch(() => {});
    return { reply: tp.text, status: 'tarpit', citations: [], retrieved: [], plan: null, conversationId: ex?.conversationId ?? null,
      timings: { total_ms: Date.now() - t0 } };
  }

  // Write it down before trying — in parallel with triage, so logging adds no latency.
  // Jev decides (inside the triage call, no extra round trip) whether this is a lookup — a book, quoted words, a work + number;
  // lookup.js then only RESOLVES what Jev named (title index, exact-phrase search, pn/heading) — it never reads intent from wording.
  const lookupOn = engine === undefined && research === undefined && !variants && !llm && d.lookup;
  // The READER CARD (who is asking: channel, relationship, remembered facts, study tracks) rides with the thread into every
  // decision — triage, the search plan, the resolver — as a non-enumerable property of the messages array respond.js passes on.
  const card = d.card ? await timed('card', () => d.card(participant, { channel: channel.id })).catch(() => null) : null;
  try { Object.defineProperty(messages, 'card', { value: card?.text ?? null, enumerable: false, configurable: true, writable: true }); } catch { /* frozen thread: Jev reads it without the card */ }
  // …and Jev's STRATEGY choice (strategy-choice.js: comparison / understanding / prayer / guidance / reference — from context, never
  // from keywords; W3) beside them. Injected deps without one = off.
  const strategyFn = d.strategy ?? (deps ? null : chooseStrategy);
  const strategyOn = strategyFn && engine === undefined && research === undefined && !variants;
  onEvent({ type: 'stage', stage: 'understand' });   // the neutral word until a decision exists — never a templated echo of the message
  // a Jev call past its measured limit is retried once within budget and never silent: each one is a jev:timeout decision + meta.jev_timeouts
  const jevTimeouts = []; const onJev = (info) => { jevTimeouts.push(info); };
  const [ex, tri, strat] = await Promise.all([timed('open-log', () => d.open(logArgs)).catch(() => null), timed('triage', () => d.triage(messages, { card: card?.text ?? null, channel: channel.id, onJev })).catch(() => null),
    strategyOn ? timed('strategy', () => strategyFn(messages, { profile, onJev }), (r) => (r ? { choice: r.strategy?.choice, sides: r.sides } : null)).catch(() => null) : null]);
  if (ex) onEvent({ type: 'session', conversation_id: ex.conversationId });
  const route = routeTriage(tri);
  const decisions = decisionLog(strat?.decisions || []);   // every strategy decision of the turn (inputs, options, probabilities, branch) → path.decisions
  for (const info of jevTimeouts) decisions.record('jev:timeout', timeoutDecision(info));
  // Jev's OUTCOME field — the turn read with the history and the card — decides what a short or odd message is; its words
  // never do (Chad 11-03). A search behind an "unclear" / "cut off" verdict is researched ("race unity", a bare name, a
  // pasted passage); a turn even the context cannot resolve is asked back (the 'unclear' canned reply).
  const outcome = tri?.outcome?.choice ?? null, outcomeC = tri?.outcome?.confidence ?? 0;
  if (route.action === 'canned' && ['unclear', 'cut_off'].includes(route.kind) && outcome === 'search' && outcomeC >= T.outcome) Object.assign(route, { action: 'research', overridden: route.kind, by: 'outcome' });
  if (route.action === 'research' && outcome === 'ask_back' && outcomeC >= T.askBack) Object.assign(route, { action: 'canned', kind: 'unclear', overridden: 'research', by: 'outcome' });
  // Jev's own confident call that this fetches something exact outranks his "unclear" (a bare "Gleanings 1" reads as unclear to the message-kind question)
  if (route.action === 'canned' && ['unclear', 'cut_off'].includes(route.kind) && ['book', 'quote', 'reference'].includes(tri?.lookup?.choice) && (tri.lookup.confidence ?? 0) >= 0.8) Object.assign(route, { action: 'research', overridden: route.kind });
  const lkIntent = lookupOn && route.action === 'research' && ['book', 'quote', 'reference'].includes(tri?.lookup?.choice) && (tri.lookup.confidence ?? 0) >= 0.6 ? tri.lookup.choice : null;
  const lk = lkIntent ? await timed('lookup', () => d.lookup(messages, { intent: lkIntent, profile, decisions, onJev: (info) => decisions.record('jev:timeout', timeoutDecision(info)) }), (r) => (r ? { kind: r.kind, intent: lkIntent } : { intent: lkIntent })).catch(() => null) : null;
  // a SHORT turn Jev read as a search ("more", "and the Báb?", "in Persian") gets its self-contained query from the history
  // and the card (short-turn.js) — respond.js searches those words, not the bare message
  const resolved = route.action === 'research' && outcome === 'search' && tri?.features?.short && !tri.features.first && d.resolve
    ? await timed('resolve', () => d.resolve({ messages, card: card?.text ?? null })).catch(() => null) : null;
  const triageSummary = tri && { kind: tri.kind?.choice, stance: tri.stance?.choice, reaction: tri.reaction?.choice,
    follow_up: tri.follow_up ?? null, first: tri.features?.first ?? null, features: tri.features ?? null, outcome: tri.outcome?.choice ?? null, query: resolved?.query ?? null, card: !!card?.text,
    malicious: tri.malicious, stop: tri.stop_request, ms: tri.ms,
    lookup: tri.lookup ? { choice: tri.lookup.choice, confidence: tri.lookup.confidence } : null,
    depth: tri.depth?.choice ?? null, accepts_offer: tri.accepts_offer ?? null };
  // THE "WHAT I UNDERSTOOD" LINE (understanding.js): Anís's own restatement of the resolved request, conditioned on Jev's decision,
  // emitted the moment it returns — beside the search, never waited on; none for a canned / refused turn; too late (answer done) = dropped.
  let turnDone = false, understood = null;
  const restateFn = d.restate ?? (deps ? null : restate);
  const understoodP = !restateFn || route.action === 'canned' || route.action === 'refuse' ? Promise.resolve(null)
    : timed('understood', () => restateFn(messages, { strategy: strategyOf(strat), sides: strat?.sides || [], kind: route.kind, features: triageSummary?.features })).catch(() => null);
  understoodP.then((u) => { if (u?.text && !turnDone) { understood = u; onEvent({ type: 'understood', text: u.text, phrase: u.phrase, ms: u.ms }); } });
  const finish = async (reply, status, extra = {}) => {
    turnDone = true;
    const path = { gate: route.action, kind: route.kind, triage: triageSummary, channel: channel.id, stop: route.stop,
      strategy: strat ? { choice: strat.strategy?.choice ?? null, sides: strat.sides ?? [], ms: strat.ms ?? null } : null, understood: understood?.phrase ?? null, decisions: decisions.list(), ...extra };
    path.meta = turnMeta({ status, path, meter, ms: Date.now() - t0 });
    const jt = jevTimeoutsOf(path.decisions); if (jt) path.meta.jev_timeouts = jt;
    // where the time went (route.timeline in the thread view): stage spans since turn start + each model call's completion
    path.timeline = timelineOf(timeline, t0); path.llm = meter.map((c) => ({ model: c.model, caller: c.caller ?? null, at: c.at ? c.at - t0 : null }));
    if (ex) await d.close({ ...ex, reply, status, path, channel: channel.id }).catch(() => {});
    // the Observatory terminal: that a turn happened, how it was routed — never its text or who asked
    import('../repos/activity-repo.js').then(({ logActivity }) => logActivity('anis', `${channel.id} · ${status}${route.kind ? ` · ${route.kind}` : ''}${extra.recipe ? ` · ${extra.recipe}` : ''}${extra.retrieved != null ? ` · ${extra.retrieved} paragraphs` : ''} · ${((Date.now() - t0) / 1000).toFixed(1)} s`)).catch(() => {});
    return path;
  };

  // DEEP REPORTS (Chad 11-03): an offer made in an earlier chat turn waits under the conversation; Jev's accepts_offer (read
  // with the history) decides acceptance. The address comes from the account, else from the reply that supplies it.
  const offerKey = ex?.conversationId || participant.id || null;
  const offer = d.reports && offerKey && tri && !tri.features?.first && route.action !== 'refuse' ? await d.reports.pending(offerKey).catch(() => null) : null;

  try {
    if (offer?.researchId && (tri.accepts_offer ?? 0) >= T.accept) {
      const email = participant.email || emailIn(text);
      const dr = { researchId: offer.researchId };
      let reply = REPORT_TEXT.askEmail;
      if (email) {
        const out = await d.reports.deliver({ researchId: offer.researchId, email });
        await d.reports.clear(offerKey).catch(() => {});
        reply = out.ready ? REPORT_TEXT.ready(email) : REPORT_TEXT.queued(email);
        Object.assign(dr, { sent: !!out.sent, drafted: !!out.drafted, queued: !!out.queued });
      } else dr.asked = true;
      onEvent({ type: 'stage', stage: 'craft' }); onEvent({ type: 'text', content: reply });
      const path = await finish(reply, 'report', { deep_report: dr });
      return { reply, status: 'report', citations: [], retrieved: [], plan: null, conversationId: ex?.conversationId ?? null, path, deep_report: dr, timings: { total_ms: Date.now() - t0 } };
    }

    if (route.action === 'refuse' || route.action === 'canned') {
      if (route.strike) d.strikes.strike(who);
      const reply = cannedReply(route.action === 'refuse' ? 'refuse' : route.kind, { name, seed });
      onEvent({ type: 'stage', stage: 'craft' }); onEvent({ type: 'text', content: reply });
      const path = await finish(reply, 'canned');
      return { reply, status: 'canned', citations: [], retrieved: [], plan: null, conversationId: ex?.conversationId ?? null, path,
        timings: { total_ms: Date.now() - t0 } };
    }

    // Jev's depth = deep_report: the deep-research JOB is queued beside the normal answer (never run inline)
    const deepOn = d.reports && engine === undefined && research === undefined && !variants && !llm && tri?.depth?.choice === 'deep_report' && (tri.depth.confidence ?? 0) >= T.depth;
    const jobP = deepOn ? timed('deep-report', () => d.reports.start(resolved?.query || text)).catch(() => null) : null;
    // research / llm / variants: a caller's override (the /draft battery compares the researcher, writers and templates before they go live)
    const r = await d.respond({ messages, profile, participant, onEvent, ...(llm ? { llm } : {}), ...(variants ? { variants } : {}), direction: { stance: triageSummary?.stance ?? null,
      kind: route.kind, guarded: route.action === 'guarded', channel, follow_up: triageSummary?.follow_up ?? null, features: triageSummary?.features ?? null, outcome: tri?.outcome ?? null, query: resolved?.query ?? null, card: card?.text ?? null, ...(lk && route.action === 'research' ? { lookup: lk } : {}), strategy: strat, decisions, ...(research !== undefined ? { research } : {}), ...(engine ? { engine } : {}) } });
    let reply = r.reply;
    // Output check: a reply that abandons the persona or leaks instructions is replaced (the widget reconciles its
    // streamed text to the final reply; email sends only this).
    const broken = await timed('output-check', () => d.outputCheck(reply, { persona: name })).catch(() => null);
    const replaced = broken != null && broken >= OUTPUT_BREAK;
    if (replaced) { d.strikes.strike(who); reply = cannedReply('refuse', { name, seed }); }
    // the report: a letter's reply IS the report when it is ready, else it follows by mail; a chat offers to email it
    const job = jobP ? await jobP : null;
    let deepReport;
    if (job?.researchId && !replaced) {
      if (channel.renderer === 'email-html') {
        const ready = await d.reports.report(job.researchId).catch(() => null);
        if (ready) { reply = renderReport(ready).markdown; deepReport = { researchId: job.researchId, delivered: 'reply' }; }
        else if (participant.email) {
          await d.reports.deliver({ researchId: job.researchId, email: participant.email }).catch(() => null);
          reply = `${reply}\n\n${REPORT_TEXT.emailFollows}`; deepReport = { researchId: job.researchId, queued: true };
        } else deepReport = { researchId: job.researchId, queued: false };
      } else if (offerKey) {
        await d.reports.offer(offerKey, { researchId: job.researchId, question: resolved?.query || text }).catch(() => {});
        reply = `${reply}\n\n${REPORT_TEXT.offer}`; onEvent({ type: 'text', content: `\n\n${REPORT_TEXT.offer}` });
        deepReport = { researchId: job.researchId, offered: true };
      }
    }
    const lint = lintReply(reply);
    const path = await finish(reply, 'answered', { engine: 'anis', ...(deepReport ? { deep_report: deepReport } : {}), evidence: r.evidence ?? null, recipe: r.plan?.shape ?? null,
      // how the strategy was chosen (jev | jev:cached | backstop + why) and what the search was fed, for the thread view
      plan: { shape: r.plan?.shape ?? null, provenance: r.plan?.provenance ?? null, reason: r.plan?.reason ?? null, overridden: r.plan?.overridden ?? null,
        quote: r.plan?.quote?.phrase ?? null, ms: r.plan?.plan_ms ?? null, history_turns: Math.max(0, messages.length - 1), search_query: r.search_query ?? null,
        // the quote gate's work on the final text: sentences dropped for unverified quotes, introduced quotations placed/rewritten
        quotes_removed: r.quotes_removed ?? 0, quotes_completed: r.quotes_completed ?? null,
        // the five stages, each with its choice, who made it and the time: strategy (Jev) → phrases → retrieval → selection → format
        stages: { strategy: { choice: r.plan?.shape ?? null, by: r.plan?.provenance ?? null, reason: r.plan?.reason ?? null, ms: r.plan?.plan_ms ?? null },
          phrases: r.plan?.quote ? { choice: r.plan.quote.phrase, by: r.plan.quote.via } : r.plan?.phrases ? phraseStage(r.plan.phrases) : null,
          retrieval: { choice: r.retrieved?.length ?? 0, by: 'planned-search', ms: r.timings?.search_ms ?? null },
          selection: r.select ? { choice: `${r.select.kept}/${r.select.of}`, by: r.select.by } : null,
          format: r.format ? { choice: r.format.id, by: r.format.by } : null } },
      retrieved: r.retrieved?.length ?? 0,
      format: r.format ?? null, profile: r.profile ?? null,
      output_check: broken, replaced, lint, timings: r.timings, search_detail: r.plan?.timings ?? null });
    return { ...r, reply, status: 'answered', conversationId: ex?.conversationId ?? null, path, ...(deepReport ? { deep_report: deepReport } : {}) };
  } catch (err) {
    if (ex) await d.fail({ ...ex, error: err?.message }).catch(() => {});
    throw err;
  }
}

// One Anis turn, for any channel (PRD §2): log the message first → Jev triage → canned reply, hidden tarpit, or the
// research answer (respond.js) → output check → voice lint → complete the log with the path. Transport-neutral: the
// widget streams onEvent, email uses the returned text. Every non-research reply costs zero LLM tokens.
// Deps (injectable): exchange-log, triage, canned, strikes, lint, channels, respond.
import { textRequest } from './text-request.js';
import { openExchange, closeExchange, failExchange } from './exchange-log.js';
import { triageMessage, routeTriage, outputBreaksPersona } from './triage.js';
import { cannedReply } from './canned.js';
import { strikes as liveStrikes, tarpitResponse } from './strikes.js';
import { lintReply } from './lint.js';
import { channelFor } from './channels.js';
import { turnMeta } from './turn-meta.js';
import { withAIContext, currentAIContext } from '../ai-context.js';
import { timed, timelineOf } from './timeline.js';

const OUTPUT_BREAK = 0.8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastUser = (messages) => [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';

async function defaultDeps() {
  const { anisRespond } = await import('./respond.js');
  return { respond: anisRespond, triage: triageMessage, outputCheck: outputBreaksPersona, open: openExchange, close: closeExchange,
    fail: failExchange, strikes: liveStrikes, sleep };
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
/** A message worth researching: two real words, or a passage of 40+ characters. Pure. */
export const hasSubstance = (text) => (String(text || '').match(/\p{L}{3,}/gu) || []).length >= 2 || String(text || '').trim().length >= 40
  // one bare name or title ("Ghoddus", "Vahid", "Nabil", "Dawnbreakers") is a lookup, not an unclear message (11-01 wording battery)
  || /^[\p{L}][\p{L}'’ʼ‘-]{3,}[?.!]?$/u.test(String(text || '').trim());

// Every turn runs under a per-turn METER (ai-context): each model call's model and cost land in the turn's path.meta
// (type · models · usd · latency) — what the daily conversation digest shows (Chad 10-22). An outer meter is reused.
export async function anisTurn(args) {
  const outer = currentAIContext().meter, timeline = currentAIContext().timeline || [];
  if (Array.isArray(outer)) return withAIContext({ timeline }, () => turnBody(args, outer, timeline));
  const meter = [];
  return withAIContext({ meter, timeline }, () => turnBody(args, meter, timeline));
}

async function turnBody({ messages, channel: channelName = 'widget-chat', trusted = false, profile = {}, participant = {},
  conversationId = null, clientKey = null, onEvent = () => {}, research = undefined, llm = undefined, deps }, meter = [], timeline = []) {
  const d = { ...(deps ? {} : await defaultDeps()), ...(deps || {}) };
  const channel = channelFor(channelName, { trusted });
  const text = lastUser(messages);
  const name = profile.persona_name || 'Anís';
  const seed = `${text}:${new Date().toISOString().slice(0, 10)}`;
  const t0 = Date.now();
  const who = clientKey || participant.id || 'anon';
  const logArgs = { participantId: participant.id ?? null, userId: participant.userId ?? null, conversationId, channel: channel.id, text };

  // Tarpit: templates only — no classifier, no LLM — at the pace of the path it imitates.
  if (d.strikes.inTarpit(who)) {
    const ex = await d.open(logArgs).catch(() => null);
    if (ex) onEvent({ type: 'session', conversation_id: ex.conversationId });
    const tp = tarpitResponse(text, { name });
    if (tp.looksLike === 'research') {
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
  const [ex, tri] = await Promise.all([timed('open-log', () => d.open(logArgs)).catch(() => null), timed('triage', () => d.triage(messages)).catch(() => null)]);
  if (ex) onEvent({ type: 'session', conversation_id: ex.conversationId });
  const route = routeTriage(tri);
  // "unclear" / "cut off" may only short-circuit a message with no substance. A real topic ("race unity") or a pasted
  // passage ("Find this. excerpt from a pilgrim note: …") goes to research (10-19 battery: both got a canned "say more" /
  // "part of your message went missing" instead of an answer — scored 1 against Immerse's 8)
  if (route.action === 'canned' && ['unclear', 'cut_off'].includes(route.kind) && hasSubstance(text)) Object.assign(route, { action: 'research', overridden: route.kind });
  // a pasted original or a translate / find-the-original request is research whatever triage called it (10-23 Liliane: her
  // Persian prayer + "can you translate this" was templated as small talk from a fresh address)
  if (route.action === 'canned' && textRequest(text).request) Object.assign(route, { action: 'research', overridden: route.kind });
  const triageSummary = tri && { kind: tri.kind?.choice, stance: tri.stance?.choice, reaction: tri.reaction?.choice,
    malicious: tri.malicious, stop: tri.stop_request, ms: tri.ms };
  const finish = async (reply, status, extra = {}) => {
    const path = { gate: route.action, kind: route.kind, triage: triageSummary, channel: channel.id, stop: route.stop, ...extra };
    path.meta = turnMeta({ status, path, meter, ms: Date.now() - t0 });
    // where the time went (route.timeline in the thread view): stage spans since turn start + each model call's completion
    path.timeline = timelineOf(timeline, t0); path.llm = meter.map((c) => ({ model: c.model, caller: c.caller ?? null, at: c.at ? c.at - t0 : null }));
    if (ex) await d.close({ ...ex, reply, status, path, channel: channel.id }).catch(() => {});
    // the Observatory terminal: that a turn happened, how it was routed — never its text or who asked
    import('../repos/activity-repo.js').then(({ logActivity }) => logActivity('anis', `${channel.id} · ${status}${route.kind ? ` · ${route.kind}` : ''}${extra.recipe ? ` · ${extra.recipe}` : ''}${extra.retrieved != null ? ` · ${extra.retrieved} paragraphs` : ''} · ${((Date.now() - t0) / 1000).toFixed(1)} s`)).catch(() => {});
    return path;
  };

  try {
    if (route.action === 'refuse' || route.action === 'canned') {
      if (route.strike) d.strikes.strike(who);
      const reply = cannedReply(route.action === 'refuse' ? 'refuse' : route.kind, { name, seed });
      onEvent({ type: 'stage', stage: 'craft' }); onEvent({ type: 'text', content: reply });
      const path = await finish(reply, 'canned');
      return { reply, status: 'canned', citations: [], retrieved: [], plan: null, conversationId: ex?.conversationId ?? null, path,
        timings: { total_ms: Date.now() - t0 } };
    }

    // research / llm: a caller's override (the /draft battery compares the researcher and writers before they go live)
    const r = await d.respond({ messages, profile, participant, onEvent, ...(llm ? { llm } : {}), direction: { stance: triageSummary?.stance ?? null,
      kind: route.kind, guarded: route.action === 'guarded', channel, ...(research !== undefined ? { research } : {}) } });
    let reply = r.reply;
    // Output check: a reply that abandons the persona or leaks instructions is replaced (the widget reconciles its
    // streamed text to the final reply; email sends only this).
    const broken = await timed('output-check', () => d.outputCheck(reply, { persona: name })).catch(() => null);
    const replaced = broken != null && broken >= OUTPUT_BREAK;
    if (replaced) { d.strikes.strike(who); reply = cannedReply('refuse', { name, seed }); }
    const lint = lintReply(reply);
    const path = await finish(reply, 'answered', { engine: 'anis', evidence: r.evidence ?? null, recipe: r.plan?.shape ?? null,
      // how the strategy was chosen (jev | jev:cached | backstop + why) and what the search was fed, for the thread view
      plan: { shape: r.plan?.shape ?? null, provenance: r.plan?.provenance ?? null, reason: r.plan?.reason ?? null, overridden: r.plan?.overridden ?? null,
        quote: r.plan?.quote?.phrase ?? null, ms: r.plan?.plan_ms ?? null, history_turns: Math.max(0, messages.length - 1), search_query: r.search_query ?? null,
        // the quote gate's work on the final text: sentences dropped for unverified quotes, introduced quotations placed/rewritten
        quotes_removed: r.quotes_removed ?? 0, quotes_completed: r.quotes_completed ?? null,
        // the five stages, each with its choice, who made it and the time: strategy (Jev) → phrases → retrieval → selection → format
        stages: { strategy: { choice: r.plan?.shape ?? null, by: r.plan?.provenance ?? null, reason: r.plan?.reason ?? null, ms: r.plan?.plan_ms ?? null },
          phrases: r.plan?.quote ? { choice: r.plan.quote.phrase, by: r.plan.quote.via } : r.plan?.phrases ? { choice: r.plan.phrases.phrase, by: r.plan.phrases.via } : null,
          retrieval: { choice: r.retrieved?.length ?? 0, by: 'planned-search', ms: r.timings?.search_ms ?? null },
          selection: r.select ? { choice: `${r.select.kept}/${r.select.of}`, by: r.select.by } : null,
          format: r.format ? { choice: r.format.id, by: r.format.by } : null } },
      retrieved: r.retrieved?.length ?? 0,
      format: r.format ?? null, profile: r.profile ?? null,
      output_check: broken, replaced, lint, timings: r.timings, search_detail: r.plan?.timings ?? null });
    return { ...r, reply, status: 'answered', conversationId: ex?.conversationId ?? null, path };
  } catch (err) {
    if (ex) await d.fail({ ...ex, error: err?.message }).catch(() => {});
    throw err;
  }
}

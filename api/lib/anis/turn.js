// One Anis turn, for any channel (PRD §2): log the message first → Jev triage → canned reply, hidden tarpit, or the
// research answer (respond.js) → output check → voice lint → complete the log with the path. Transport-neutral: the
// widget streams onEvent, email uses the returned text. Every non-research reply costs zero LLM tokens.
// Deps (injectable): exchange-log, triage, canned, strikes, lint, channels, respond.
import { openExchange, closeExchange, failExchange } from './exchange-log.js';
import { triageMessage, routeTriage, outputBreaksPersona } from './triage.js';
import { cannedReply } from './canned.js';
import { strikes as liveStrikes, tarpitResponse } from './strikes.js';
import { lintReply } from './lint.js';
import { channelFor } from './channels.js';

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
export async function anisTurn({ messages, channel: channelName = 'widget-chat', trusted = false, profile = {}, participant = {},
  conversationId = null, clientKey = null, onEvent = () => {}, deps }) {
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
    if (ex) await d.close({ ...ex, reply: tp.text, status: 'tarpit', path: { gate: 'tarpit' }, channel: channel.id }).catch(() => {});
    return { reply: tp.text, status: 'tarpit', citations: [], retrieved: [], plan: null, conversationId: ex?.conversationId ?? null,
      timings: { total_ms: Date.now() - t0 } };
  }

  // Write it down before trying — in parallel with triage, so logging adds no latency.
  const [ex, tri] = await Promise.all([d.open(logArgs).catch(() => null), d.triage(messages).catch(() => null)]);
  if (ex) onEvent({ type: 'session', conversation_id: ex.conversationId });
  const route = routeTriage(tri);
  const triageSummary = tri && { kind: tri.kind?.choice, stance: tri.stance?.choice, reaction: tri.reaction?.choice,
    malicious: tri.malicious, stop: tri.stop_request, ms: tri.ms };
  const finish = async (reply, status, extra = {}) => {
    const path = { gate: route.action, kind: route.kind, triage: triageSummary, channel: channel.id, stop: route.stop, ...extra };
    if (ex) await d.close({ ...ex, reply, status, path, channel: channel.id }).catch(() => {});
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

    const r = await d.respond({ messages, profile, participant, onEvent, direction: { stance: triageSummary?.stance ?? null,
      kind: route.kind, guarded: route.action === 'guarded', channel } });
    let reply = r.reply;
    // Output check: a reply that abandons the persona or leaks instructions is replaced (the widget reconciles its
    // streamed text to the final reply; email sends only this).
    const broken = await d.outputCheck(reply, { persona: name }).catch(() => null);
    const replaced = broken != null && broken >= OUTPUT_BREAK;
    if (replaced) { d.strikes.strike(who); reply = cannedReply('refuse', { name, seed }); }
    const lint = lintReply(reply);
    const path = await finish(reply, 'answered', { engine: 'anis', recipe: r.plan?.shape ?? null, retrieved: r.retrieved?.length ?? 0,
      format: r.format ?? null, profile: r.profile ?? null,
      output_check: broken, replaced, lint, timings: r.timings });
    return { ...r, reply, status: 'answered', conversationId: ex?.conversationId ?? null, path };
  } catch (err) {
    if (ex) await d.fail({ ...ex, error: err?.message }).catch(() => {});
    throw err;
  }
}

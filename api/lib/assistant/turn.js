// One Anis turn, for any channel (PRD §2): log the message first → Jev triage → canned reply, hidden tarpit, or the
// research answer (respond.js) → output check → voice lint → complete the log with the path. Transport-neutral: the
// widget streams onEvent, email uses the returned text. Every non-research reply costs zero LLM tokens.
// Deps (injectable): exchange-log, triage, canned, strikes, lint, channels, respond.
import { makeLimits, SPEND_CAP_REPLY } from './limits.js';
import { assertSpendCap, isSpendCap, TEST_BILL_TO } from '../spend-caps.js';
import { loadReaderCard } from './reader-card.js';
import { resolveQuery } from './short-turn.js';
import { openExchange, closeExchange, failExchange } from './exchange-log.js';
import { findInWorkAnswer, findPassageAnswer } from './find-in-work.js';
import { triageMessage, routeTriage, outputBreaksPersona, T } from './triage.js';
import { cannedReply } from './canned.js';
import { strikes as liveStrikes, tarpitResponse } from './strikes.js';
import { lintReply, formPass } from './lint.js';
import { channelFor } from './channels.js';
import { narrate } from './narrate.js';
import { turnMeta } from './turn-meta.js';
import { progressText } from './progress.js';
import { chooseStrategy, strategyOf } from './strategy-choice.js';
// strategies that build a document from many passages (a compilation, a timeline, a comparison): a lookup shortcut never answers for them
const MAKE_STRATEGIES = new Set(['compilation', 'timeline', 'comparison']);
import { isUnmatched as unmatchedName } from './strategy-seed.js';
import { titleOnly, titleAnswer, sectionAnswer, softCaps } from './title-answer.js';
import { bookFastPath } from './book-pick.js';
import { timeoutDecision, jevTimeoutsOf } from './jev-call.js';   // W3: Jev chooses the strategy from context
import { jevBackup } from './jev-backup.js';   // Jev timed out → one Haiku answers the same typed options (11-10)
import { restate, understoodText, tarpitPhrase } from './understanding.js';   // W3: the "what I understood" line
import { decisionLog } from './decision-log.js';
import { emptyState, applyPatch, resolveScope, conversationLayer, readerLayer, siteLayer, treePatch, lastTopic, sanitizePatch } from './units.js';   // conversation_state + scope layers
import { openJevTurn, linkJevTurn, jevTurnCalls } from '../systemone.js';   // every Jev call of the turn carries its <thread>:<round> ref
import { withAIContext, currentAIContext, setAIContext } from '../ai-context.js';
import { timed, timelineOf } from './timeline.js';
import { phraseStage } from './phrases.js';
import { resolveLookup } from './lookup.js';
import { createHash } from 'node:crypto';
import { makeDocuments, DOC_TEXT } from './pdf/documents.js';   // Jev document = pdf_* → a branded PDF, link or mail
import { makeReports, renderReport, emailIn, REPORT_TEXT } from './deep-report.js';   // Jev depth = deep_report → a queued job + mail
import { widgetBlock } from './widgets/index.js';
import { cacheDeps, cacheKey, cacheEligible, CARD_EVENTS } from './precache.js';   // precached common questions: opening site-chat turns, warm job writes

const OUTPUT_BREAK = 0.8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastUser = (messages) => [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';

const liveLimits = makeLimits();
/** What ran for the turn: { shape, strategy: id, version, graphs, jev: {refers_back, sides, sources, units} } — the trace shows it (admin-threads turnTrace). Pure. */
export function strategyRun(strat, graphRuns = [], shape = null) {
  const id = strategyOf(strat), graphs = (graphRuns || []).map((x) => x.graph).filter(Boolean), ran = id ? graphs.find((g) => g.startsWith(`${id}@`)) : null;
  return { shape, strategy: id, version: ran ? Number(ran.split('@')[1]) : null, graphs,
    jev: strat ? { picked: strat.strategy?.choice ?? null, was: strat.strategy?.was ?? null, refers_back: !!strat.refersBack, sides: strat.sides ?? [], sources: strat.sources ?? {}, units: strat.units ?? {} } : null };
}

// THE WORK IN FOCUS (11-10, "yes, can you search it for …" after a title card): the work the PREVIOUS turn gave — its thread entry
// is a book / in_work turn and a title was given at that turn (recorded by workPatch below, from the turn's own path, never from text).
const WORK_TURNS = ['book', 'in_work'];
/** conversation_state → { id, title } of the work the last turn gave, or null. Pure. */
export function focusWork(state = emptyState()) {
  const e = state?.thread?.at?.(-1);
  if (!e || !WORK_TURNS.includes(e.strategy)) return null;
  const g = (state.given || []).filter((x) => x.turn === e.turn && x.kind === 'title').at(-1);
  const id = Number(g?.ref);
  return Number.isFinite(id) && id > 0 ? { id, title: e.topic || null } : null;
}
/** The code patch a work-giving turn stores (thread entry + the title given). Pure. */
export const workPatch = ({ turn, strategy, id, title, section = null }) => sanitizePatch({ thread: [{ turn, strategy, topic: title || null, found_outcome: 'one' }],
  given: [{ turn, kind: 'title', ref: String(id) }, ...(section ? [{ turn, kind: 'section', ref: `${id}:${section.start}-${section.end}` }] : [])] }, 'code');

export async function defaultDeps() {   // exported for the strategy dry run (strategy-try.js), which swaps the thread/mail deps out
  const { anisRespond } = await import('./respond.js');
  return { respond: anisRespond, triage: triageMessage, outputCheck: outputBreaksPersona, open: openExchange, close: closeExchange,
    fail: failExchange, strikes: liveStrikes, sleep, lookup: resolveLookup, limits: liveLimits, spendCap: assertSpendCap, card: loadReaderCard, resolve: resolveQuery, reports: makeReports(), documents: makeDocuments(), cache: cacheDeps(),
    state: await import('../repos/conversation-state-repo.js').then((m) => ({ load: m.getConversationState, append: m.appendStatePatch })) };
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
// the "something new" option Jev weighs beside the existing works when his strategy would MAKE or chat rather than open a book
const LONG_UNIT = 20;   // paragraphs: a numbered reference longer than this is carded, not quoted
// a numbered unit's card title: the section's own title ("CHAPTER XXV") + the chapter's ALL-CAPS title line when the book has one
// (its mixed-case headings are marginal notes, not the chapter's name); else the first heading. Pure.
// a numbered unit whose OPENING Jev read as asked (work_place opening): its first paragraph(s) — amount_wanted, else one — never the whole unit
/** A reference unit's whole range as a given-section ref "doc:start-end" (units.lastSection reads it back), or null. Pure. */
export const sectionRef = (lk) => { const ps = lk?.passages || [], d = lk?.work?.doc?.id ?? ps[0]?.document_id ?? ps[0]?.doc_id, a = ps[0]?.paragraph_index, b = ps.at(-1)?.paragraph_index;
  return Number.isFinite(Number(d)) && Number.isFinite(a) && Number.isFinite(b) ? `${Number(d)}:${a}-${b}` : null; };
export const openingOf = (lk, u = {}) => (lk?.kind === 'reference' && u.work_place === 'opening' && lk.passages?.length > 1
  ? { ...lk, passages: lk.passages.slice(0, Math.max(1, Math.min(LONG_UNIT, Number(u.amount_wanted?.n ?? u.amount_wanted) || 1))) } : lk);
const unitTitle = (lk, first) => {
  const h = String(first?.heading || '').trim(), caps = h && !/\p{Ll}/u.test(h);
  if (!lk.unit_title) return h ? softCaps(h) : null;
  const t = softCaps(lk.unit_title);
  return caps && softCaps(h) !== t ? `${t}: ${softCaps(h)}` : t;
};
const PROBE_ALT = {
  compilation: 'a NEW compilation gathered on this topic (not an existing work in the library)',
  about: 'a question or conversation about Anís or the library itself, not a particular work',
  unmatched: 'a question or search on this topic, not a particular existing work',
};

export async function anisTurn(args) {
  const outer = currentAIContext().meter, timeline = currentAIContext().timeline || [];
  // a TEST turn (args.test, or a scope already billed elsewhere: draft batteries, replays) bills to the improve budget and stops
  // at its cap; any other turn is a real reader's — counted, never refused for spend (Chad 11-06; spend-caps.js)
  const billed = currentAIContext().billTo || (args.test ? TEST_BILL_TO : null);
  const scope = billed ? { billTo: billed, organic: false } : { organic: true };
  if (Array.isArray(outer)) return withAIContext({ timeline, ...scope }, () => turnBody(args, outer, timeline));
  const meter = [];
  return withAIContext({ meter, timeline, ...scope }, () => turnBody(args, meter, timeline));
}

async function turnBody({ messages, channel: channelName = 'widget-chat', trusted = false, profile = {}, participant = {},
  conversationId = null, clientKey = null, onEvent: rawEvent = () => {}, research = undefined, engine = undefined, llm = undefined, variants = undefined, deps, test = false, warm = false }, meter = [], timeline = []) {
  const d = { ...(deps ? {} : await defaultDeps()), ...(deps || {}) };
  // every stage event also says, in words, what Anís is doing (the site chat shows it)
  const shown = [];   // the cards the reader saw (book, passage, quote_cards, books): a warmed answer replays them
  const onEvent = (ev) => { if (CARD_EVENTS.has(ev?.type)) shown.push(ev); rawEvent(ev); const p = ev?.type === 'stage' ? progressText(ev.stage) : null; if (p) rawEvent({ type: 'progress', stage: ev.stage, text: p }); };
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

  // the anis group's daily spend cap: a short polite reply (never a 5xx), no classifier, no LLM
  const spendLimited = async () => { onEvent({ type: 'text', content: SPEND_CAP_REPLY }); return { reply: SPEND_CAP_REPLY, status: 'limited', limit: 'spend-cap', citations: [], retrieved: [], plan: null, conversationId: null, timings: { total_ms: Date.now() - t0 } }; };
  if (d.spendCap) { try { await d.spendCap('anis-turn'); } catch (err) { if (isSpendCap(err)) return spendLimited(); throw err; } }

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

  // PRECACHED (precache.js): an opening site-chat question the warm job (ops anis-precache) answered at the current SEARCH_VERSION is served
  // at once — reply, cards, sources — with the turn logged as gate 'cache'. Test turns never read it (they measure the pipeline); a stale row is a miss.
  const cacheable = !!d.cache && cacheEligible({ messages, channel: channel.id, profile, overrides: [research, engine, llm, variants] });
  if (cacheable && !test && !warm) {
    const hit = await timed('answer-cache', () => d.cache.lookup(text, cacheKey(name, channel.id))).catch(() => null);
    if (hit) {
      const ex = await d.open(logArgs).catch(() => null);
      if (ex) onEvent({ type: 'session', conversation_id: ex.conversationId });
      onEvent({ type: 'sources', sources: hit.citations, plan: { shape: 'cache', strategy: hit.strategy }, ms: Date.now() - t0 });
      for (const ev of hit.events) onEvent(ev);
      const path = { gate: 'cache', route: 'cache', strategy: hit.strategy, cache: { id: hit.id, version: hit.version, warmed_at: hit.warmed_at }, meta: turnMeta({ status: 'answered', meter, ms: Date.now() - t0 }),
        timeline: timelineOf(timeline, t0), llm: [] };
      if (ex) await d.close({ ...ex, reply: hit.reply, status: 'answered', path, channel: channel.id }).catch(() => {});
      Promise.resolve(d.cache.served?.(hit, Date.now() - t0)).catch(() => {});
      const qcards = hit.events.filter((e) => e.type === 'quote_cards').flatMap((e) => e.cards || []), qbooks = hit.events.filter((e) => e.type === 'books').flatMap((e) => e.books || []);
      return { reply: hit.reply, status: 'answered', citations: hit.citations, retrieved: hit.retrieved, plan: { shape: 'cache', strategy: hit.strategy }, conversationId: ex?.conversationId ?? null,
        timings: { total_ms: Date.now() - t0 }, ...(qcards.length ? { quote_cards: qcards } : {}), ...(qbooks.length ? { books: qbooks } : {}) };
    }
  }

  // A message that is ONLY a library book's title → that book at once (title-answer.js): link, cached summary, offer; no Jev, no
  // search, no writer (Chad 11-09: "the user is stating the name of the book without any extra bits" — 12 s was unacceptable).
  // Code resolves only: the whole message must equal a book's title in the title index. Anything more goes to Jev as usual.
  const titleFn = d.titleOnly ?? (deps ? null : titleOnly);
  const titled = titleFn && engine === undefined && research === undefined && !variants && !llm ? await titleFn(text).catch(() => null) : null;
  // the book card answer (one book event, description, link, offer): the bare-title gate below and Jev's book strategy on a named-work-only turn
  const rememberWork = (ex, strategy, doc) => (ex?.conversationId && d.state?.append && doc?.id
    ? d.state.append({ conversationId: ex.conversationId, turn: ex.round, by: 'code', patch: workPatch({ turn: ex.round, strategy, id: doc.id, title: doc.title, section: doc.section }) }).catch((err) => console.warn(`[conversation-state] work focus not stored: ${err?.message}`))
    : null);
  const bookAnswer = async (work, ex, extra = {}) => {
    onEvent({ type: 'sources', sources: [], plan: { shape: 'work', work: work.doc.id }, ms: Date.now() - t0 });
    onEvent({ type: 'stage', stage: 'craft' });
    const { reply, citations } = await (d.titleAnswer ?? titleAnswer)(work, { onEvent });
    onEvent({ type: 'sources', sources: citations, plan: { shape: 'work', work: work.doc.id }, ms: Date.now() - t0 });
    const path = { gate: 'title', route: 'title', strategy: 'book', work: work.doc.id, ...extra, meta: turnMeta({ status: 'answered', meter, ms: Date.now() - t0 }),
      timeline: timelineOf(timeline, t0), llm: meter.map((c) => ({ model: c.model, caller: c.caller ?? null, at: c.at ? c.at - t0 : null })) };
    if (ex) await d.close({ ...ex, reply, status: 'answered', path, channel: channel.id }).catch(() => {});
    await rememberWork(ex, 'book', work.doc);
    return { reply, status: 'answered', citations, retrieved: [], plan: { shape: 'work', work: work.doc.id }, conversationId: ex?.conversationId ?? null,
      timings: { total_ms: Date.now() - t0 } };
  };
  // a SUB-DOCUMENT's card (a letter, chapter or book of scripture inside a larger work): its title, the work, the link to where it starts
  const sectionCard = async ({ sec, doc }, ex, extra = {}) => {
    const plan = { shape: 'work', work: doc?.id ?? sec.doc_id, section: sec.title };
    onEvent({ type: 'sources', sources: [], plan, ms: Date.now() - t0 });
    onEvent({ type: 'stage', stage: 'craft' });
    const { reply, citations } = await (d.sectionAnswer ?? sectionAnswer)({ sec, doc }, { onEvent });
    onEvent({ type: 'sources', sources: citations, plan, ms: Date.now() - t0 });
    const path = { gate: 'title', route: 'title', strategy: 'book', work: plan.work, section: { title: sec.title, start_index: sec.start_index }, ...extra, meta: turnMeta({ status: 'answered', meter, ms: Date.now() - t0 }),
      timeline: timelineOf(timeline, t0), llm: meter.map((c) => ({ model: c.model, caller: c.caller ?? null, at: c.at ? c.at - t0 : null })) };
    if (ex) await d.close({ ...ex, reply, status: 'answered', path, channel: channel.id }).catch(() => {});
    // the chapter itself is remembered too, so "summarize that chapter" next turn reads THIS chapter (11-12 Dawn-Breakers: it searched the library instead)
    const section = Number.isFinite(sec.start_index) && Number.isFinite(sec.end_index) ? { start: sec.start_index, end: sec.end_index } : null;
    await rememberWork(ex, 'book', { id: plan.work, title: doc?.title ?? sec.book ?? null, section });
    return { reply, status: 'answered', citations, retrieved: [], plan, conversationId: ex?.conversationId ?? null, timings: { total_ms: Date.now() - t0 } };
  };
  // the in-work find's list (find-in-work.js inWorkReply: built by code, no writer), links upgraded to OceanLibrary ranges like any reply
  const inWorkAnswer = async (got, ex, extra = {}) => {
    const r = got.result, plan = { shape: got.work ? 'work' : 'passage', ...(got.work ? { work: got.work.id } : {}), ...(got.section ? { section: got.section.title } : {}), find: r.query, mode: r.mode };
    const citations = r.passages.map((p) => ({ id: p.id, title: p.title, author: p.author, document_id: p.document_id, paragraph_index: p.paragraph_index, place: p.place ?? null, url: p.url ?? null, text: p.text }));
    onEvent({ type: 'sources', sources: citations, plan, ms: Date.now() - t0 });
    onEvent({ type: 'stage', stage: 'craft' });
    // one found passage = a card (cover, the passage with the phrase marked, the whole card a link), before the text; the text stays for other channels
    for (const passage of got.cards || []) onEvent({ type: 'passage', passage });
    const up = d.upgradeLinks ?? (deps ? null : async (x) => (await import('../ocean-links.js')).upgradeOceanLinks(x));
    const reply = (up ? await Promise.resolve().then(() => up(got.reply)).catch(() => got.reply) : got.reply) || got.reply;
    onEvent({ type: 'text', content: reply });
    const path = { gate: 'lookup', route: got.work ? 'in_work' : 'find_passage', ...(got.work ? { work: got.work.id } : {}), ...(got.section ? { section: { title: got.section.title, start_index: got.section.start_index } } : {}),
      find: r.query, mode: r.mode, total: r.total, ...extra, meta: turnMeta({ status: 'answered', meter, ms: Date.now() - t0 }),
      timeline: timelineOf(timeline, t0), llm: meter.map((c) => ({ model: c.model, caller: c.caller ?? null, at: c.at ? c.at - t0 : null })) };
    if (ex) await d.close({ ...ex, reply, status: 'answered', path, channel: channel.id }).catch(() => {});
    if (got.work) await rememberWork(ex, 'in_work', { id: got.work.id, title: got.work.title ?? r.work?.title ?? null });
    return { reply, status: 'answered', citations, retrieved: [], plan, conversationId: ex?.conversationId ?? null, timings: { total_ms: Date.now() - t0 } };
  };
  if (titled) {
    const ex = await d.open(logArgs).catch(() => null);
    if (ex) onEvent({ type: 'session', conversation_id: ex.conversationId });
    return bookAnswer(titled, ex);
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
  openJevTurn();   // calls made from here (triage, strategy, …) are remembered and stamped with the turn once its thread exists
  setAIContext({ graphRuns: [] });   // every strategy-graph run of the turn (graph.js) → step_runs/turn_runs at finish (strategy-stats-repo)
  const jevTimeouts = []; const onJev = (info) => { jevTimeouts.push(info); };
  // the conversation_state loads once the thread exists (d.state; none = empty), then Jev chooses the strategy AND patches the state in that one call
  const openP = timed('open-log', () => d.open(logArgs)).catch(() => null);
  let stateBefore = emptyState();
  const stratP = strategyOn ? openP.then(async (ex0) => {
    if (d.state && ex0?.conversationId) stateBefore = await d.state.load(ex0.conversationId).catch(() => emptyState());
    return timed('strategy', () => strategyFn(messages, { profile, onJev, conversationState: stateBefore, turn: ex0?.round ?? null }), (r) => (r ? { choice: r.strategy?.choice, sides: r.sides } : null)).catch(() => null);
  }) : null;
  let [ex, tri, strat] = await Promise.all([openP, timed('triage', () => d.triage(messages, { card: card?.text ?? null, channel: channel.id, onJev })).catch(() => null), stratP]);
  if (ex) onEvent({ type: 'session', conversation_id: ex.conversationId });
  const focus = focusWork(stateBefore);
  // JEV TIMED OUT (11-10): a turn whose triage and/or strategy call ran out of time is not failed open to research — ONE Haiku call
  // answers the same typed options with the history and the work in focus (jev-backup.js). Jev's own limits are unchanged.
  const lost = (call) => jevTimeouts.some((i) => i.call === call && i.value == null);
  const needTri = !tri && lost('triage'), needStrat = strategyOn && !strat && lost('strategy');
  const backupFn = d.jevBackup ?? (deps ? null : jevBackup);
  const backup = backupFn && (needTri || needStrat)
    ? await timed('triage-backup', () => backupFn({ messages, card: card?.text ?? null, focus, triage: needTri, strategy: needStrat }), (r) => (r ? { lookup: r.tri?.lookup?.choice, strategy: r.strategy?.strategy?.choice } : null)).catch(() => null)
    : null;
  if (backup?.tri && needTri) tri = backup.tri;
  if (backup?.strategy && needStrat) strat = backup.strategy;
  const route = routeTriage(tri);
  // every search this turn makes is traced with its thread + turn (search_trace.thread_id / turn_id = "<thread>:<round>")
  if (ex?.conversationId) setAIContext({ trace: { ...(currentAIContext().trace || {}), thread: ex.conversationId, turn: `${ex.conversationId}:${ex.round}`,
    route: [route.action, route.kind].filter(Boolean).join(':') || null } });
  if (ex?.conversationId) linkJevTurn(`${ex.conversationId}:${ex.round}`);
  // SCOPE through the layers (turn > conversation > reader > site > default): this turn's Jev patch, the stored state, the reader card, the host profile
  const jevPatch = strat?.patch?.jev || {}, turnOnly = strat?.patch?.turnOnly || null, turnNo = ex?.round ?? null;
  const scopeR = resolveScope({ turn: { ...(jevPatch.scope || {}), ...(jevPatch.reader || {}), ...(turnOnly?.scope || {}) }, conversation: conversationLayer(stateBefore), reader: readerLayer(card?.data), site: siteLayer(profile) });
  const scope = { religion: scopeR.religion, units: scopeR.units, source: scopeR.units.scope_source, sources: scopeR.sources };   // sources: unit → layer (entryUnits: a default floor is no filter)
  let codePatch = null;
  const decisions = decisionLog(strat?.decisions || []);   // every strategy decision of the turn (inputs, options, probabilities, branch) → path.decisions
  for (const info of jevTimeouts) decisions.record('jev:timeout', timeoutDecision(info));
  // Jev's triage answer on every turn's record (11-11: a follow-up skipped the in-book path and the trace could not say what lookup he gave)
  if (tri) decisions.record('triage', { by: tri.by || (backup?.tri === tri ? 'llm' : 'jev'), chosen: { kind: tri.kind?.choice ?? null, lookup: tri.lookup?.choice ?? null, outcome: tri.outcome?.choice ?? null },
    probabilities: { kind: tri.kind?.confidence ?? null, lookup: tri.lookup?.confidence ?? null, outcome: tri.outcome?.confidence ?? null }, reason: focus ? `in focus: ${focus.title}` : null });
  const jevFallback = needTri || needStrat ? { calls: [needTri && 'triage', needStrat && 'strategy'].filter(Boolean), by: backup ? 'haiku' : 'fail open',
    lookup: backup?.tri?.lookup?.choice ?? null, strategy: backup?.strategy?.strategy?.choice ?? null, ms: backup?.ms ?? null } : null;
  if (jevFallback) decisions.record('jev:fallback', { by: backup ? 'llm' : 'code', saw: jevFallback.calls.join('+'), options: ['haiku', 'fail open'], chosen: jevFallback.by,
    reason: backup ? JSON.stringify({ kind: backup.tri?.kind?.choice ?? null, lookup: jevFallback.lookup, outcome: backup.tri?.outcome?.choice ?? null, strategy: jevFallback.strategy }) : 'backup gave no answer', ms: jevFallback.ms });
  // Jev's OUTCOME field — the turn read with the history and the card — decides what a short or odd message is; its words
  // never do (Chad 11-03). A search behind an "unclear" / "cut off" verdict is researched ("race unity", a bare name, a
  // pasted passage); a turn even the context cannot resolve is asked back (the 'unclear' canned reply).
  const outcome = tri?.outcome?.choice ?? null, outcomeC = tri?.outcome?.confidence ?? 0;
  if (route.action === 'canned' && ['unclear', 'cut_off'].includes(route.kind) && outcome === 'search' && outcomeC >= T.outcome) Object.assign(route, { action: 'research', overridden: route.kind, by: 'outcome' });
  if (route.action === 'research' && outcome === 'ask_back' && outcomeC >= T.askBack) Object.assign(route, { action: 'canned', kind: 'unclear', overridden: 'research', by: 'outcome' });
  // Jev's own confident call that this fetches something exact outranks his "unclear" (a bare "Gleanings 1" reads as unclear to the message-kind question)
  if (route.action === 'canned' && ['unclear', 'cut_off'].includes(route.kind) && ['book', 'quote', 'in_work', 'find_passage', 'reference'].includes(tri?.lookup?.choice) && (tri.lookup.confidence ?? 0) >= 0.8) Object.assign(route, { action: 'research', overridden: route.kind });
  // Jev's refers_back (strategy call, read with the history): a message pointing at the previous reply is never 'unclear' and never a literal quote lookup
  if (strat?.refersBack && route.action === 'canned' && ['unclear', 'cut_off'].includes(route.kind)) Object.assign(route, { action: 'research', overridden: route.kind, by: 'refers_back' });
  // "search it for X": refers back to the book in focus, or to the work Jev names from the history — that IS the in-work find
  const focusFind = tri?.lookup?.choice === 'in_work' && (!!focus || !!strat?.units?.named_work);
  const lkIntent = lookupOn && (!strat?.refersBack || focusFind) && route.action === 'research' && ['book', 'quote', 'in_work', 'find_passage', 'reference'].includes(tri?.lookup?.choice) && (tri.lookup.confidence ?? 0) >= 0.6 ? tri.lookup.choice : null;
  // THE BOOK FAST PATH (Chad 11-10): Jev chose the book strategy (or his lookup says book) → code gathers title + section candidates for
  // the name he gave (his named_work; a person he named beside it is the byline: author or compiler) → ONE typed Jev pick → the card.
  // Nothing fits → one Haiku names the work, then candidates + Jev again; still nothing → the research below. A topic or person
  // beside the work no longer blocks it: the strategy is Jev's ("do you have the Research Department's “Deepening” compilation?").
  const u = strat?.units || {};
  const bookFn = d.bookPick ?? (deps ? null : bookFastPath);
  const bookGate = bookFn && !strat?.refersBack && route.action === 'research' && engine === undefined && research === undefined && !variants && !llm;
  // Unmatched + a lookup call that says book at ANY confidence (or no strategy; 11-10 "Matthew": the Haiku backup's book sat under 0.6, so the card
  // came only after Unmatched + the planner, 16.5 s) → the pick runs first; its "none" option keeps the call Jev's
  const weakBook = bookGate && strategyOf(strat) == null && tri?.lookup?.choice === 'book' && lkIntent !== 'book';
  const bookOn = bookGate && (strategyOf(strat) === 'book' || lkIntent === 'book' || weakBook);
  if (weakBook) decisions.record('book:early', { by: 'code', saw: { strategy: 'unmatched', lookup: tri.lookup }, chosen: 'book pick before Unmatched', reason: 'the lookup call said book' });
  let held = null;   // the pick's near miss (book-pick.js onHeld), confirmed by a later Jev book call
  // IN-WORK FIND (Chad 11-10, 'search for "private property" in God Passes By' got "I can't run a literal search from here"):
  // Jev's lookup says in_work (the triage call — it still answers when the strategy call times out, so the request is never lost)
  // → the work by the one book finder (his named_work when the strategy answered, else the message) → in_work_search → a
  // code-built list (count line, each place linked, the words bold). No writer. No work or no words resolved → research as before.
  const inWorkFn = d.findInWork ?? (deps ? null : findInWorkAnswer);
  if (inWorkFn && lkIntent === 'in_work' && (!strat?.refersBack || focusFind) && engine === undefined && research === undefined && !variants && !llm) {
    // no work named this turn + a work in focus → that work, no book finder (code resolves; the in_work intent is Jev's or the backup's)
    const useFocus = focus && !u.named_work;
    if (useFocus) decisions.record('in-work:focus', { by: 'code', saw: { named_work: null, focus }, chosen: focus.id, reason: 'no work named this turn: the work the previous turn gave' });
    const finder = useFocus ? async () => ({ kind: 'work', work: { doc: { id: focus.id, title: focus.title } }, via: 'focus' }) : bookFn;
    const got = await timed('in_work', () => inWorkFn({ messages, names: [u.named_work].filter(Boolean), by: u.named_person ?? null, topic: u.topic ?? null, profile, decisions,
      deps: { ...(finder ? { bookFastPath: finder } : {}) }, ...(useFocus ? { focus } : {}) }), (r) => (r ? { work: r.work?.id, mode: r.result?.mode, total: r.result?.total } : null)).catch(() => null);
    if (got?.reply) return inWorkAnswer(got, ex, { gate: 'lookup', strategy_timed_out: !strat || strat.by === 'haiku', ...(jevFallback ? { jev_fallback: jevFallback } : {}), ...(useFocus ? { via: 'focus' } : {}), decisions: decisions.list() });
    // the words named only the work ("world order letters?") → the book card, never a search of the work for its own title
    if (!useFocus && got?.book?.kind === 'work') return bookAnswer(got.book.work, ex, { gate: 'lookup', via: got.book.via, decisions: decisions.list() });
    if (got?.book?.kind === 'section') return sectionCard(got.book, ex, { gate: 'lookup', via: got.book.via, decisions: decisions.list() });
  }
  // FIND A PASSAGE (Chad 11-10: "Find quote is the tool; the strategy and context provide the filters"): Jev's lookup says find_passage (the passage
  // that says X, no book named) → quote_search held to Jev's units: the religions he scoped (this turn / conversation, never a host default),
  // the person he named as the author, a work he named → a code-built list. No words resolved → research as before.
  const passageFn = d.findPassage ?? (deps ? null : findPassageAnswer);
  // …never when Jev chose to MAKE something from passages (11-12 battery: "a short compilation … from Bahá'u'lláh's writings" got a
  // find-passage list of scholars' sentences labelled Bahá'u'lláh): the strategy is his, the shortcut only serves a plain find
  const makes = MAKE_STRATEGIES.has(strategyOf(strat));
  if (makes && lkIntent === 'find_passage') decisions.record('find-passage:skip', { by: 'code', saw: { strategy: strategyOf(strat), lookup: 'find_passage' }, chosen: 'strategy', reason: 'Jev chose a strategy that builds from passages' });
  if (passageFn && lkIntent === 'find_passage' && !makes && !strat?.refersBack && engine === undefined && research === undefined && !variants && !llm) {
    const explicit = ['turn', 'conversation'].includes(scopeR.units.scope_source) ? scopeR.units.religions_specified : null;
    const got = await timed('find_passage', () => passageFn({ messages, religions: Array.isArray(explicit) ? explicit : [], authors: [u.named_person].filter(Boolean), works: [u.named_work].filter(Boolean),
      topic: u.topic ?? null, language: scopeR.units.reply_language || 'en', decisions }), (r) => (r ? { mode: r.result?.mode, total: r.result?.total } : null)).catch(() => null);
    if (got?.reply) return inWorkAnswer(got, ex, { gate: 'lookup', ...(jevFallback ? { jev_fallback: jevFallback } : {}), decisions: decisions.list() });
  }
  // PROBE (Chad 11-10, "Deepening Compilation" built a compilation): Jev chose to MAKE something (a compilation) or to talk, but
  // his phrase may BE a library title — the same one pick, with "make it new" as an option; code only checks the title is near-exact
  // strategyOf() is null for Unmatched (and a timed-out strategy call), so those turns take the unmatched option by name (11-11:
  // '"Dispensation of Baha'u'llah"' — Unmatched, lookup quote — never reached the probe and got a quote search of its own title)
  const probeKey = strategyOf(strat) ?? (unmatchedName(strat?.strategy?.choice) || (!strat && lkIntent === 'quote') ? 'unmatched' : null);
  const probe = bookGate && !bookOn ? PROBE_ALT[probeKey] : null;
  const lookupNow = () => timed('lookup', () => d.lookup(messages, { intent: lkIntent, focus, work: u.named_work ?? null, profile, decisions, onJev: (info) => decisions.record('jev:timeout', timeoutDecision(info)) }), (r) => (r ? { kind: r.kind, intent: lkIntent } : { intent: lkIntent })).catch(() => null);
  // Jev read a numbered reference: it resolves BEFORE the book card, which answers only when no numbered unit is found (11-11
  // "Dawn-Breakers - Chapter 25": named-work-only made it the book strategy and it carded a one-chapter scrape instead)
  const lkFirst = lkIntent === 'reference' && (bookOn || probe) ? await lookupNow() : undefined;
  if ((bookOn || probe) && !lkFirst) {
    const found = await timed('book', () => bookFn({ messages, names: [u.named_work, ...(probe ? [u.topic] : [])].filter(Boolean), by: u.named_person ?? null, profile, decisions, ...(probe ? { alt: probe } : { onHeld: (f) => { held = f; } }) }),
      (r) => (r ? { kind: r.kind, via: r.via } : null)).catch(() => null);
    // the book strategy covers "find words in it" (book-pick.js): words quoted beside the resolved book → the in-work find ON that book, not its card
    // (11-10: 'Search The Dawn-Breakers for "Letters of the Living"' — Jev: book, the triage gave no in_work). No quoted words → null → the card.
    if (!probe && inWorkFn && (found?.kind === 'work' || found?.kind === 'section')) {
      const got = await timed('in_work', () => inWorkFn({ messages, names: [], by: null, topic: null, profile, decisions, deps: { bookFastPath: async () => found } }),
        (r) => (r ? { work: r.work?.id, mode: r.result?.mode, total: r.result?.total } : null)).catch(() => null);
      if (got?.reply) return inWorkAnswer(got, ex, { gate: 'strategy', via: 'book', ...(jevFallback ? { jev_fallback: jevFallback } : {}), decisions: decisions.list() });
    }
    if (found?.kind === 'work') return bookAnswer(found.work, ex, { gate: 'strategy', via: found.via, decisions: decisions.list() });
    if (found?.kind === 'section') return sectionCard(found, ex, { gate: 'strategy', via: found.via, decisions: decisions.list() });
  }
  let lk = lkFirst !== undefined ? lkFirst : lkIntent && lkIntent !== 'in_work' && lkIntent !== 'find_passage' ? await lookupNow() : null;
  // "the opening paragraph of chapter one": Jev read the place as the unit's opening → its first paragraph(s) quoted, never the chapter card (dawnbreakers#1, 11-12)
  const opened = openingOf(lk, u);
  // …and the whole unit is remembered as given, so "summarize that chapter" next turn reads the chapter, not the one paragraph quoted (dawnbreakers#3, 11-12)
  const openedSection = opened !== lk ? sectionRef(lk) : null;
  if (opened !== lk) {
    decisions.record('reference:opening', { by: 'code', saw: { label: lk.label ?? null, paragraphs: lk.passages.length, amount_wanted: u.amount_wanted ?? null }, chosen: opened.passages.length, reason: 'Jev: the opening of the unit is asked — its first paragraph(s), not the whole unit' });
    lk = opened;
  }
  // a numbered unit too long to quote whole (a CHAPTER of a narrative, 11-11 "Dawn-Breakers chapter 25" got an essay with no link)
  // → that chapter's card: its heading, the book, a link to where it starts. Short units ("Gleanings 27") stay verbatim.
  if (lk?.kind === 'reference' && lk.passages?.length > LONG_UNIT && lk.work?.doc) {
    const ps = lk.passages, first = ps[0], doc = lk.work.doc;
    decisions.record('reference:chapter-card', { by: 'code', saw: { label: lk.label ?? null, paragraphs: ps.length }, chosen: 'chapter card', reason: `more than ${LONG_UNIT} paragraphs: the card, not the whole text` });
    // the card names the chapter as the book does ("Chapter XXV: Bahá’u’lláh’s Journey to Karbilá"), and carries its text so the
    // reader gets what the chapter covers (11-11: Chad flagged the non-specific summary), written from the chapter itself
    return sectionCard({ doc, sec: { doc_id: doc.id, book: doc.title, author: doc.author ?? null, title: unitTitle(lk, first) || lk.label || `${doc.title}, ${lk.ref?.num}`,
      start_index: first.paragraph_index, end_index: ps.at(-1).paragraph_index, paragraphs: ps.length, first_para_id: first.id,
      text: ps.map((p) => p.text).filter(Boolean).join('\n') } }, ex, { gate: 'lookup', via: 'reference', decisions: decisions.list() });
  }
  // a SHORT turn Jev read as a search ("more", "and the Báb?", "in Persian") gets its self-contained query from the history
  // and the card (short-turn.js) — respond.js searches those words, not the bare message
  const resolved = route.action === 'research' && outcome === 'search' && tri?.features?.short && !tri.features.first && d.resolve
    ? await timed('resolve', () => d.resolve({ messages, card: card?.text ?? null })).catch(() => null) : null;
  const triageSummary = tri && { kind: tri.kind?.choice, stance: tri.stance?.choice, reaction: tri.reaction?.choice,
    follow_up: tri.follow_up ?? null, first: tri.features?.first ?? null, features: tri.features ?? null, outcome: tri.outcome?.choice ?? null, query: resolved?.query ?? null, card: !!card?.text,
    malicious: tri.malicious, stop: tri.stop_request, ms: tri.ms,
    lookup: tri.lookup ? { choice: tri.lookup.choice, confidence: tri.lookup.confidence } : null,
    depth: tri.depth?.choice ?? null, depth_confidence: tri.depth?.confidence ?? null, accepts_offer: tri.accepts_offer ?? null };
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
      ...(jevFallback ? { jev_fallback: jevFallback } : {}),
      strategy: strat ? { choice: strat.strategy?.choice ?? null, sides: strat.sides ?? [], ...(strat.sources && Object.keys(strat.sources).length ? { sources: strat.sources } : {}), ms: strat.ms ?? null } : null, understood: understood?.phrase ?? null, decisions: decisions.list(), ...extra };
    path.meta = turnMeta({ status, path, meter, ms: Date.now() - t0 });
    // what changed in the conversation_state this turn, and who changed it (the trace / admin view)
    if (ex?.conversationId) path.state = { version: stateBefore.version, scope: scopeR.units.religions_specified, scope_source: scope.source, jev: jevPatch, ...(turnOnly ? { turn_only: turnOnly } : {}), code: codePatch };
    const jt = jevTimeoutsOf(path.decisions); if (jt) path.meta.jev_timeouts = jt;
    // where the time went (route.timeline in the thread view): stage spans since turn start + each model call's completion
    try { const jc = jevTurnCalls(); if (jc.length) path.jev_calls = jc; } catch { /* the gate link is bookkeeping */ }   // [{gate, id}] → calls.db rows of this turn's Jev decisions
    const runs = currentAIContext().graphRuns;   // measured off the reply path: buffered pushes, flushed by a timer
    // every graph run of the turn (the respond graph AND the strategy tree inside it) is path.steps: the judge and the promotion rows read what actually ran
    if (runs?.length) path.steps = runs.flatMap((x) => x.trace.map((e) => ({ graph: x.graph, ...e }))).slice(0, 80);
    if (runs?.length && ex?.conversationId) import('../repos/strategy-stats-repo.js').then((m) => m.logTurnRuns({ turnId: `${ex.conversationId}:${ex.round}`, runs, usd: path.meta?.usd ?? null })).catch((err) => console.warn(`[strategy-stats] logTurnRuns failed: ${err?.message}`));
    path.timeline = timelineOf(timeline, t0); path.llm = meter.map((c) => ({ model: c.model, caller: c.caller ?? null, at: c.at ? c.at - t0 : null }));
    if (ex) await d.close({ ...ex, reply, status, path, channel: channel.id }).catch(() => {});
    if (ex?.conversationId && d.state) for (const [by, patch] of [['jev', jevPatch], ['code', codePatch]]) if (patch) await d.state.append({ conversationId: ex.conversationId, turn: turnNo, by, patch }).catch((err) => console.warn(`[conversation-state] ${by} patch not stored: ${err?.message}`));
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

    // DOCUMENTS (Chad 11-10): Jev reads that the reader wants an answer as a PDF (document = pdf_previous | pdf_new) and how to
    // deliver it (delivery = email | link). pdf_previous renders the assistant's last reply; pdf_new renders this turn's reply below.
    const docChoice = d.documents && tri && route.action !== 'refuse' && route.action !== 'canned' && (tri.document?.confidence ?? 0) >= T.document ? tri.document.choice : null;
    const wantEmail = tri?.delivery?.choice === 'email' && (tri.delivery.confidence ?? 0) >= T.document;
    const sendDoc = async (title, markdown, widgets = []) => {
      const src = createHash('sha1').update(markdown).digest('hex').slice(0, 16), email = wantEmail ? (participant.email || emailIn(text)) : null;
      let doc = offerKey ? await d.documents.last(offerKey).catch(() => null) : null;
      if (!doc || doc.src !== src) { doc = await d.documents.create({ title, markdown, ...(widgets.length ? { widgets } : {}) }).catch(() => null); if (doc) { doc.src = src; if (offerKey) await d.documents.remember(offerKey, doc).catch(() => {}); } }
      if (!doc) return { text: DOC_TEXT.failed, ok: false };
      if (email) { const how = await d.documents.email(doc, email).catch(() => null); return { text: DOC_TEXT.emailed(email, doc.url), ok: true, url: doc.url, mailed: how }; }
      return { text: wantEmail ? DOC_TEXT.linkAskEmail(doc.url) : DOC_TEXT.link(doc.url), ok: true, url: doc.url };
    };
    if (docChoice === 'pdf_previous' && !tri.features?.first) {
      const at = messages.map((m, i) => (m.role === 'assistant' && !String(m.content).includes('Download the PDF') ? i : -1)).filter((i) => i >= 0).pop();
      const prevQ = at == null ? '' : [...messages.slice(0, at)].reverse().find((m) => m.role === 'user')?.content || '';
      const out = at == null ? { text: DOC_TEXT.nothing, ok: false } : await sendDoc(String(prevQ).replace(/\s+/g, ' ').slice(0, 160) || 'Research', String(messages[at].content));
      onEvent({ type: 'stage', stage: 'craft' }); onEvent({ type: 'text', content: out.text });
      const path = await finish(out.text, 'document', { document: { kind: 'pdf_previous', ok: out.ok, mailed: out.mailed ?? null } });
      return { reply: out.text, status: 'document', citations: [], retrieved: [], plan: null, conversationId: ex?.conversationId ?? null, path, timings: { total_ms: Date.now() - t0 } };
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
    let streaming = true;   // the stream is open until the reply returns: a late status line must not be written after it
    const jobP = deepOn ? timed('deep-report', () => d.reports.start(resolved?.query || text)).catch(() => null) : null;
    // a deep report queued: a live channel says so beside the normal answer (narrate.js; never email)
    jobP?.then((j) => { if (j?.researchId && streaming) narrate(onEvent, channel, 'deep_report.queued'); }).catch(() => {});
    // research / llm / variants: a caller's override (the /draft battery compares the researcher, writers and templates before they go live)
    // an Unmatched turn its recheck or planner routes to `book` ("Matthew") gets the same finder + pick → the card (strategies.js handoff)
    // …and when the book path already ran, its held near miss is what a recheck/planner `book` confirms (no second pick)
    const unmatchedBook = bookGate && !bookOn ? (choice) => bookFn({ messages, names: [choice?.units?.named_work ?? u.named_work].filter(Boolean), by: u.named_person ?? null, profile, decisions })
      : bookOn && held ? async () => { const { confidence, ...f } = held; return { ...f, via: `held:${f.via} ${confidence}` }; } : null;
    // THE WORK IN FOCUS (11-12, "give me the first couple paragraphs" after a title card): an `original` turn that names no work reads the one the previous turn gave, by id
    if (strat && strategyOf(strat) === 'original' && focus && !strat.units?.named_work) {
      strat.units = { ...(strat.units || {}), named_work: focus.id };
      decisions.record('original:focus', { by: 'code', saw: { named_work: null, focus }, chosen: focus.id, reason: 'no work named this turn: the work the previous turn gave' });
    }
    const r = await d.respond({ messages, profile, participant, onEvent, ...(llm ? { llm } : {}), ...(variants ? { variants } : {}), direction: { scope, ...(unmatchedBook ? { book: unmatchedBook } : {}), turnId: ex?.conversationId != null ? `${ex.conversationId}:${ex.round}` : null, stance: triageSummary?.stance ?? null,
      kind: route.kind, guarded: route.action === 'guarded', channel, readerName: participant.name ?? null, follow_up: triageSummary?.follow_up ?? null, features: triageSummary?.features ?? null, outcome: tri?.outcome ?? null, depth: triageSummary?.depth ?? null, query: (strat?.refersBack ? lastTopic(stateBefore, messages) : null) ?? resolved?.query ?? null, card: card?.text ?? null, ...(lk && route.action === 'research' ? { lookup: lk } : {}), ...(lkIntent ? { lookupIntent: lkIntent } : {}), strategy: strat, decisions, state: stateBefore, ...(research !== undefined ? { research } : {}), ...(engine ? { engine } : {}) } });
    streaming = false;
    const ho = r?.handoff?.kind === 'book' ? r.handoff.found : null;
    if (ho) return ho.kind === 'work' ? bookAnswer(ho.work, ex, { gate: 'unmatched', via: ho.via, decisions: decisions.list() }) : sectionCard(ho, ex, { gate: 'unmatched', via: ho.via, decisions: decisions.list() });
    // the form pass on EVERY reply path (agent, craft, sourcehunt, strategies): a closing search offer dropped, brackets in link
    // text made parens (writer residuals 11-05: titles like "Book of Common Prayer [King's Chapel]" broke their links)
    // and (11-10, absolute) a sentence saying Anís can't search is removed — counted in path.form for forensics' search-denial class
    // (battery 11-10) and every link's label names what it opens — checked against the turn's own sources
    const sources = [...(r.citations || []), ...(r.retrieved || [])].map((x) => ({ title: x?.title, url: x?.url ?? x?.source_url ?? null, text: x?.text ?? null }));
    const formed = typeof r.reply === 'string' ? formPass(r.reply, { sources }) : null;
    let reply = formed ? formed.text : r.reply;
    // a quote the form pass marked with its words (lint citeLinks 2b) is placed by the same output pass every reply link had
    const upQ = d.upgradeLinks ?? (deps ? null : async (x) => (await import('../ocean-links.js')).upgradeOceanLinks(x));
    if (upQ && typeof reply === 'string' && /oceanlibrary\.com\/[^\s)]*#~q=/.test(reply)) reply = (await timed('upgrade-quote-links', () => upQ(reply)).catch(() => null)) || reply;
    // Output check: a reply that abandons the persona or leaks instructions is replaced (the widget reconciles its
    // streamed text to the final reply; email sends only this).
    const broken = await timed('output-check', () => d.outputCheck(reply, { persona: name })).catch(() => null);
    const replaced = broken != null && broken >= OUTPUT_BREAK;
    if (replaced) { d.strikes.strike(who); reply = cannedReply('refuse', { name, seed }); }
    // display widget (widgets/): the writer framed it; code appends its markdown fallback after a marker (stored reply, email, PDF, battery) and the live
    // clients swap that span for the component on the `widget` event. Not on a replaced reply; before the PDF so the document carries it.
    const wblock = r.widget && !replaced && typeof reply === 'string' && reply.trim() ? widgetBlock(r.widget) : '';
    if (wblock) {
      reply = `${reply}\n\n${wblock}`;
      if (channel.renderer !== 'email-html') onEvent({ type: 'text', content: `\n\n${wblock}` });
      if (channel.live) onEvent({ type: 'widget', widget: r.widget });
    }
    // pdf_new: the researched reply, delivered as the branded PDF (a letter gets the link in its HTML; a chat gets link or mail)
    let documentInfo;
    if (docChoice && docChoice !== 'text' && !replaced && typeof reply === 'string' && reply.trim()) {
      const out = await timed('pdf', () => sendDoc(String(resolved?.query || text).replace(/\s+/g, ' ').slice(0, 160) || 'Research', reply, r.widget ? [r.widget] : [])).catch(() => null);
      if (out) {
        const line = channel.renderer === 'email-html' && out.url ? DOC_TEXT.letterLink(out.url) : out.text;
        reply = `${reply}\n\n${line}`; if (channel.renderer !== 'email-html') onEvent({ type: 'text', content: `\n\n${line}` });
        documentInfo = { kind: 'pdf_new', ok: out.ok, mailed: out.mailed ?? null };
      }
    }
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
    // passage cards (Chad 11-10): each quoted blockquote → its book's tiny cover + the linked citation; the work Jev named, cited in the
    // reply → its book card. Live chat only: the clients swap a blockquote for its card; email/PDF/voice keep the plain reply.
    const qc = d.quoteCards ?? (deps ? null : async (...a) => (await import('./quote-cards.js')).quoteCards(...a));
    const present = qc && channel.live && !replaced && typeof reply === 'string' && reply.trim()
      ? await timed('quote-cards', () => qc(reply, [...(r.citations || []), ...(r.retrieved || [])], { namedWork: u.named_work ?? null })).catch(() => null) : null;
    if (present?.cards?.length) onEvent({ type: 'quote_cards', cards: present.cards });
    if (present?.books?.length) onEvent({ type: 'books', books: present.books });
    // tree end: code appends what the turn gave (every quoted/listed item), the thread entry, and what stayed open
    try {
      const cites = (r.citations || []).map((c) => ({ document_id: c.document_id, paragraph_index: c.paragraph_index ?? null, text: c.text || undefined, id: c.id })).filter((c) => c.document_id != null || c.id != null);
      codePatch = treePatch({ turn: turnNo ?? 0, strategy: strategyOf(strat) ?? r.plan?.shape ?? null, units: { current_user_question: resolved?.query || text, found_passages: cites }, ended: cites.length ? null : 'absence', state: stateBefore, channel: channel.id });
      if (openedSection && codePatch) codePatch = { ...codePatch, given: [...(codePatch.given || []), { turn: turnNo ?? 0, kind: 'section', ref: openedSection }] };
    } catch { codePatch = null; }
    const path = await finish(reply, 'answered', { engine: 'anis', ...(deepReport ? { deep_report: deepReport } : {}), ...(documentInfo ? { document: documentInfo } : {}), evidence: r.evidence ?? null, recipe: r.plan?.shape ?? null,
      ...(r.steps ? { steps: r.steps } : {}),   // the strategy graph's trace [{node, step@v, ms, edge}], beside path.jev_calls
      // how the strategy was chosen (jev | jev:cached | backstop + why) and what the search was fed, for the thread view
      plan: { shape: r.plan?.shape ?? null, provenance: r.plan?.provenance ?? null, reason: r.plan?.reason ?? null, overridden: r.plan?.overridden ?? null,
        quote: r.plan?.quote?.phrase ?? null, ms: r.plan?.plan_ms ?? null, history_turns: Math.max(0, messages.length - 1), search_query: r.search_query ?? null,
        // the quote gate's work on the final text: sentences dropped for unverified quotes, introduced quotations placed/rewritten
        quotes_removed: r.quotes_removed ?? 0, quotes_completed: r.quotes_completed ?? null,
        // the researcher's own calls (11-04 mail-1403: a brief with zero searches was invisible in the thread view)
        research: Array.isArray(r.plan?.steps) ? { ms: r.plan.ms ?? null, steps: r.plan.steps.slice(0, 40).map((s) => ({ tool: s.tool, found: s.found ?? null, ...(s.rebuilt_from ? { rebuilt_from: String(s.rebuilt_from).slice(0, 200) } : {}),
          args: Object.fromEntries(Object.entries(s.args || {}).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 200) : v])) })) } : null,
        // the five stages, each with its choice, who made it and the time: strategy (Jev) → phrases → retrieval → selection → format
        stages: { strategy: { choice: r.plan?.shape ?? null, by: r.plan?.provenance ?? null, reason: r.plan?.reason ?? null, ms: r.plan?.plan_ms ?? null,
            // which strategy@version RAN (Jev's pick, the graph that executed it) beside the search plan's shape, and Jev's decisions for the turn
            ...strategyRun(strat, currentAIContext().graphRuns, r.plan?.shape) },
          phrases: r.plan?.quote ? { choice: r.plan.quote.phrase, by: r.plan.quote.via } : r.plan?.phrases ? phraseStage(r.plan.phrases) : null,
          retrieval: { choice: r.retrieved?.length ?? 0, by: 'planned-search', ms: r.timings?.search_ms ?? null },
          selection: r.select ? { choice: `${r.select.kept}/${r.select.of}`, by: r.select.by } : null,
          format: r.format ? { choice: r.format.id, by: r.format.by } : null } },
      retrieved: r.retrieved?.length ?? 0,
      format: r.format ?? null, profile: r.profile ?? null,
      output_check: broken, replaced, lint, ...(formed && (formed.repairs.search_denial || formed.repairs.search_offer || formed.repairs.deflection) ? { form: formed.repairs } : {}), timings: r.timings, search_detail: r.plan?.timings ?? null });
    // the warm job (precache.js) stores the finished answer: the reply as sent, the cards shown, the sources — nothing per reader
    if (warm && cacheable && !replaced && !deepReport && !documentInfo && typeof reply === 'string' && reply.trim()) {
      await d.cache.store(text, cacheKey(name, channel.id), { reply, citations: r.citations, retrieved: r.retrieved, events: shown, strategy: strategyOf(strat) ?? r.plan?.shape ?? null })
        .catch((err) => console.warn(`[precache] store failed: ${err?.message}`));
    }
    return { ...r, reply, status: 'answered', conversationId: ex?.conversationId ?? null, path, ...(deepReport ? { deep_report: deepReport } : {}),
      ...(present?.cards?.length ? { quote_cards: present.cards } : {}), ...(present?.books?.length ? { books: present.books } : {}) };
  } catch (err) {
    if (ex) await d.fail({ ...ex, error: err?.message }).catch(() => {});
    if (isSpendCap(err)) return spendLimited();   // the cap was reached mid-turn (a later paid call): same polite reply
    throw err;
  }
}

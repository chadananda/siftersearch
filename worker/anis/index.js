// The Anís edge Worker: POST /api/chat/stream (same SSE protocol as tower chat.js) — conversation + Anthropic calls here, library research as HTTP tool calls to tower.
// Deps: agent-core (pure loop), anthropic-native (wire shape), research-store (D1/Vectorize cache + log), agent-tools.json (build snapshot, scripts/anis-edge/snapshot-tools.mjs).
import { agentAnswer } from '../../api/lib/assistant/agent-core.js';
import { toolRunner } from '../../api/lib/assistant/tool-runner.js';
import { followupsWith } from '../../api/lib/assistant/followups-core.js';
import { formPass } from '../../api/lib/assistant/lint.js';
import { toNative, fromNative, chunksOf } from '../../api/lib/anthropic-native.js';
import { modelFor } from '../../api/lib/model-roles.js';
import { thinkingParam } from '../../api/lib/model-registry.js';
import { lookup, capture, logQuestion, saveTurn, markStale, embed, EMBED_MODEL, SAME_QUESTION } from './research-store.js';
import { restate, underPriceBoundary } from './restate.js';
import { finishLinks, templateFilter } from './links.js';
import { backPills, pinnedQuestion } from './pills.js';
import { triageLetter } from './triage.js';
import { feedback } from './feedback.js';
import { transcribeRoute, speakRoute } from './voice.js';
import { shareDraft, sharePublish, shareDelete, published, discussionPage, notFoundPage, DISCUSSION_PATH } from './share.js';
import { CHANNELS, MODES, channelOfMode, greetByName, speakable } from '../../api/lib/assistant/channels.js';
const formSources = (xs) => xs.map((x) => ({ title: x?.title, url: x?.url ?? x?.source_url ?? null, text: x?.text ?? null }));
import snapshot from './agent-tools.json';
import { NOTE_INDICATION_TOOL, renderBio, traditionLine } from '../../api/lib/assistant/indications.js';
import { readerOf, loadBio, noteIndication, bioRoute } from './bio.js';

const HELD_IN_TURN = 0.75;
const enc = new TextEncoder();
const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...h } });
// Map/Set results cross tower's wire as {__map}/{__set} (anis-impl-tools.js encode)
export const revive = (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? (v.__map ? new Map(v.__map) : v.__set ? new Set(v.__set) : v) : v);

// ── Anthropic Messages over fetch: the SDK's create(), as the agent core calls it (OpenAI-shaped in, chunks/response out) ──
export async function* sseEvents(body) {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const data = frame.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data || data === '[DONE]') continue;
      const e = JSON.parse(data);
      if (e.type === 'error') throw new Error(`anthropic stream: ${e.error?.message || 'error'}`);
      yield e;
    }
    if (done) return;
  }
}
export const nativeFetchCreate = (env, model, fetchFn = fetch, trace = null) => async (params) => {
  const t0 = Date.now();
  const body = toNative(params, { model, thinking: thinkingParam(model, params.thinking) });
  const send = () => fetchFn('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'accept-encoding': 'identity' },
    body: JSON.stringify(params.stream ? { ...body, stream: true } : body) });
  let res = await send();
  if (res.status === 429 || res.status >= 500) res = await send();   // one retry, as the SDK's maxRetries: 1
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const seen = trace && { headers: Date.now() - t0 };
  if (seen) trace.push(seen);
  const events = !seen ? sseEvents(res.body) : (async function* () { for await (const e of sseEvents(res.body)) { const k = e.delta?.type || e.content_block?.type || e.type; seen[k] ??= Date.now() - t0; yield e; } })();
  return params.stream ? chunksOf(events) : fromNative(await res.json());
};

// ── tower's research tools over HTTP (anis-impl-tools.js); researchLookup/Capture are local (D1/Vectorize) ──
// Library reads (books, talks, people, documents, passages) are cached in R2 (Chad 11-13 "they should all be cached in R2"):
// tower answers a lookup once; afterwards the edge serves it, and past FRESH_MS it serves the copy while refreshing in the background.
// Not cached: usage logging, the web, probes, generated documents, rights (encumberedAmong: must be current).
export const CACHED_TOOLS = new Set(['around', 'bookCard', 'extractFromWork', 'findPassage', 'original', 'originals', 'ownSource', 'search', 'searchBy', 'searchIn',
  'searchInWork', 'sourceOf', 'talkSearch', 'trace', 'translation', 'translationsOf', 'upgradeLinks', 'urlsOf', 'whole', 'wordStudy', 'work', 'workNotes', 'writings']);
const FRESH_MS = 3 * 864e5;
// a tool whose answer's SHAPE changed gets a new key, so no copy stored before the change is ever served (11-14 replay: a sourceOf copy
// from before passages carried their roles reached the writer — holders, citing works and a study, no source card)
// roles2 (round 5): the source passage carries its own writer and place, and the tower no longer names a study quoting the Writings
export const TOOL_SHAPE = { sourceOf: 'roles2' };
export const toolKey = async (fn, args) => `tool/${fn}${TOOL_SHAPE[fn] ? `@${TOOL_SHAPE[fn]}` : ''}/${[...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(args ?? []))))]
  .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40)}`;

export function remoteImpl(env, { turn, local, fetchFn = fetch, ctx = null }) {
  const stat = { ms: 0, calls: 0, by: {}, cached: 0 };   // by: fn → [calls, ms] (where tower time goes); cached = served from R2
  const tower = async (fn, args) => {
    const t0 = Date.now();
    try {
      const r = await fetchFn(`${env.TOWER_URL}/api/v1/anis/tool/${fn}`, { method: 'POST', signal: AbortSignal.timeout(40000),
        headers: { 'content-type': 'application/json', 'x-internal-key': env.TOWER_KEY }, body: JSON.stringify({ args, turn }) });
      if (!r.ok) throw new Error(`tower ${fn} ${r.status}`);
      const text = await r.text(), j = JSON.parse(text, revive);
      if (j.error) throw new Error(j.error);
      return { out: j.out, text };
    } finally { const d = Date.now() - t0; stat.ms += d; stat.calls++; const b = (stat.by[fn] ||= [0, 0]); b[0]++; b[1] += d; }
  };
  const store = (key, text) => env.ANIS_CACHE.put(key, text, { customMetadata: { at: String(Date.now()) } }).catch(() => {});
  const later = (p) => (ctx?.waitUntil ? ctx.waitUntil(p) : p.catch(() => {}));
  const call = async (fn, args) => {
    if (!env.ANIS_CACHE || !CACHED_TOOLS.has(fn)) return (await tower(fn, args)).out;
    const key = await toolKey(fn, args);
    const hit = await env.ANIS_CACHE.get(key).catch(() => null);
    if (hit) {
      const j = JSON.parse(await hit.text(), revive);
      if (j.out != null) {   // an empty answer is never served from the cache: the library may have it now
        stat.cached++;
        if (Date.now() - Number(hit.customMetadata?.at || 0) > FRESH_MS) later(tower(fn, args).then((r) => r.out != null && store(key, r.text)));
        return j.out;
      }
    }
    const r = await tower(fn, args);
    if (r.out != null) later(store(key, r.text));
    return r.out;
  };
  const impl = Object.fromEntries(snapshot.impl.map((fn) => [fn, (...args) => call(fn, args)]));
  return { impl: { ...impl, ...local }, stat };
}

// usage of every Anthropic call, summed per model+caller and sent to tower's ledger after the turn (anis-impl-tools logUsage)
export function metered(create, model, caller, tally) {
  const add = (u) => { if (!u) return; const k = `${model}|${caller}`; const t = (tally[k] ||= { model, caller, prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, cache_write_tokens: 0 }); for (const f of ['prompt_tokens', 'completion_tokens', 'cached_tokens', 'cache_write_tokens']) t[f] += u[f] || 0; };
  return async (p) => {
    const res = await create(p);
    if (!p.stream) { add(res?.usage); return res; }
    return (async function* () { for await (const c of res) { if (c?.usage) add(c.usage); yield c; } })();
  };
}

// the pure runner with the server pieces it lacked, fetched from tower: rights (fails closed in the core), work link map
const runnerFor = (impl) => (i, o) => toolRunner(i, { ...o, fallback: { urlOf: async (all) => { const m = await impl.urlsOf(all).catch(() => ({})); return (x) => m?.[x.id] ?? x.url; } } });

const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };
const personas = new Map();   // widget token → { name, audience, at } (config is edge-cached on tower; 10 min here)
async function personaOf(env, token, fetchFn) {
  const hit = personas.get(token);
  if (hit && Date.now() - hit.at < 600000) return hit;
  try {
    const r = await fetchFn(`${env.TOWER_URL}/api/v1/widget/config/${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(1500) });
    const c = r.ok ? await r.json() : {};
    const p = { name: String(c.name || '').trim().slice(0, 60) || null, audience: String(c.audience || '').trim().slice(0, 300) || null, at: Date.now() };
    personas.set(token, p);
    return p;
  } catch { return {}; }
}

const cors = (request) => ({ 'access-control-allow-origin': request.headers.get('origin') || '*', 'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, x-sifter-test', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', vary: 'Origin' });

/** One Anís turn in any MODE (channels.js): chat and audio stream SSE; email and document (internal callers only — the mail
 *  Worker, POST /_anis/turn) run the same turn and answer with one JSON result. */
export async function chat(request, env, ctx, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const body = deps.body ?? await request.json().catch(() => null);
  const asked = MODES[body?.mode] ? body.mode : 'chat';
  const mode = CHANNELS[MODES[asked]].privileged && !deps.trusted ? 'chat' : asked;
  const channel = channelOfMode(mode, { widget: !!body?.widget_token }), C = CHANNELS[channel];
  const messages = Array.isArray(body?.messages) ? body.messages.filter((m) => m && typeof m.content === 'string').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })) : [];
  if (!messages.length) return json({ error: 'messages required' }, 400, cors(request));
  // per-visitor turn limit (CHAT_LIMIT ratelimit binding, wrangler.jsonc): every turn here is a paid model call
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (env.CHAT_LIMIT && request.headers.get('x-internal-key') !== env.TOWER_KEY && !(await env.CHAT_LIMIT.limit({ key: ip }).catch(() => ({ success: true }))).success) return json({ error: 'Too many questions at once — please wait a minute.' }, 429, { ...cors(request), 'retry-after': '60' });
  // streamed modes write SSE as the turn runs; a letter or a document is collected and returned whole (out)
  const { readable, writable } = C.stream ? new TransformStream() : {}, writer = writable?.getWriter();
  let chain = Promise.resolve(), out = null;
  const send = (o) => { if (writer) chain = chain.then(() => writer.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`))).catch(() => {}); return chain; };
  const ping = writer && setInterval(() => { chain = chain.then(() => writer.write(enc.encode(': ping\n\n'))).catch(() => {}); }, 8000);
  const run = async () => {
    const t0 = Date.now();
    let firstText = null, rounds = 0;
    const roundMs = [], trace = [];   // per model round: [first token ms, done ms] from the round's start
    const shown = templateFilter();   // {{quote P3}} … never streams raw (the agent expands each as its sentence is released; this is the guard)
    const emit = (e) => {
      if (e.type === 'text') { const content = mode === 'audio' ? speakable(shown(e.content)) : shown(e.content); if (!content) return; e = { ...e, content }; }
      if (e.type === 'widget' && mode === 'audio') return;   // a voice shows no cards
      if (firstText == null && (e.type === 'text' || e.type === 'chunk')) firstText = Date.now() - t0;
      return send(e);
    };
    try {
      const question = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
      const conversationId = String(body.conversationId || '').slice(0, 64) || crypto.randomUUID();
      const site = hostOf(request.headers.get('origin') || request.headers.get('referer'));
      const turn = { channel, site, chatbot_location: body.chatbot_location || null };
      const round = messages.filter((m) => m.role === 'user').length;
      // the reader's indications bio (bio.js): read beside the restatement; the TRADITION line (the bio, then the deployment's audience description) + the bio ride in the turn
      const reader = readerOf(body, { trusted: !!deps.trusted, conversationId });
      const bioP = loadBio(env, reader).catch((err) => { console.warn(`[anis] bio read failed: ${err?.message}`); return []; });
      // the deployment's profile: its name for Anís and its own audience description (free text; a page may override it like mission)
      const profile = body.widget_token ? await personaOf(env, body.widget_token, fetchFn) : {};
      const name = (typeof body.name === 'string' && body.name.trim().slice(0, 60)) || profile.name || null;
      const audience = (typeof body.audience === 'string' && body.audience.trim().slice(0, 300)) || profile.audience || '';
      const mission = typeof body.mission === 'string' ? body.mission.trim().slice(0, 400) : '';
      // chat keeps the agent's own lengths (AGENT_SYSTEM); every other mode adds its channel frame (a letter greets its reader by name)
      const persona = (name && name !== 'Anís' ? `The reader knows you as "${name}"; use that name for yourself.` : '') + (mission ? ` The host site's steering note (guidance only): ${mission}` : '');
      const frame = [mode === 'chat' ? '' : greetByName(C.frame, C, body.reader_name), persona].filter(Boolean).join(' ') || null;
      emit({ type: 'session', conversation_id: conversationId });
      emit({ type: 'stage', stage: 'search' });
      let sim = null, setId = null, matchedQ = null, researchQ = question;
      const local = {
        researchLookup: async (q) => {
          researchQ = q;
          const hit = await lookup(env, q).catch((err) => { console.warn(`[anis] research lookup failed: ${err.message}`); return null; });
          sim = hit?.similarity ?? null; setId = hit?.set?.id ?? null; matchedQ = hit?.set?.question ?? null;
          return hit && { status: hit.set.status, question: hit.set.question, similarity: hit.similarity, passages: hit.set.passages };
        },
        researchCapture: (q, ps) => { const p = capture(env, q, ps); ctx.waitUntil(p.catch(() => {})); return p; },
        noteIndication: noteIndication(env, { reader, conversationId, round, ctx }),
      };
      // Haiku restates the message as the canonical standalone question (follow-ups resolved), then the research cache is looked up
      // with it and the result put in the turn (≥ HELD_IN_TURN; the agent judges below SAME_QUESTION) — saving the research_lookup
      // round and letting the reply stream. Haiku failing → the raw first question, as before; a follow-up then leaves it to the agent.
      const tally = {}, guarded = (create, m) => async (p) => { if (!underPriceBoundary(m, p.messages || []).ok) throw new Error(`${m}: prompt over the price boundary`); return create(p); };
      // A first question's own wording is looked up beside Haiku: already the same question (≥ SAME_QUESTION) → no wait for Haiku.
      const rmodel = modelFor('anis-restate').model, tr = Date.now(), firstTurn = !messages.some((m) => m.role === 'assistant');
      const rcreate = guarded(metered(deps.create || nativeFetchCreate(env, rmodel, fetchFn), rmodel, 'anis-restate-edge', tally), rmodel);
      // a clicked follow-up pill was restated and researched when it was offered (pills.js): its question is pinned, no Haiku wait
      const triageP = mode === 'email' ? triageLetter(rcreate, question).catch(() => null) : null;   // stop / personal → the mail Worker's mail_stop
      const pinned = firstTurn ? null : await pinnedQuestion(env, messages).catch(() => null);
      const canonP = pinned ? Promise.resolve(pinned) : restate(rcreate, rmodel, messages).catch(() => null);
      const raw = firstTurn ? await lookup(env, question).catch(() => null) : null;
      const rawSame = raw && raw.similarity >= SAME_QUESTION;
      if (rawSame) ctx.waitUntil(canonP);
      const canon = rawSame ? null : await canonP, restateMs = rawSame ? null : Date.now() - tr;
      const lookQ = rawSame ? question : canon || (firstTurn ? question : null);
      let held = null;
      if (lookQ) {
        const hit = firstTurn && lookQ === question ? raw : await lookup(env, lookQ).catch(() => null);
        if (hit && hit.similarity >= HELD_IN_TURN) {
          const same = hit.similarity >= SAME_QUESTION;
          sim = hit.similarity; setId = hit.set.id; matchedQ = hit.set.question; researchQ = same ? matchedQ : lookQ;
          held = { same, asked: lookQ, status: hit.set.status, question: hit.set.question, passages: hit.set.passages };
        } else if (canon) { researchQ = canon; held = { question: canon }; }
      }
      const { impl, stat } = remoteImpl(env, { turn, local, fetchFn, ctx });
      const bioRows = await bioP, bio = renderBio(bioRows);
      const readerNote = `${traditionLine({ audience, rows: bioRows })}${bio ? `\n\n${bio}` : ''}`;
      const model = modelFor('anis-agent').model, create = metered(deps.create || nativeFetchCreate(env, model, fetchFn, body.trace ? trace : null), model, 'anis-agent-edge', tally);
      const A = await agentAnswer({ messages, onEvent: emit, frame, tools: impl, toolDefs: [...snapshot.tools, NOTE_INDICATION_TOOL], reader: readerNote, firstVisit: mode === 'chat' && body.first_visit === true, runner: runnerFor(impl), held, links: (t, ps) => finishLinks(formPass(t, { sources: formSources(ps) }).text, [...ps, ...(held?.passages || [])]).text,
        create: async (p) => { rounds++; const t = Date.now(), rec = [null, null]; roundMs.push(rec); const r = await create(p);
          if (!p.stream) { rec[0] = rec[1] = Date.now() - t; return r; }
          return (async function* () { for await (const c of r) { rec[0] ??= Date.now() - t; yield c; } rec[1] = Date.now() - t; })(); }, workNotes: (title) => impl.workNotes(title).catch(() => ({ work: null, notes: [] })) });
      if (!A.reply) { emit({ type: 'error', message: 'An error occurred. Please try again.' }); return; }
      // the form pass every tower reply gets (turn.js): emphasis repaired, link labels checked, a closing search offer dropped
      // (a streamed reply had it sentence by sentence, through `links`: what the reader saw is the reply, never re-formed after)
      if (!A.widgetsShown) A.reply = formPass(A.reply, { sources: formSources([...A.citations, ...A.retrieved]) }).text;
      emit({ type: 'stage', stage: 'craft' });
      // links finished here from the passages the turn holds (Chad 11-13: no tower round-trip but new research); follow-up pills meanwhile
      const fmodel = modelFor('anis-followups').model, fcreate = guarded(metered(deps.create || nativeFetchCreate(env, fmodel, fetchFn), fmodel, 'anis-followups-edge', tally), fmodel);
      const pills = mode !== 'chat' ? null : followupsWith(async (msgs) => (await fcreate({ messages: msgs, max_tokens: 160, thinking: false })).choices[0].message, question, A.reply, { reader: bio });
      const pool = [...A.retrieved, ...(held?.passages || [])];
      const fin = finishLinks(A.reply, pool), reply = mode === 'audio' ? speakable(fin.text) : fin.text;
      const citations = A.citations.map((c) => ({ ...c, url: c.url ? finishLinks(c.url, pool).text : c.url }));
      emit({ type: 'sources', sources: citations, plan: { shape: 'agent' } });
      if (A.talks?.length) emit({ type: 'talks', talks: A.talks });   // talk_search found the talk: its card(s), before the text
      if (!A.widgetsShown) for (const widget of A.widgets || []) emit({ type: 'widget', widget });   // inline templates the writer chose (widgets/templates.js), before the text that places them; a streamed reply sent each as it was written
      for (const w of reply.split(/(\s+)/)) if (w) emit({ type: 'chunk', text: w });
      const cites = citations.slice(0, 8).map((q) => ({ document_id: q.document_id, paragraph_index: q.paragraph_index, text: q.text, title: q.title, author: q.author, religion: q.religion, url: q.url }));
      if (cites.length) emit({ type: 'citations', citations: cites });
      // only pills research backs are offered: each restated, looked up, a miss searched + captured now (no model call but Haiku)
      const items = !pills ? [] : await backPills(env, { items: await pills, messages, reply }, { restate: (msgs) => restate(rcreate, rmodel, msgs),
        lookup: (q) => lookup(env, q), capture: (q, ps) => capture(env, q, ps),
        research: async (q) => { const r = runnerFor(impl)(impl, { search: 'fused_search' }); await r.run.fused_search({ query: q }); return [...r.found.values()]; } });
      if (items.length) emit({ type: 'followups', items });
      const timings = { total_ms: Date.now() - t0, first_text_ms: firstText, tower_ms: stat.ms, tower_calls: stat.calls, cached_calls: stat.cached, tower_by: stat.by, rounds, round_ms: roundMs, restate_ms: restateMs, restated: canon, widgets: (A.widgets || []).map((w) => w.kind), links: { narrowed: fin.narrowed, unplaced: fin.unplaced }, ...(body.trace ? { trace } : {}), research: sim == null ? null : { similarity: +sim.toFixed(3), question: matchedQ }, asked: researchQ };
      emit({ type: 'complete', citations: cites, ...(A.talks?.length ? { talks: A.talks } : {}), meta: { engine: 'anis-edge', mode, retrieved_count: A.retrieved.length, gate_passed: true, conversation_id: conversationId, format: 'agent', timings } });
      // a letter carries each card's quotation markdown (its marker dropped); a document keeps the markers — the PDF draws the widgets there
      if (!C.stream) out = { reply: mode === 'email' ? reply.replace(/<!-- widget:[^>]*-->\s*/g, '') : reply, mode, status: 'answered', triage: await triageP,
        retrieved: A.retrieved.length, format: 'agent', conversationId, citations: cites, widgets: A.widgets || [], timings };
      // persistence never on the critical path
      ctx.waitUntil(Promise.all([
        saveTurn(env, { conversationId, round, role: 'user', content: question, site, channel }),
        saveTurn(env, { conversationId, round, role: 'assistant', content: reply, meta: { steps: A.steps.length, timings, similarity: sim }, site, channel }),
        impl.logUsage(Object.values(tally)),
        logQuestion(env, { question: researchQ, similarity: sim, setId, site, channel, ms: timings.total_ms, format: 'agent' }),
      ]).catch((err) => console.warn(`[anis] persist failed: ${err?.message}`)));
    } catch (err) {
      console.warn(`[anis] chat failed: ${err?.message}`);
      emit({ type: 'error', message: 'An error occurred. Please try again.' });
    } finally { await chain; if (writer) { clearInterval(ping); await writer.close().catch(() => {}); } }
  };
  if (!C.stream) { await run(); return out ? json(out) : json({ error: 'An error occurred. Please try again.' }, 502); }
  ctx.waitUntil(run());
  return new Response(readable, { headers: { ...cors(request), 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
}

/** The share routes (share.js): POST /api/chat/share = a sanitized draft for the reader's preview (a paid Haiku call: rate-limited,
 *  metered, logged to the ledger); /publish = the reader's click; GET = a published discussion as JSON ("continue"); DELETE = unpublish. */
export async function shareRoute(request, env, ctx, deps = {}) {
  const h = cors(request), { pathname } = new URL(request.url), m = request.method;
  const slug = pathname.match(/^\/api\/chat\/share\/([a-z0-9-]+)$/)?.[1];
  if (m === 'POST' && pathname === '/api/chat/share') {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (env.CHAT_LIMIT && !(await env.CHAT_LIMIT.limit({ key: ip }).catch(() => ({ success: true }))).success) return json({ error: 'Too many requests — please wait a minute.' }, 429, { ...h, 'retry-after': '60' });
    const body = await request.json().catch(() => null);
    const fetchFn = deps.fetch || fetch, tally = {}, model = modelFor('anis-share').model;
    const create = metered(deps.create || nativeFetchCreate(env, model, fetchFn), model, 'anis-share-edge', tally);
    const ask = async (messages) => {
      if (!underPriceBoundary(model, messages).ok) throw new Error('prompt over the price boundary');
      const r = await create({ messages, max_tokens: 1500, thinking: false });
      return String(r?.choices?.[0]?.message?.content || '');
    };
    const r = await shareDraft(body, env, { ask, site: hostOf(request.headers.get('origin') || request.headers.get('referer')) });
    if (Object.keys(tally).length) ctx.waitUntil(remoteImpl(env, { turn: null, local: {}, fetchFn, ctx }).impl.logUsage(Object.values(tally)).catch((err) => console.warn(`[anis] share usage log failed: ${err?.message}`)));
    return json(r.out, r.status, h);
  }
  if (m === 'POST' && pathname === '/api/chat/share/publish') { const r = await sharePublish(await request.json().catch(() => null), env); return json(r.out, r.status, h); }
  if (slug && m === 'DELETE') { const b = await request.json().catch(() => ({})); const r = await shareDelete(slug, b?.owner_key, env); return json(r.out, r.status, h); }
  if (slug && m === 'GET') {
    const d = await published(env, slug);
    return d ? json({ slug: d.slug, title: d.title, summary: d.summary, scope: d.scope, turns: d.turns, published_at: d.published_at }, 200, { ...h, 'cache-control': 'public, max-age=300' }) : json({ error: 'not found' }, 404, h);
  }
  return json({ error: 'not found' }, 404, h);
}

/** GET /d/<slug>: the public discussion page (server-rendered, no client script). */
export async function discussionRoute(slug, env) {
  const d = await published(env, slug);
  const html = d ? discussionPage(d) : notFoundPage();
  return new Response(html, { status: d ? 200 : 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': d ? 'public, max-age=300' : 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' } });
}

/** Usage rows of an edge-only paid call (voice) → tower's ledger after the response (anis-impl-tools logUsage). */
export const usageLog = (env, fetchFn = fetch) => (rows, ctx) => {
  const p = remoteImpl(env, { turn: null, local: {}, fetchFn, ctx }).impl.logUsage(rows).catch((err) => console.warn(`[anis] voice usage log failed: ${err?.message}`));
  if (ctx?.waitUntil) ctx.waitUntil(p);
  return p;
};
const authed = (request, env) => env.TOWER_KEY && request.headers.get('x-internal-key') === env.TOWER_KEY;
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    if (pathname === '/healthz') return json({ ok: true, service: 'anis' });
    if (pathname === '/api/chat/stream' && request.method === 'POST') return chat(request, env, ctx);
    if (pathname === '/api/chat/bio' && ['GET', 'DELETE'].includes(request.method)) return bioRoute(request, env, { headers: cors(request) });   // the reader's own indications (bio.js)
    if (pathname === '/api/chat/feedback' && request.method === 'POST') return feedback(request, env, { headers: cors(request) });   // thumbs on a reply (feedback.js)
    if (pathname === '/api/chat/share' || pathname.startsWith('/api/chat/share/')) return shareRoute(request, env, ctx);   // shared discussions (share.js)
    if (pathname === '/api/chat/transcribe' && request.method === 'POST') return transcribeRoute(request, env, ctx, { headers: cors(request), log: usageLog(env) });   // voice (voice.js)
    if (pathname === '/api/chat/speak' && request.method === 'POST') return speakRoute(request, env, ctx, { headers: cors(request), log: usageLog(env) });
    const disc = request.method === 'GET' || request.method === 'HEAD' ? pathname.match(DISCUSSION_PATH)?.[1] : null;
    if (disc) return discussionRoute(disc, env);
    if (pathname.startsWith('/_anis/') && request.method === 'POST') {
      if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);
      const b = await request.json().catch(() => ({}));
      if (pathname === '/_anis/turn') return chat(request, env, ctx, { body: b, trusted: true });   // any mode, e.g. the mail Worker's letters (mode email)
      if (pathname === '/_anis/embed') return json({ model: EMBED_MODEL, vectors: (await env.AI.run(EMBED_MODEL, { text: (b.texts || []).map(String) })).data });
      if (pathname === '/_anis/stale') return json({ stale: await markStale(env, b.id) });   // a set a reader's correction showed wrong (research-store.js)
      if (pathname === '/_anis/lookup') { const r = await lookup(env, b.question || ''); return json({ hit: !!r, similarity: r?.similarity ?? null, same: r ? r.similarity >= SAME_QUESTION : false, set: r?.set ?? null }); }
    }
    return json({ error: 'not found' }, 404);
  },
};

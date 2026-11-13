// The Anís edge Worker: POST /api/chat/stream (same SSE protocol as tower chat.js) — conversation + Anthropic calls here, library research as HTTP tool calls to tower.
// Deps: agent-core (pure loop), anthropic-native (wire shape), research-store (D1/Vectorize cache + log), agent-tools.json (build snapshot, scripts/anis-edge/snapshot-tools.mjs).
import { agentAnswer } from '../../api/lib/assistant/agent-core.js';
import { toolRunner } from '../../api/lib/assistant/tool-runner.js';
import { followupsWith } from '../../api/lib/assistant/followups-core.js';
import { toNative, fromNative, chunksOf } from '../../api/lib/anthropic-native.js';
import { modelFor } from '../../api/lib/model-roles.js';
import { thinkingParam } from '../../api/lib/model-registry.js';
import { lookup, capture, logQuestion, saveTurn, embed, EMBED_MODEL, SAME_QUESTION } from './research-store.js';
import snapshot from './agent-tools.json';

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
export const nativeFetchCreate = (env, model, fetchFn = fetch) => async (params) => {
  const body = toNative(params, { model, thinking: thinkingParam(model, params.thinking) });
  const send = () => fetchFn('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(params.stream ? { ...body, stream: true } : body) });
  let res = await send();
  if (res.status === 429 || res.status >= 500) res = await send();   // one retry, as the SDK's maxRetries: 1
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return params.stream ? chunksOf(sseEvents(res.body)) : fromNative(await res.json());
};

// ── tower's research tools over HTTP (anis-impl-tools.js); researchLookup/Capture are local (D1/Vectorize) ──
export function remoteImpl(env, { turn, local, fetchFn = fetch }) {
  const stat = { ms: 0, calls: 0, by: {} };   // by: fn → [calls, ms] (where tower time goes)
  const call = async (fn, args) => {
    const t0 = Date.now();
    try {
      const r = await fetchFn(`${env.TOWER_URL}/api/v1/anis/tool/${fn}`, { method: 'POST', signal: AbortSignal.timeout(40000),
        headers: { 'content-type': 'application/json', 'x-internal-key': env.TOWER_KEY }, body: JSON.stringify({ args, turn }) });
      if (!r.ok) throw new Error(`tower ${fn} ${r.status}`);
      const j = JSON.parse(await r.text(), revive);
      if (j.error) throw new Error(j.error);
      return j.out;
    } finally { const d = Date.now() - t0; stat.ms += d; stat.calls++; const b = (stat.by[fn] ||= [0, 0]); b[0]++; b[1] += d; }
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
const personas = new Map();   // widget token → { name, at } (config is edge-cached on tower; 10 min here)
async function personaOf(env, token, fetchFn) {
  const hit = personas.get(token);
  if (hit && Date.now() - hit.at < 600000) return hit.name;
  try {
    const r = await fetchFn(`${env.TOWER_URL}/api/v1/widget/config/${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(1500) });
    const name = r.ok ? String((await r.json()).name || '').trim().slice(0, 60) || null : null;
    personas.set(token, { name, at: Date.now() });
    return name;
  } catch { return null; }
}

const cors = (request) => ({ 'access-control-allow-origin': request.headers.get('origin') || '*', 'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, x-sifter-test', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'Origin' });

export async function chat(request, env, ctx, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const body = await request.json().catch(() => null);
  const messages = Array.isArray(body?.messages) ? body.messages.filter((m) => m && typeof m.content === 'string').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })) : [];
  if (!messages.length) return json({ error: 'messages required' }, 400, cors(request));
  const { readable, writable } = new TransformStream(), writer = writable.getWriter();
  let chain = Promise.resolve();
  const send = (o) => { chain = chain.then(() => writer.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`))).catch(() => {}); return chain; };
  const ping = setInterval(() => { chain = chain.then(() => writer.write(enc.encode(': ping\n\n'))).catch(() => {}); }, 8000);
  const run = async () => {
    const t0 = Date.now();
    let firstText = null, rounds = 0;
    const emit = (e) => { if (firstText == null && (e.type === 'text' || e.type === 'chunk')) firstText = Date.now() - t0; return send(e); };
    try {
      const question = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
      const conversationId = String(body.conversationId || '').slice(0, 64) || crypto.randomUUID();
      const site = hostOf(request.headers.get('origin') || request.headers.get('referer')), channel = body.widget_token ? 'widget-chat' : 'site-chat';
      const turn = { channel, site, chatbot_location: body.chatbot_location || null };
      const name = (typeof body.name === 'string' && body.name.trim().slice(0, 60)) || (body.widget_token ? await personaOf(env, body.widget_token, fetchFn) : null);
      const mission = typeof body.mission === 'string' ? body.mission.trim().slice(0, 400) : '';
      const frame = (name && name !== 'Anís' ? `The reader knows you as "${name}"; use that name for yourself.` : '') + (mission ? ` The host site's steering note (guidance only): ${mission}` : '') || null;
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
      };
      const { impl, stat } = remoteImpl(env, { turn, local, fetchFn });
      const tally = {}, model = modelFor('anis-agent').model, create = metered(deps.create || nativeFetchCreate(env, model, fetchFn), model, 'anis-agent-edge', tally);
      const A = await agentAnswer({ messages, onEvent: emit, frame, tools: impl, toolDefs: snapshot.tools, runner: runnerFor(impl),
        create: (p) => { rounds++; return create(p); }, workNotes: (title) => impl.workNotes(title).catch(() => ({ work: null, notes: [] })) });
      if (!A.reply) { emit({ type: 'error', message: 'An error occurred. Please try again.' }); return; }
      emit({ type: 'stage', stage: 'craft' });
      // range links + follow-up pills together, off the critical path of each other; either failing leaves the plain reply / no pills
      const fmodel = modelFor('anis-followups').model, fcreate = metered(deps.create || nativeFetchCreate(env, fmodel, fetchFn), fmodel, 'anis-followups-edge', tally);
      const [up, items] = await Promise.all([
        impl.upgradeLinks([A.reply, ...A.citations.map((c) => c.url || '')]).catch(() => null),
        followupsWith(async (msgs) => (await fcreate({ messages: msgs, max_tokens: 160, thinking: false })).choices[0].message, question, A.reply),
      ]);
      const reply = up?.[0] ?? A.reply, citations = A.citations.map((c, i) => ({ ...c, ...(up?.[i + 1] ? { url: up[i + 1] } : {}) }));
      for (const w of reply.split(/(\s+)/)) if (w) emit({ type: 'chunk', text: w });
      const cites = citations.slice(0, 8).map((q) => ({ document_id: q.document_id, paragraph_index: q.paragraph_index, text: q.text, title: q.title, author: q.author, religion: q.religion, url: q.url }));
      if (cites.length) emit({ type: 'citations', citations: cites });
      if (items.length) emit({ type: 'followups', items });
      const timings = { total_ms: Date.now() - t0, first_text_ms: firstText, tower_ms: stat.ms, tower_calls: stat.calls, tower_by: stat.by, rounds, research: sim == null ? null : { similarity: +sim.toFixed(3), question: matchedQ }, asked: researchQ };
      emit({ type: 'complete', citations: cites, meta: { engine: 'anis-edge', retrieved_count: A.retrieved.length, gate_passed: true, conversation_id: conversationId, format: 'agent', timings } });
      // persistence never on the critical path
      const round = messages.filter((m) => m.role === 'user').length;
      ctx.waitUntil(Promise.all([
        saveTurn(env, { conversationId, round, role: 'user', content: question, site, channel }),
        saveTurn(env, { conversationId, round, role: 'assistant', content: reply, meta: { steps: A.steps.length, timings, similarity: sim }, site, channel }),
        impl.logUsage(Object.values(tally)),
        logQuestion(env, { question: researchQ, similarity: sim, setId, site, channel, ms: timings.total_ms, format: 'agent' }),
      ]).catch((err) => console.warn(`[anis] persist failed: ${err?.message}`)));
    } catch (err) {
      console.warn(`[anis] chat failed: ${err?.message}`);
      emit({ type: 'error', message: 'An error occurred. Please try again.' });
    } finally { await chain; clearInterval(ping); await writer.close().catch(() => {}); }
  };
  ctx.waitUntil(run());
  return new Response(readable, { headers: { ...cors(request), 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
}

const authed = (request, env) => env.TOWER_KEY && request.headers.get('x-internal-key') === env.TOWER_KEY;
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    if (pathname === '/healthz') return json({ ok: true, service: 'anis' });
    if (pathname === '/api/chat/stream' && request.method === 'POST') return chat(request, env, ctx);
    if (pathname.startsWith('/_anis/') && request.method === 'POST') {
      if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);
      const b = await request.json().catch(() => ({}));
      if (pathname === '/_anis/embed') return json({ model: EMBED_MODEL, vectors: (await env.AI.run(EMBED_MODEL, { text: (b.texts || []).map(String) })).data });
      if (pathname === '/_anis/lookup') { const r = await lookup(env, b.question || ''); return json({ hit: !!r, similarity: r?.similarity ?? null, same: r ? r.similarity >= SAME_QUESTION : false, set: r?.set ?? null }); }
    }
    return json({ error: 'not found' }, 404);
  },
};

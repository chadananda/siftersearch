// System-1 client (Jev ↔ Laya), one per TASK TYPE. Every call is logged with its task type, state, questions and the
// full answers (Jev's distributions are Laya's training targets). Laya is NEVER used untrained (Chad: "Laya is not
// supposed to be used out of the box without training"): a task type touches Laya only once a checkpoint trained for THAT
// task is registered (routing.json laya_model); from then Laya shadows Jev for evaluation. Routing per task type: Jev primary until Laya matches it on held-out data, then Laya primary with Jev as
// fallback (Laya down / timeout / below the task's min confidence). Chad 2026-10-02: "each time you use Jev, train Laya.
// When Laya is as good as Jev, switch over" · "keep the task type separated … Laya training separately for different
// task types". Deps: better-sqlite3 (log store), fetch. Env: TYPESAFE_API_KEY, LAYA_URL, LAYA_TOKEN(_FILE), SYSTEMONE_DIR.
// CLEF (Cloudflare Workers AI, Jev-API compatible — Chad 10-05: "test Jev & Clef for every job"): `clef` / `clef-flash` can be
// a task's primary, and SHADOW a sample of calls (shadowAllowed: 2%, ≤200/task/backend/day; after the answer returns) into the `shadow` table
// so each task gets an agreement/latency record. Clef runs INSIDE our Cloudflare Worker (Workers AI binding — no API
// token): POST {CLEF_URL}/_s1/run with the internal key. Env: CLEF_URL (default https://siftersearch.com), INTERNAL_API_KEY,
// CLEF=off to disable, SYSTEMONE_SHADOW (default "clef,clef-flash"; "" turns shadowing off). Clef is vision-capable: any
// image input in the request body is passed through to the model.
// POLICY 10-10 (Chad: "use Jev first"): Jev is the default primary everywhere — Clef lists at $0.24/M input, ~6× Jev's
// $0.042/M (Clef-flash ≈ Jev). Clef is a fallback or a sampled shadow; the way off Jev is a TRAINED Laya (free, local).
import Database from 'better-sqlite3';
import { logAIUsage } from './ai-services.js';   // every Jev / Clef call is SPEND (ai_usage) as well as a log row
import { noteProviderError } from './spend-alerts.js';   // out-of-credit → immediate email
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const DIR = process.env.SYSTEMONE_DIR || '/tank/sifter/systemone';
const LAYA_URL = process.env.LAYA_URL || 'http://100.106.130.68:8791/v1/systemone';

let store = null;
function db() {
  if (store) return store;
  mkdirSync(DIR, { recursive: true });
  store = new Database(join(DIR, 'calls.db'));
  store.pragma('journal_mode = WAL');
  store.pragma('busy_timeout = 30000');
  store.exec(`CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY, task TEXT NOT NULL, at INTEGER NOT NULL, ref TEXT,
      state TEXT NOT NULL, questions TEXT NOT NULL,
      jev TEXT, jev_tokens INTEGER, jev_ms INTEGER, jev_model TEXT,
      laya TEXT, laya_ms INTEGER, laya_model TEXT,
      served_by TEXT, gold TEXT, gold_basis TEXT);
    CREATE INDEX IF NOT EXISTS calls_task ON calls(task, at);
    CREATE INDEX IF NOT EXISTS calls_ref ON calls(task, ref);
    CREATE TABLE IF NOT EXISTS shadow (call_id INTEGER NOT NULL, backend TEXT NOT NULL, at INTEGER NOT NULL,
      answers TEXT, ms INTEGER, error TEXT, PRIMARY KEY (call_id, backend));`);
  return store;
}

const CLEF = new Set(['clef', 'clef-flash']);

// SHADOW BUDGET (10-10). Shadowing EVERY call to both Clef models cost ~$530 in two days (10-08/09: 300k shadow calls on
// 10k-token windows; Clef lists at $0.24/M input — ~6× Jev's $0.042/M). Parity evidence needs hundreds of comparisons per
// task, not hundreds of thousands, so a shadow is SAMPLED (SYSTEMONE_SHADOW_RATE, default 0.02) and CAPPED per task ×
// backend × UTC day per process (SYSTEMONE_SHADOW_DAILY, default 200). A Clef-SERVED answer is unaffected (that is the work).
const shadowCount = new Map();   // `${day}|${task}|${backend}` → n
export function shadowAllowed(task, backend, rand = Math.random) {
  const rate = Number(process.env.SYSTEMONE_SHADOW_RATE ?? 0.02), cap = Number(process.env.SYSTEMONE_SHADOW_DAILY ?? 200);
  if (!(rand() < rate)) return false;
  const k = `${new Date().toISOString().slice(0, 10)}|${task}|${backend}`;
  const n = shadowCount.get(k) || 0;
  if (n >= cap) return false;
  if (shadowCount.size > 5000) shadowCount.clear();
  shadowCount.set(k, n + 1);
  return true;
}
const clefKey = () => process.env.SYSTEMONE_EDGE_KEY || process.env.INTERNAL_API_KEY || '';
const clefOn = () => process.env.CLEF !== 'off' && !!clefKey();

/** Routing per task type (DIR/routing.json): { "<task>": { "laya_model": "<checkpoint trained for this task>",
 *  "primary": "jev"|"clef"|"clef-flash"|"laya", "min_conf": 0.9, "shadow": true, "shadow_backends": ["clef","clef-flash"] } }.
 *  No laya_model → Laya never called. Clef needs the internal key (edge route); without it a clef primary falls back to Jev. */
export function routeFor(task) {
  const path = join(DIR, 'routing.json');
  const all = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const envShadow = process.env.SYSTEMONE_SHADOW ?? (clefOn() ? 'clef,clef-flash' : '');
  const r = { primary: 'jev', min_conf: 0.9, shadow: true, laya_model: null,
    shadow_backends: envShadow.split(',').map((x) => x.trim()).filter(Boolean), ...(all[task] || {}) };
  if (r.primary === 'laya' && !r.laya_model) r.primary = 'jev';     // untrained → Laya is not consulted at all
  if (CLEF.has(r.primary) && !clefOn()) r.primary = 'jev';
  // background shadows are Clef only; a trained Laya keeps its awaited shadow on the call row (its training path, unchanged)
  r.shadow_backends = r.shadow_backends.filter((b) => CLEF.has(b) && clefOn() && b !== r.primary);
  return r;
}

/** One ai_usage row per paid System-1 call (Jev: $42/B input; Clef: Workers AI list price — model-registry). */
function spend(provider, model, usage, caller) {
  try {
    logAIUsage({ provider, model, serviceType: 'system1', caller: `system1:${caller}`,
      promptTokens: usage?.input_tokens ?? usage?.prompt_tokens ?? 0, completionTokens: usage?.output_tokens ?? usage?.completion_tokens ?? 0 });
  } catch { /* spend logging must never break a decision */ }
}

const layaToken = () => process.env.LAYA_TOKEN
  || (existsSync(process.env.LAYA_TOKEN_FILE || `${process.env.HOME}/.laya-token`) ? readFileSync(process.env.LAYA_TOKEN_FILE || `${process.env.HOME}/.laya-token`, 'utf8').trim() : '');

async function post(url, token, body, timeoutMs) {
  const t0 = Date.now();
  const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const text = (await r.text()).slice(0, 300);
    if (url.includes('typesafe')) noteProviderError('Jev (TypeSafe)', { status: r.status, message: text });
    throw Object.assign(new Error(`${url.includes('typesafe') ? 'jev' : 'laya'} ${r.status} ${text.slice(0, 160)}`), { status: r.status });
  }
  return { json: await r.json(), ms: Date.now() - t0 };
}

async function callJev(state, questions, timeoutMs, retries = 4, spendCaller = 'system1') {
  for (let attempt = 0; ; attempt++) {
    try {
      const { json, ms } = await post(JEV_URL, process.env.TYPESAFE_API_KEY, { model: 'jev-latest', state, questions }, timeoutMs);
      spend('typesafe', 'jev-latest', json.usage, spendCaller);
      return { answers: json.answers, tokens: json.usage?.input_tokens ?? null, model: json.model, ms };
    } catch (e) {
      if (attempt >= retries || (e.status && ![429, 500, 502, 503, 504].includes(e.status))) throw e;
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
}
/** Clef via our own Worker (Workers AI binding): same {state, questions} body as Jev, plus any image input. */
async function callClef(model, state, questions, timeoutMs, spendCaller = 'system1') {
  const t0 = Date.now();
  const r = await fetch(`${process.env.CLEF_URL || 'https://siftersearch.com'}/_s1/run`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': clefKey() }, body: JSON.stringify({ model, state, questions }) });
  if (!r.ok) {
    const text = (await r.text()).slice(0, 300);
    noteProviderError('Cloudflare Workers AI (Clef)', { status: r.status, message: text });
    throw Object.assign(new Error(`${model} ${r.status} ${text.slice(0, 160)}`), { status: r.status });
  }
  const json = await r.json();
  const answers = json.answers ?? json.result?.answers;
  if (!answers || typeof answers !== 'object') throw new Error(`${model}: no answers in response`);
  spend('cloudflare', model, json.usage, spendCaller);
  return { answers, ms: Date.now() - t0, model, tokens: json.usage?.input_tokens ?? null };
}
const callBackend = (backend, task, route, state, questions, timeoutMs, retries) => (backend === 'jev' ? callJev(state, questions, timeoutMs, retries, `${task}:shadow`)
  : CLEF.has(backend) ? callClef(backend, state, questions, timeoutMs, `${task}:shadow`) : callLaya(task, route.laya_model, state, questions, timeoutMs));

async function callLaya(task, model, state, questions, timeoutMs) {
  const { json, ms } = await post(LAYA_URL, layaToken(), { task, model, state, questions }, timeoutMs);
  return { answers: json.answers, ms: json.ms ?? ms, model };
}

/** Lowest confidence over the answers (choice confidence; noul distance from 0.5 rescaled to [0,1]). */
export function minConfidence(answers = {}) {
  const cs = Object.values(answers).map((a) => (a?.confidence != null ? a.confidence : a?.noul != null ? Math.abs(a.noul - 0.5) * 2 : 1));
  return cs.length ? Math.min(...cs) : 0;
}

/**
 * Ask a System-1 question set for one TASK TYPE. Returns { answers, served_by, id, tokens }.
 * opts: ref (e.g. content id — joins later gold labels), timeoutMs, shadow (default per routing), log (default true).
 */
export async function ask(task, state, questions, { ref = null, timeoutMs = 20000, shadow, log = true, retries = 4, backend = null } = {}) {
  if (!task) throw new Error('systemone.ask: task type is required (training is per task type)');
  // backend: force one model for this call (an ENSEMBLE caller asks several and votes) — logged, no background shadows
  const route = backend ? { ...routeFor(task), primary: backend, shadow: false } : routeFor(task);
  if (backend && CLEF.has(backend) && !clefOn()) throw new Error(`${backend} unavailable (no edge key)`);
  let jev = null, laya = null, primary = null, served = null;
  if (route.primary === 'laya') {
    try { laya = await callLaya(task, route.laya_model, state, questions, Math.min(timeoutMs, 8000)); } catch { laya = null; }
    if (laya && minConfidence(laya.answers) >= route.min_conf) served = 'laya';
    else { jev = await callJev(state, questions, timeoutMs, retries, task); served = 'jev'; }
  } else if (CLEF.has(route.primary)) {
    try { primary = await callClef(route.primary, state, questions, timeoutMs, task); served = route.primary; }
    catch (e) {
      if (backend) throw e;                                                                    // a forced backend fails honestly
      jev = await callJev(state, questions, timeoutMs, retries, task); served = 'jev';                // Clef down → Jev, never no answer
    }
  } else {
    jev = await callJev(state, questions, timeoutMs, retries, task); served = 'jev';
    if (route.laya_model && (shadow ?? route.shadow)) { try { laya = await callLaya(task, route.laya_model, state, questions, 8000); } catch { laya = null; } }
  }
  let id = null;
  if (log) {
    id = db().prepare(`INSERT INTO calls (task, at, ref, state, questions, jev, jev_tokens, jev_ms, jev_model, laya, laya_ms, laya_model, served_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(task, Date.now(), ref == null ? null : String(ref),
      typeof state === 'string' ? state : JSON.stringify(state), JSON.stringify(questions),
      jev ? JSON.stringify(jev.answers) : null, jev?.tokens ?? null, jev?.ms ?? null, jev?.model ?? null,
      laya ? JSON.stringify(laya.answers) : null, laya?.ms ?? null, laya?.model ?? null, served).lastInsertRowid;
    if (primary) recordShadow(id, primary.model, primary.answers, primary.ms, null);   // a Clef-served answer is kept beside the call
    // SHADOWS: the other backends get the same question AFTER the answer is returned — compared, never served
    if (shadow ?? route.shadow) {
      const backends = route.shadow_backends.filter((b) => b !== served);
      if (CLEF.has(served)) backends.push('jev');                                       // a Clef-served answer is always checked against Jev
      for (const b of [...new Set(backends)].filter((x) => shadowAllowed(task, x))) {
        callBackend(b, task, route, state, questions, 20000, 0)
          .then((r) => recordShadow(id, b, r.answers, r.ms, null))
          .catch((e) => recordShadow(id, b, null, null, String(e.message || e).slice(0, 300)));
      }
    }
  }
  const out = served === 'laya' ? laya : served === 'jev' ? jev : primary;
  return { answers: out.answers, served_by: served, id, tokens: jev?.tokens ?? primary?.tokens ?? 0, jev: jev?.answers ?? null, laya: laya?.answers ?? null };
}

/**
 * Log a Jev call made OUTSIDE ask() (latency-critical callers that keep their own fetch — the search planner, Anís triage)
 * and start the Clef shadows for it, exactly as ask() would. Never throws: logging must not break the caller.
 * @param {string} task  task type (training + comparison are per task)
 * @param {{ answers, ms?, model?, tokens?, ref? }} jev  Jev's answers as the caller received them
 */
export function record(task, state, questions, { answers, ms = null, model = null, tokens = null, ref = null } = {}) {
  try {
    if (!task || !answers) return null;
    spend('typesafe', 'jev-latest', { input_tokens: tokens || 0 }, task);   // a Jev call made outside ask() is spend too (priced as jev-latest)
    const st = typeof state === 'string' ? state : JSON.stringify(state);
    const id = db().prepare(`INSERT INTO calls (task, at, ref, state, questions, jev, jev_tokens, jev_ms, jev_model, served_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'jev')`).run(task, Date.now(), ref == null ? null : String(ref), st, JSON.stringify(questions),
      JSON.stringify(answers), tokens, ms, model).lastInsertRowid;
    const route = routeFor(task);
    if (route.shadow) for (const b of route.shadow_backends.filter((x) => shadowAllowed(task, x))) {
      callBackend(b, task, route, st, questions, 20000, 0)
        .then((r) => recordShadow(id, b, r.answers, r.ms, null))
        .catch((e) => recordShadow(id, b, null, null, String(e.message || e).slice(0, 300)));
    }
    return id;
  } catch { return null; }
}

/** A drop-in `fetch` for modules that call Jev directly: identical behaviour and timing for the caller; on a successful
 *  response, a COPY of the answer is logged under `task` with the request's state + questions (record() → Clef shadows). */
export const jevFetch = (task, base = (...a) => globalThis.fetch(...a)) => async (url, init = {}) => {
  const t0 = Date.now();
  const res = await base(url, init);
  if (res && !res.ok && typeof res.clone === 'function') {
    res.clone().text().then((t) => noteProviderError('Jev (TypeSafe)', { status: res.status, message: t })).catch(() => {});
  }
  if (res?.ok && typeof res.clone === 'function') {
    res.clone().json().then((j) => {
      const b = JSON.parse(init.body || '{}');
      record(task, b.state, b.questions, { answers: j.answers, ms: Date.now() - t0, model: j.model ?? null, tokens: j.usage?.input_tokens ?? null });
    }).catch(() => {});
  }
  return res;
};

function recordShadow(id, backend, answers, ms, error) {
  try {
    db().prepare('INSERT OR REPLACE INTO shadow (call_id, backend, at, answers, ms, error) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, backend, Date.now(), answers ? JSON.stringify(answers) : null, ms, error);
  } catch { /* a shadow record must never break the caller */ }
}

/** Attach a GOLD answer to logged calls (rule-decided or reviewed) — the strongest training targets. */
export function attachGold(task, ref, gold, basis) {
  return db().prepare(`UPDATE calls SET gold = ?, gold_basis = ? WHERE task = ? AND ref = ?`).run(JSON.stringify(gold), basis, task, String(ref)).changes;
}

export const _test = { db: () => db(), reset: () => { store?.close(); store = null; } };

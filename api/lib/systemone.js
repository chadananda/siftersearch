// System-1 client (Jev ↔ Laya), one per TASK TYPE. Every call is logged with its task type, state, questions and the
// full answers (Jev's distributions are Laya's training targets). Laya is NEVER used untrained (Chad: "Laya is not
// supposed to be used out of the box without training"): a task type touches Laya only once a checkpoint trained for THAT
// task is registered (routing.json laya_model); from then Laya shadows Jev for evaluation. Routing per task type: Jev primary until Laya matches it on held-out data, then Laya primary with Jev as
// fallback (Laya down / timeout / below the task's min confidence). Chad 2026-10-02: "each time you use Jev, train Laya.
// When Laya is as good as Jev, switch over" · "keep the task type separated … Laya training separately for different
// task types". Deps: better-sqlite3 (log store), fetch. Env: TYPESAFE_API_KEY, LAYA_URL, LAYA_TOKEN(_FILE), SYSTEMONE_DIR.
// CLEF (Cloudflare Workers AI, Jev-API compatible — Chad 10-05: "test Jev & Clef for every job"): `clef` / `clef-flash` can be
// a task's primary, and are SHADOWED on every call (after the answer returns, never adding latency) into the `shadow` table
// so each task gets an agreement/latency record. Clef runs INSIDE our Cloudflare Worker (Workers AI binding — no API
// token): POST {CLEF_URL}/_s1/run with the internal key. Env: CLEF_URL (default https://siftersearch.com), INTERNAL_API_KEY,
// CLEF=off to disable, SYSTEMONE_SHADOW (default "clef,clef-flash"; "" turns shadowing off). Clef is vision-capable: any
// image input in the request body is passed through to the model.
import Database from 'better-sqlite3';
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

const layaToken = () => process.env.LAYA_TOKEN
  || (existsSync(process.env.LAYA_TOKEN_FILE || `${process.env.HOME}/.laya-token`) ? readFileSync(process.env.LAYA_TOKEN_FILE || `${process.env.HOME}/.laya-token`, 'utf8').trim() : '');

async function post(url, token, body, timeoutMs) {
  const t0 = Date.now();
  const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error(`${url.includes('typesafe') ? 'jev' : 'laya'} ${r.status} ${(await r.text()).slice(0, 160)}`), { status: r.status });
  return { json: await r.json(), ms: Date.now() - t0 };
}

async function callJev(state, questions, timeoutMs, retries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      const { json, ms } = await post(JEV_URL, process.env.TYPESAFE_API_KEY, { model: 'jev-latest', state, questions }, timeoutMs);
      return { answers: json.answers, tokens: json.usage?.input_tokens ?? null, model: json.model, ms };
    } catch (e) {
      if (attempt >= retries || (e.status && ![429, 500, 502, 503, 504].includes(e.status))) throw e;
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
}
/** Clef via our own Worker (Workers AI binding): same {state, questions} body as Jev, plus any image input. */
async function callClef(model, state, questions, timeoutMs) {
  const t0 = Date.now();
  const r = await fetch(`${process.env.CLEF_URL || 'https://siftersearch.com'}/_s1/run`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': clefKey() }, body: JSON.stringify({ model, state, questions }) });
  if (!r.ok) throw Object.assign(new Error(`${model} ${r.status} ${(await r.text()).slice(0, 160)}`), { status: r.status });
  const json = await r.json();
  const answers = json.answers ?? json.result?.answers;
  if (!answers || typeof answers !== 'object') throw new Error(`${model}: no answers in response`);
  return { answers, ms: Date.now() - t0, model, tokens: json.usage?.input_tokens ?? null };
}
const callBackend = (backend, task, route, state, questions, timeoutMs, retries) => (backend === 'jev' ? callJev(state, questions, timeoutMs, retries)
  : CLEF.has(backend) ? callClef(backend, state, questions, timeoutMs) : callLaya(task, route.laya_model, state, questions, timeoutMs));

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
export async function ask(task, state, questions, { ref = null, timeoutMs = 20000, shadow, log = true, retries = 4 } = {}) {
  if (!task) throw new Error('systemone.ask: task type is required (training is per task type)');
  const route = routeFor(task);
  let jev = null, laya = null, primary = null, served = null;
  if (route.primary === 'laya') {
    try { laya = await callLaya(task, route.laya_model, state, questions, Math.min(timeoutMs, 8000)); } catch { laya = null; }
    if (laya && minConfidence(laya.answers) >= route.min_conf) served = 'laya';
    else { jev = await callJev(state, questions, timeoutMs, retries); served = 'jev'; }
  } else if (CLEF.has(route.primary)) {
    try { primary = await callClef(route.primary, state, questions, timeoutMs); served = route.primary; }
    catch { jev = await callJev(state, questions, timeoutMs, retries); served = 'jev'; }      // Clef down → Jev, never no answer
  } else {
    jev = await callJev(state, questions, timeoutMs, retries); served = 'jev';
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
      for (const b of [...new Set(backends)]) {
        callBackend(b, task, route, state, questions, 20000, 0)
          .then((r) => recordShadow(id, b, r.answers, r.ms, null))
          .catch((e) => recordShadow(id, b, null, null, String(e.message || e).slice(0, 300)));
      }
    }
  }
  const out = served === 'laya' ? laya : served === 'jev' ? jev : primary;
  return { answers: out.answers, served_by: served, id, tokens: jev?.tokens ?? primary?.tokens ?? 0, jev: jev?.answers ?? null, laya: laya?.answers ?? null };
}

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

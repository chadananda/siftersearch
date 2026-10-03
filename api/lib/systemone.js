// System-1 client (Jev ↔ Laya), one per TASK TYPE. Every call is logged with its task type, state, questions and the
// full answers (Jev's distributions are Laya's training targets). Laya is NEVER used untrained (Chad: "Laya is not
// supposed to be used out of the box without training"): a task type touches Laya only once a checkpoint trained for THAT
// task is registered (routing.json laya_model); from then Laya shadows Jev for evaluation. Routing per task type: Jev primary until Laya matches it on held-out data, then Laya primary with Jev as
// fallback (Laya down / timeout / below the task's min confidence). Chad 2026-10-02: "each time you use Jev, train Laya.
// When Laya is as good as Jev, switch over" · "keep the task type separated … Laya training separately for different
// task types". Deps: better-sqlite3 (log store), fetch. Env: TYPESAFE_API_KEY, LAYA_URL, LAYA_TOKEN(_FILE), SYSTEMONE_DIR.
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
    CREATE INDEX IF NOT EXISTS calls_ref ON calls(task, ref);`);
  return store;
}

/** Routing per task type (DIR/routing.json): { "<task>": { "laya_model": "<checkpoint trained for this task>",
 *  "primary": "jev"|"laya", "min_conf": 0.9, "shadow": true } }. No laya_model → Jev only, Laya never called. */
export function routeFor(task) {
  const path = join(DIR, 'routing.json');
  const all = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const r = { primary: 'jev', min_conf: 0.9, shadow: true, laya_model: null, ...(all[task] || {}) };
  if (!r.laya_model) { r.primary = 'jev'; r.shadow = false; }   // untrained → Laya is not consulted at all
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

async function callJev(state, questions, timeoutMs) {
  for (let attempt = 0; ; attempt++) {
    try {
      const { json, ms } = await post(JEV_URL, process.env.TYPESAFE_API_KEY, { model: 'jev-latest', state, questions }, timeoutMs);
      return { answers: json.answers, tokens: json.usage?.input_tokens ?? null, model: json.model, ms };
    } catch (e) {
      if (attempt >= 4 || (e.status && ![429, 500, 502, 503, 504].includes(e.status))) throw e;
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
}
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
export async function ask(task, state, questions, { ref = null, timeoutMs = 20000, shadow, log = true } = {}) {
  if (!task) throw new Error('systemone.ask: task type is required (training is per task type)');
  const route = routeFor(task);
  let jev = null, laya = null, served = null;
  if (route.primary === 'laya') {
    try { laya = await callLaya(task, route.laya_model, state, questions, Math.min(timeoutMs, 8000)); } catch { laya = null; }
    if (laya && minConfidence(laya.answers) >= route.min_conf) served = 'laya';
    else { jev = await callJev(state, questions, timeoutMs); served = 'jev'; }
  } else {
    jev = await callJev(state, questions, timeoutMs); served = 'jev';
    if (route.laya_model && (shadow ?? route.shadow)) { try { laya = await callLaya(task, route.laya_model, state, questions, 8000); } catch { laya = null; } }
  }
  let id = null;
  if (log) {
    id = db().prepare(`INSERT INTO calls (task, at, ref, state, questions, jev, jev_tokens, jev_ms, jev_model, laya, laya_ms, laya_model, served_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(task, Date.now(), ref == null ? null : String(ref),
      typeof state === 'string' ? state : JSON.stringify(state), JSON.stringify(questions),
      jev ? JSON.stringify(jev.answers) : null, jev?.tokens ?? null, jev?.ms ?? null, jev?.model ?? null,
      laya ? JSON.stringify(laya.answers) : null, laya?.ms ?? null, laya?.model ?? null, served).lastInsertRowid;
  }
  return { answers: (served === 'laya' ? laya : jev).answers, served_by: served, id, tokens: jev?.tokens ?? 0, jev: jev?.answers ?? null, laya: laya?.answers ?? null };
}

/** Attach a GOLD answer to logged calls (rule-decided or reviewed) — the strongest training targets. */
export function attachGold(task, ref, gold, basis) {
  return db().prepare(`UPDATE calls SET gold = ?, gold_basis = ? WHERE task = ? AND ref = ?`).run(JSON.stringify(gold), basis, task, String(ref)).changes;
}

export const _test = { db: () => db(), reset: () => { store?.close(); store = null; } };

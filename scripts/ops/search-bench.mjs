#!/usr/bin/env node
// Search latency bench vs the contract (api/lib/search/latency-budget.js): POST /api/search/multi through the gateway, bare
// and/or planned, at a concurrency; prints per-stage p50/p95 vs budget and EXITS 1 on any p95 over budget (2 = errors).
//   node scripts/ops/search-bench.mjs [--conc 1] [--rounds 2] [--mode bare|plan|both] [--queries topics|people] [--warm] [--totals-only] [--json]
// --queries people: who-did-what / group questions, the ones that exercise the claims layer (peopleSearch).
// Each query gets a run nonce (cold caches) unless --warm. Keep load modest: --conc ≤ 8. Env: SIFTER_API, DEPLOY_SECRET.
import dotenv from 'dotenv';
import { apiBase } from '../lib/api-base.mjs';
import { engineStages, plannedStages, summarizeStages } from '../../api/lib/search/latency-budget.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const flag = (k) => process.argv.includes(k);
const API = apiBase(), KEY = process.env.DEPLOY_SECRET || '';
const conc = Math.min(8, Math.max(1, Number(arg('--conc', 1)))), rounds = Math.max(1, Number(arg('--rounds', 2)));
const modes = arg('--mode', 'both') === 'both' ? ['bare', 'plan'] : [arg('--mode')];
const TOPICS = [
  'progressive revelation and the unity of the prophets', 'the station of the Bab as the Gate', 'life after death and the progress of the soul',
  "consultation in Baha'i administration", 'the equality of women and men', 'tithing and Huququllah', 'the oneness of mankind and world peace',
  'prayer and fasting as spiritual obligations', 'the covenant and the appointment of Abdul-Baha', 'science and religion in harmony',
  'detachment from the world', 'the lesser peace and the most great peace', 'education of children', 'the purpose of creation knowing God',
  'martyrdom of the Bab in Tabriz', 'the Guardian and the Universal House of Justice',
];
const PEOPLE = [
  'Who were the Seven Martyrs of Tehran?', 'Who were the Hands of the Cause?', 'Which Letters of the Living participated in Badasht?',
  'Who accompanied the Bab to Maku?', 'Who met Bahaullah in Baghdad?', 'Who was imprisoned with Bahaullah in the Siyah-Chal?',
  'Who died at the fort of Shaykh Tabarsi?', 'Who were the Letters of the Living?',
];
const QUERIES = arg('--queries', 'topics') === 'people' ? PEOPLE : TOPICS;
const nonce = flag('--warm') ? '' : ` ${Math.random().toString(36).slice(2, 6)}`;

async function one(q, plan) {
  const t0 = performance.now();
  try {
    const r = await fetch(`${API}/api/search/multi`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': KEY },
      body: JSON.stringify({ query: q, limit: 8, plan, ...(plan ? { messages: [{ role: 'user', content: q }] } : {}) }), signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, wall: Math.round(performance.now() - t0), engine: plan ? (j._plan?.timings?.engine || []) : [j._timings || {}], planned: plan ? j._plan?.timings : null, cached: !!j._plan?.cached };
  } catch (err) { return { ok: false, error: err.message, wall: Math.round(performance.now() - t0) }; }
}

const fmt = (rows, totalsOnly) => rows.filter((r) => !totalsOnly || r.stage === 'total').map((r) =>
  `  ${r.over ? 'OVER' : 'ok  '} ${r.stage.padEnd(22)} p50 ${String(r.p50).padStart(5)}  p95 ${String(r.p95).padStart(5)}  max ${String(r.max).padStart(5)}  budget ${String(r.budget ?? '-').padStart(5)}  n ${r.n}`).join('\n');

let over = false, errors = 0;
const report = {};
for (const mode of modes) {
  const plan = mode === 'plan', engine = [], planned = [], wall = [];
  for (let k = 0; k < rounds; k++) {
    const res = await Promise.all(Array.from({ length: conc }, (_, i) => one(QUERIES[(k * conc + i) % QUERIES.length] + nonce, plan)));
    for (const r of res) {
      if (!r.ok) { errors++; continue; }
      wall.push({ wall: r.wall });
      for (const t of r.engine) engine.push(engineStages(t));
      if (r.planned && !r.cached) planned.push(plannedStages(r.planned));
    }
  }
  const eng = summarizeStages('engine', engine), pl = summarizeStages('planned', planned);
  const w = summarizeStages('wall', wall)[0];
  report[mode] = { wall: w, engine: eng, planned: pl };
  if ([...eng, ...pl].some((r) => r.over && (!flag('--totals-only') || r.stage === 'total'))) over = true;
  if (!flag('--json')) {
    console.log(`\n== ${mode} · conc ${conc} · ${rounds} round(s) · ${API} · wall p50 ${w?.p50 ?? '-'} p95 ${w?.p95 ?? '-'} ms`);
    if (pl.length) console.log(`planned stages:\n${fmt(pl, flag('--totals-only'))}`);
    console.log(`engine stages (per engine call):\n${fmt(eng, flag('--totals-only'))}`);
  }
}
if (flag('--json')) console.log(JSON.stringify({ conc, rounds, errors, over, report }, null, 1));
else console.log(`\n${errors ? `${errors} request(s) failed · ` : ''}${over ? 'BUDGET BREACHED' : 'within budget'}`);
process.exitCode = errors ? 2 : over ? 1 : 0;

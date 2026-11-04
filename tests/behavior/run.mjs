#!/usr/bin/env node
// Behaviour scenarios runner: each scenario × example through Anís (POST /api/v1/anis/draft {trace:true}, async job), the mechanical
// checks here (checks.mjs), `judge` checks by the improve judge (/api/admin/anis/behavior/judge), each run's state posted to
// /api/admin/anis/behavior/runs (the progress page) and appended to tests/behavior/history.json. Internal API only — never a DB.
//   node tests/behavior/run.mjs [--dry] [--only <text>] [--proposed <id>] [--all] [--no-record] [--concurrency 2]
// default = the suite (scenarios/); --proposed <id> = one proposal (proposed/<id>.json); --all = suite + every proposal.
// Exit 1 when a SUITE scenario fails (a proposal failing before its fix is expected). API_BASE (default http://tower-nas:7839),
// INTERNAL_API_KEY (draft), DEPLOY_SECRET (admin).
import dns from 'node:dns'; dns.setDefaultResultOrder('ipv4first');
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { evaluateChecks, applyJudge, scenarioState, scenarioMessages, scenariosIn } from './checks.mjs';

const DIR = dirname(fileURLToPath(import.meta.url)), ROOT = join(DIR, '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const API = process.env.API_BASE || 'http://tower-nas:7839';
const KEY = process.env.INTERNAL_API_KEY, ADMIN = process.env.DEPLOY_SECRET;
const has = (k) => process.argv.includes(`--${k}`);
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const jsonFiles = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.json')).sort() : []);

// ── selection ──
const suite = jsonFiles(join(DIR, 'scenarios')).flatMap((f) => scenariosIn(readJson(join(DIR, 'scenarios', f))).map((s) => ({ s, file: `scenarios/${f}`, proposal: null })));
const proposals = jsonFiles(join(DIR, 'proposed')).flatMap((f) => { const j = readJson(join(DIR, 'proposed', f)); const id = Number(j.id ?? f.replace(/\.json$/, ''));
  return scenariosIn(j).map((s) => ({ s, file: `proposed/${f}`, proposal: id })); });
let picked = arg('proposed') ? proposals.filter((x) => x.proposal === Number(arg('proposed'))) : has('all') ? [...suite, ...proposals] : suite;
if (arg('only')) picked = picked.filter((x) => `${x.file} ${x.s.title}`.toLowerCase().includes(arg('only').toLowerCase()));
if (arg('proposed') && !picked.length) { console.error(`no scenarios in tests/behavior/proposed/${arg('proposed')}.json — write it: node scripts/ops/ops.mjs anis-improve-scenarios ${arg('proposed')} --write`); process.exit(2); }

if (has('dry')) {
  for (const { s, file, proposal } of picked) {
    console.log(`${proposal != null ? `#${proposal} ` : ''}${file} · ${s.title}`);
    for (const e of s.when.examples) console.log(`    e.g. "${e}"`);
    for (const c of s.then) console.log(`    ${c.check}: ${c.expect}`);
  }
  console.log(`\n${picked.length} scenarios, ${picked.reduce((n, x) => n + x.s.when.examples.length, 0)} turns (dry: nothing called)`);
  process.exit(0);
}
if (!KEY || !ADMIN) { console.error('INTERNAL_API_KEY and DEPLOY_SECRET are needed (.env-secrets)'); process.exit(2); }

// ── one Anís turn (job → poll) ──
const RUN = Date.now().toString(36);
let seq = 0;
async function jfetch(url, o = {}) { const r = await fetch(url, { signal: AbortSignal.timeout(60000), ...o }); return { r, j: await r.json().catch(() => ({})) }; }
async function draft(scenario, example) {
  const key = `behavior-${RUN}-${++seq}`, H = { 'content-type': 'application/json', 'X-Internal-Key': KEY };
  const s = await jfetch(`${API}/api/v1/anis/draft`, { method: 'POST', headers: H, body: JSON.stringify({ messages: scenarioMessages(scenario, example),
    email: `battery+behavior-${RUN}-${seq}@siftersearch.com`, async: true, job: key, trace: true, ...(scenario.draft || {}) }) });
  if (!s.r.ok) return { error: `draft ${s.r.status}` };
  for (const t0 = Date.now(); Date.now() - t0 < 8 * 60_000;) {
    await sleep(3000);
    const g = await jfetch(`${API}/api/v1/anis/draft/job/${key}`, { headers: H }).then((x) => x.j).catch(() => ({ status: 'poll-failed' }));
    if (g.status === 'done') return g.result || {};
    if (['failed', 'lost'].includes(g.status)) return { error: g.error || 'job failed' };
  }
  return { error: 'timeout' };
}
async function admin(method, path, body) {
  const r = await fetch(`${API}/api/admin${path}`, { method, headers: { 'content-type': 'application/json', 'X-Internal-Key': ADMIN }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

async function runScenario({ s, file, proposal }) {
  const perExample = [];
  for (const example of s.when.examples) {
    const res = await draft(s, example);
    if (res.error) { perExample.push({ example, error: res.error, results: s.then.map((c) => ({ ...c, pass: false, got: res.error })) }); continue; }
    const trace = { ...(res.trace || {}), reply: res.reply || '' };
    let results = evaluateChecks(trace, s.then);
    const pending = results.filter((r) => r.check === 'judge' && r.pass === null);
    if (pending.length) {
      const j = await admin('POST', '/anis/behavior/judge', { question: example, reply: trace.reply, cited: (trace.cited || []).slice(0, 30), expects: pending.map((r) => r.expect) })
        .catch((err) => ({ results: pending.map(() => ({ pass: false, why: `judge unavailable: ${err.message}` })), usd: 0 }));
      results = applyJudge(results, j.results);
    }
    perExample.push({ example, results, strategy: trace.strategy ?? null, shape: trace.shape ?? null, tools: trace.tools || [] });
  }
  return { title: s.title, file, proposal, state: scenarioState(perExample.map((e) => e.results)), examples: perExample };
}

// ── run ──
const conc = Math.max(1, Number(arg('concurrency') || 2));
const out = [];
for (let i = 0; i < picked.length; i += conc) out.push(...await Promise.all(picked.slice(i, i + conc).map(runScenario)));
let commit = null;
try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { /* not a checkout */ }

for (const r of out) {
  console.log(`${r.state === 'passing' ? 'PASS' : 'FAIL'}  ${r.proposal != null ? `#${r.proposal} ` : ''}${r.title}`);
  for (const e of r.examples) {
    console.log(`    "${e.example}"${e.error ? `  ERROR ${e.error}` : `  [strategy ${e.strategy ?? '–'} · shape ${e.shape ?? '–'} · tools ${e.tools.join(',') || '–'}]`}`);
    for (const c of e.results) console.log(`      ${c.pass ? 'ok  ' : 'FAIL'} ${c.check}: ${c.expect}${c.pass ? '' : `  (got ${JSON.stringify(c.got)})`}`);
  }
}
const byProposal = new Map();
for (const r of out.filter((x) => x.proposal != null)) (byProposal.get(r.proposal) || byProposal.set(r.proposal, []).get(r.proposal)).push(r);
for (const [id, rs] of byProposal) {
  if (rs.every((r) => r.state === 'passing')) console.log(`\n#${id}: every scenario PASSES${arg('proposed') ? ' before any fix — the proposal may be STALE (already done, or the scenarios do not test it)' : ''}`);
  else console.log(`\n#${id}: ${rs.filter((r) => r.state === 'failing').length} of ${rs.length} scenarios fail${arg('proposed') ? ' (expected before the fix)' : ''}`);
}

if (!has('no-record')) {
  await admin('POST', '/anis/behavior/runs', { runs: out.map((r) => ({ scenario: r.title, proposal: r.proposal, state: r.state, commit,
    checks: r.examples.flatMap((e) => e.results.map((c) => ({ check: c.check, pass: c.pass }))) })) }).catch((err) => console.error(`runs not recorded: ${err.message}`));
  const hp = join(DIR, 'history.json');
  const hist = existsSync(hp) ? readJson(hp) : { runs: [] };
  hist.runs.push({ at: new Date().toISOString(), commit, selection: arg('proposed') ? `proposed ${arg('proposed')}` : has('all') ? 'all' : 'suite',
    results: out.map((r) => ({ scenario: r.title, proposal: r.proposal, state: r.state, failed: r.examples.flatMap((e) => e.results.filter((c) => !c.pass).map((c) => c.check)) })) });
  hist.runs = hist.runs.slice(-200);
  writeFileSync(hp, `${JSON.stringify(hist, null, 1)}\n`);
}
const suiteFails = out.filter((r) => r.proposal == null && r.state !== 'passing').length;
console.log(`\n${out.filter((r) => r.state === 'passing').length}/${out.length} scenarios pass · suite failures ${suiteFails}`);
process.exit(suiteFails ? 1 : 0);

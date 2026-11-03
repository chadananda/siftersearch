#!/usr/bin/env node
// Weekly model review (Chad 11-03): roles × registry × spend (ops report spend-by-model) → flags; every 2 weeks each flagged role
// with an eval is MEASURED (harness spawned, budget-capped) → one maintenance section in data/run/maintenance/model-review.json for the weekly email.
//   node scripts/ops/model-review.mjs [--days 30] [--measure|--no-measure] [--budget 15] [--print]   (no mail; nothing switches)
import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_ROLES } from '../../api/lib/model-roles.js';
import { MODEL_REGISTRY } from '../../api/lib/model-registry.js';
import { EVALS, buildSection, measureDue, parseDryEstimate, reviewRoles, summarizeEval } from '../../api/lib/model-review.js';
import { apiBase } from '../lib/api-base.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true }); dotenv.config({ path: join(ROOT, '.env-public'), quiet: true });
const run = promisify(execFile);
const flag = (k) => process.argv.includes(k), val = (k, d) => (flag(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const days = Number(val('--days', 30)), budget = Number(val('--budget', process.env.MODEL_REVIEW_BUDGET_USD || 15));
const OUT = join(ROOT, 'data', 'run', 'maintenance', 'model-review.json');
const now = new Date(), today = now.toISOString().slice(0, 10);

// ---- spend: the spend-by-model ops report (runs in siftersearch-reports; this script never reads ai_usage)
async function spendReport() {
  const API = apiBase(), H = { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.DEPLOY_SECRET || '' };
  const call = async (method, path, body) => { const r = await fetch(`${API}/api/admin${path}`, { method, headers: H, signal: AbortSignal.timeout(30_000), ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status}`); return r.json(); };
  let r = await call('POST', '/ops/reports/spend-by-model', { params: { days } });
  for (const end = Date.now() + 15 * 60_000; ['queued', 'running'].includes(r.status) && Date.now() < end;) {
    await new Promise((z) => setTimeout(z, 10_000));
    r = await call('GET', `/ops/reports/runs/${r.id}`);
  }
  if (r.status !== 'done') throw new Error(`spend-by-model run ${r.id} ${r.status}`);
  return (typeof r.result === 'string' ? JSON.parse(r.result) : r.result)?.rows || [];
}
let spend = [], spendNote = null;
try { spend = await spendReport(); } catch (e) { spendNote = `Spend by model unavailable this run (${e.message}).`; console.error(spendNote); }

const rows = reviewRoles(MODEL_ROLES, MODEL_REGISTRY, { now, spend });
for (const r of rows) console.log(JSON.stringify({ role: r.role, model: `${r.provider}:${r.model}`, reviewed: r.reviewed, eval: r.eval, usd: r.spend_30d?.usd ?? 0, flags: r.flags }));

// ---- measure every 2 weeks (the run is weekly); in between, carry forward choices Chad has not acted on yet
const prev = existsSync(OUT) ? (() => { try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return null; } })() : null;
let lastMeasured = prev?.data?.last_measured || null;
const due = flag('--measure') || (!flag('--no-measure') && measureDue(lastMeasured, now));
const flaggedEval = rows.filter((r) => r.flags.length && r.eval);
const evals = [], skipped = [];
const reportFor = (tag, since) => {   // the harness names its report anis-writer-ab-<UTC date>-writer-<tag>.json; only one written by this run
  const dir = join(ROOT, 'tests', 'quality', 'reports');
  const f = readdirSync(dir).filter((n) => n.endsWith(`-writer-${tag}.json`)).map((n) => join(dir, n)).filter((p) => statSync(p).mtimeMs >= since)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  return f ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
if (due && flaggedEval.length) {
  let left = budget;
  for (const r of flaggedEval) {
    const E = EVALS[r.eval];
    if (!E) { skipped.push({ role: r.role, reason: `eval "${r.eval}" is not defined in EVALS` }); continue; }
    const tag = `review-${r.role}`, args = [join(ROOT, E.script), ...E.args(r.role, MODEL_ROLES[r.role], { sample: 20, tag })];
    const env = { ...process.env, API_BASE: process.env.API_BASE || apiBase() };
    const est = parseDryEstimate((await run(process.execPath, [...args, '--dry'], { cwd: ROOT, env }).catch((e) => ({ stdout: e.stdout }))).stdout);
    if (est == null) { skipped.push({ role: r.role, reason: 'the eval gave no cost estimate (--dry failed)' }); continue; }
    if (est > left) { skipped.push({ role: r.role, reason: `estimate $${est} exceeds the $${left.toFixed(2)} left of this run's $${budget} budget (MODEL_REVIEW_BUDGET_USD)` }); continue; }
    console.error(`measuring ${r.role}: ~$${est}`);
    const t0 = Date.now();
    try {
      await run(process.execPath, args, { cwd: ROOT, env, timeout: 3 * 3600_000, maxBuffer: 64 << 20 });
      const rep = reportFor(tag, t0);
      if (!rep) throw new Error('no report written');
      const ev = summarizeEval(rep);
      left -= ev.spend_usd ?? est;
      evals.push({ ev, measured_at: today });
    } catch (e) { left -= est; skipped.push({ role: r.role, reason: `the eval failed: ${String(e.message).split('\n')[0].slice(0, 200)}` }); }
  }
  if (evals.length) lastMeasured = today;   // nothing measured (all failed / over budget) → the next weekly run tries again
} else if (!due) {
  const next = lastMeasured ? new Date(new Date(lastMeasured).getTime() + 13 * 86_400_000).toISOString().slice(0, 10) : 'on the next measuring run';
  for (const c of prev?.data?.evals || []) if (MODEL_ROLES[c.ev.role] && `${MODEL_ROLES[c.ev.role].provider}:${MODEL_ROLES[c.ev.role].model}` === c.ev.current.writer
    && MODEL_ROLES[c.ev.role].reviewed < c.measured_at) evals.push(c);   // measured, not acted on yet
  for (const r of flaggedEval) if (!evals.some((c) => c.ev.role === r.role) && r.flags.some((f) => !/^review \d+ days old$/.test(f)))
    skipped.push({ role: r.role, reason: `${r.flags.join('; ')} — next measurement ${next}` });
}

const section = buildSection({ rows, evals, skipped, roles: MODEL_ROLES, registry: MODEL_REGISTRY, now, lastMeasured, spendNote });
section.data = { ...section.data, evals, spend_days: days };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(`${OUT}.tmp`, JSON.stringify(section, null, 1)); renameSync(`${OUT}.tmp`, OUT);
console.error(`${section.title}: ${section.summary} → ${OUT}`);
if (flag('--print')) console.log(section.html);
process.exit(0);

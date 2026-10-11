#!/usr/bin/env node
// Ops CLI — an HTTP client of the internal API, never the database (Chad 10-11). Reports run server-side.
//   node scripts/ops/ops.mjs reports                         list reports + recent runs
//   node scripts/ops/ops.mjs report <name> [--days 14] [--wait] [--latest]
// Env: SIFTER_API (default http://127.0.0.1:7839 on tower), DEPLOY_SECRET (X-Internal-Key).
import dotenv from 'dotenv';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const API = process.env.SIFTER_API || 'http://127.0.0.1:7839';
const headers = { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.DEPLOY_SECRET || '' };
const call = async (method, path, body) => {
  const r = await fetch(`${API}/api/admin${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};
const [cmd, name] = process.argv.slice(2);
const flag = (k) => process.argv.includes(k);
const val = (k) => (flag(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
if (cmd === 'reports') console.log(JSON.stringify(await call('GET', '/ops/reports'), null, 1));
else if (cmd === 'report' && name) {
  if (flag('--latest')) console.log(JSON.stringify(await call('GET', `/ops/reports/${name}/latest`), null, 1));
  else {
    const params = val('--days') ? { days: Number(val('--days')) } : null;
    let run = await call('POST', `/ops/reports/${name}`, params ? { params } : {});
    console.error(`run ${run.id} ${run.status}`);
    const deadline = Date.now() + 60 * 60_000;
    while (flag('--wait') && ['queued', 'running'].includes(run.status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10_000));
      run = await call('GET', `/ops/reports/runs/${run.id}`);
    }
    console.log(JSON.stringify(run, null, 1));
  }
} else { console.error('usage: ops.mjs reports | report <name> [--days N] [--wait] [--latest]'); process.exit(2); }
process.exit(0);

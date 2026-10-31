#!/usr/bin/env node
// Ops CLI — an HTTP client of the internal API, never the database (Chad 10-11). Reports run server-side.
//   node scripts/ops/ops.mjs reports                         list reports + recent runs
//   node scripts/ops/ops.mjs report <name> [--days 14 | --ids 1,2,3 | --params '{json}'] [--wait] [--latest]
//   node scripts/ops/ops.mjs media progress | gauges [--host h] [--hours n] [--rows] | status <id|slug|words> | stage <stage> [--missing] [--status done] [--after N] | add <url|path>… | redo <id> <stage>…
// Env: SIFTER_API (default: local gateway on tower, public API elsewhere), DEPLOY_SECRET (X-Internal-Key).
import { apiBase } from '../lib/api-base.mjs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const API = apiBase();
const headers = { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.DEPLOY_SECRET || '' };
const call = async (method, path, body) => {
  const r = await fetch(`${API}/api/admin${path}`, { method, headers: body ? headers : { 'X-Internal-Key': headers['X-Internal-Key'] }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};
// stdout to a pipe is async: process.exit() right after console.log cut results at 64 KB (10-11) — flush first
const out = (obj) => new Promise((r) => process.stdout.write(`${JSON.stringify(obj, null, 1)}\n`, r));
const [cmd, name] = process.argv.slice(2);
const flag = (k) => process.argv.includes(k);
const val = (k) => (flag(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
if (cmd === 'reports') await out(await call('GET', '/ops/reports'));
else if (cmd === 'report' && name) {
  if (flag('--latest')) await out(await call('GET', `/ops/reports/${name}/latest`));
  else {
    const params = val('--params') ? JSON.parse(val('--params')) : val('--days') ? { days: Number(val('--days')) } : val('--hours') ? { hours: Number(val('--hours')) } : val('--ids') ? { ids: val('--ids').split(',').map(Number) } : null;
    let run = await call('POST', `/ops/reports/${name}`, params ? { params } : {});
    console.error(`run ${run.id} ${run.status}`);
    const deadline = Date.now() + 60 * 60_000;
    while (flag('--wait') && ['queued', 'running'].includes(run.status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10_000));
      run = await call('GET', `/ops/reports/runs/${run.id}`);
    }
    await out(run);
  }
} else if (cmd === 'run' && name) await out(await call('GET', `/ops/reports/runs/${name}`));   // one run by id (e.g. the media-item jobs a report queued)
else if (cmd === 'cancel' && name) await out(await call('DELETE', `/ops/reports/runs/${Number(name)}`));
else if (cmd === 'failures') await out(await call('GET', `/ops/failures?hours=${val('--hours') || 24}`));   // failed ops jobs (what the FAILED mails report)
else if (cmd === 'bio-slugs') {   // mint biography slugs in batches of 25 until none are left
  let r; do { r = await call('POST', '/ops/bio-slugs/backfill', { limit: 25 }); console.error(`minted ${r.minted.length}; ${r.with_slug}/${r.total}`); } while (r.minted.length && r.left > 0);
  await out(r);
} else if (cmd === 'dewey-allow') {   // dewey-allow add <email> [note] | remove <email> [--revoke] | list
  const [, sub, email, ...note] = process.argv.slice(2);
  if (sub === 'list') await out(await call('GET', '/ops/dewey-allow'));
  else if (sub === 'add' && email) await out(await call('POST', '/ops/dewey-allow', { email, note: note.join(' ') || null }));
  else if (sub === 'remove' && email) await out(await call('POST', '/ops/dewey-allow/remove', { email, revoke: flag('--revoke') }));
  else { console.error('usage: ops.mjs dewey-allow add <email> [note] | remove <email> [--revoke] | list'); process.exit(2); }
} else if (cmd === 'media') {   // the media stage ledger (api/routes/media-ops.js)
  const [, sub, ...rest] = process.argv.slice(2);
  const pos = rest.filter((x, i) => !x.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));
  if (sub === 'progress') await out(await call('GET', '/ops/media/progress'));
  else if (sub === 'gauges') await out(await call('GET', `/ops/media/gauges?hours=${val('--hours') || 6}&host=${encodeURIComponent(val('--host') || '')}&rows=${flag('--rows') ? 1 : 0}`));
  else if (sub === 'status' && pos[0]) await out(await call('GET', `/ops/media/items/${encodeURIComponent(pos.join(' '))}`));
  else if (sub === 'stage' && pos[0]) await out(await call('GET', `/ops/media/items?stage=${encodeURIComponent(pos[0])}&status=${val('--status') || 'done'}&missing=${flag('--missing') ? 1 : 0}&after=${val('--after') || 0}&limit=${val('--limit') || 50}`));
  else if (sub === 'add' && pos.length) await out(await call('POST', '/ops/media/items', { urls: pos.filter((x) => /^https?:/.test(x)), paths: pos.filter((x) => x.startsWith('/')) }));
  else if (sub === 'redo' && pos[1]) await out(await call('POST', `/ops/media/items/${pos[0]}/redo`, { stages: pos.slice(1) }));
  else if (sub === 'promote-image' && pos[0]) {   // --home aorus=tag,boss=tag  --quiet aorus,boss
    const kv = (v) => v ? Object.fromEntries(v.split(',').map((x) => x.split('='))) : undefined;
    await out(await call('POST', '/ops/media/worker-image', { image: pos[0], evidence: val('--evidence'), home_image: kv(val('--home')), quiet_hosts: val('--quiet')?.split(',') }));
  }
  else if (sub === 'rentals') await out(await call('POST', '/ops/media/rentals', { ...(flag('--resume') ? { pause: false } : val('--pause') ? { pause: val('--pause') } : {}), ...(val('--max-pods') ? { maxPods: Number(val('--max-pods')) } : {}) }));
  else { console.error('usage: ops.mjs media rentals [--pause "why" | --resume] [--max-pods n] | promote-image <ghcr…@sha256> --evidence "…" [--home h=tag,…] [--quiet h,…] | progress | gauges [--host h --hours n --rows] | status <ref> | stage <stage> [--missing] | add <url|path>… | redo <id> <stage>…'); process.exit(2); }
} else { console.error('usage: ops.mjs run <id> | failures [--hours N] | dewey-allow | bio-slugs | ops.mjs reports | report <name> [--days N] [--wait] [--latest]'); process.exit(2); }
process.exit(0);

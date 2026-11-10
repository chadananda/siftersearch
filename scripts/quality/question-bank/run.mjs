#!/usr/bin/env node
// Question-bank runner: bank questions → live /api/chat/stream, checked in code with the live battery's send/check (no LLM judge). Records strategy, seconds, cost; summary per tradition.
//   node run.mjs [--tradition sikhism,islam] [--limit N] [--sample N] [--include-held-out|--held-out-only] [--concurrency 2] [--seed 1]   API_BASE (default https://api.siftersearch.com)
// Anís answers bill to the test ledger (cap ≈ $5/day, never raised): start small with --sample.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import net from 'net';
net.setDefaultAutoSelectFamilyAttemptTimeout(3000);
// the battery exports send via turn? only check/CASES are exported; re-import its module without running main (guarded by import.meta.url)
import { check, turn } from '../../../tests/quality/anis-live-battery.mjs';
import dotenv from 'dotenv';
import { apiBase } from '../../lib/api-base.mjs';
dotenv.config({ path: '.env-secrets', quiet: true });
// strategy + cost are not in the stream's complete event: read them from the stored thread (internal API, same as ops.mjs anis-trace)
async function threadInfo(cid) {
  for (let a = 0; a < 3 && cid; a++) {
    try {
      const r = await fetch(`${apiBase()}/api/admin/anis/threads/${encodeURIComponent(cid)}`, { headers: { 'X-Internal-Key': process.env.DEPLOY_SECRET || '' }, signal: AbortSignal.timeout(20000) });
      const t = r.ok ? await r.json() : null, rep = t?.rounds?.at(-1)?.reply;
      if (rep?.route) return { strategy: rep.route.strategy ?? rep.route.gate ?? null, usd: t.totals?.usd ?? rep.meta?.usd ?? null, type: rep.meta?.type ?? null };
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  return {};
}
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const DIR = 'tests/quality/question-bank', only = arg('tradition')?.split(','), conc = Number(arg('concurrency', 2));
const ids = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).filter((i) => !only || only.includes(i));
// deterministic shuffle so --sample N is reproducible and spread across the ranking
let seed = Number(arg('seed', 1)); const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const jobs = [];
for (const id of ids) {
  let qs = JSON.parse(readFileSync(`${DIR}/${id}.json`, 'utf8')).questions;
  qs = flag('held-out-only') ? qs.filter((x) => x.held_out) : flag('include-held-out') ? qs : qs.filter((x) => !x.held_out);
  if (arg('sample')) qs = qs.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).slice(0, Number(arg('sample'))).map((x) => x[1]);
  if (arg('limit')) qs = qs.slice(0, Number(arg('limit')));
  jobs.push(...qs.map((x) => ({ id, ...x })));
}
// estimate: last measured cost per question if a previous run exists, else unknown
console.log(`${jobs.length} questions across ${ids.length} tradition(s)`);
const res = []; let i = 0, capped = false;
await Promise.all(Array.from({ length: conc }, async () => { while (i < jobs.length && !capped) {
  const j = jobs[i++], c = { id: j.id, q: j.q, ms: 90000 };
  const r = await turn(j.q, c), isCap = /reached today.s limit/i.test(r.text), f = isCap ? ['DAILY SPEND CAP: canned limit reply, not an answer'] : check(c, r), m = r.complete || {}, ti = await threadInfo(m.conversation_id || r.cid);
  if (isCap) { capped = true; console.log('CAP  daily test spend cap reached; stopping (never raised)'); continue; }
  res.push({ bank_id: j.id, q: j.q, held_out: j.held_out, fails: f, seconds: +(r.ms / 1000).toFixed(1), first_s: Math.min(...['book', 'chunk', 'text'].map((k) => r.at[k] ?? Infinity)) / 1000, strategy: ti.strategy ?? null, type: ti.type ?? null, cost_usd: ti.usd ?? null, meta: m, text: r.text, cites: r.citations.map((x) => x.title) });
  console.log(`${f.length ? 'FAIL' : 'ok  '} ${j.id.padEnd(15)} ${String(r.ms).padStart(6)} ms  ${j.q.slice(0, 60)}${f.length ? `\n      ${f.join('\n      ')}` : ''}`);
} }));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
console.log('\ntradition        n  pass%   p50 s   p90 s   cost$   strategies');
const rows = [];
for (const id of ids) {
  const g = res.filter((x) => x.bank_id.startsWith(`${id}-`)); if (!g.length) continue;
  const mix = {}; for (const x of g) mix[x.strategy ?? '?'] = (mix[x.strategy ?? '?'] || 0) + 1;
  const cost = g.reduce((s, x) => s + (x.cost_usd || 0), 0);
  rows.push({ tradition: id, n: g.length, pass: g.filter((x) => !x.fails.length).length, cost });
  console.log(`${id.padEnd(15)} ${String(g.length).padStart(3)} ${String(Math.round(100 * g.filter((x) => !x.fails.length).length / g.length)).padStart(5)}%  ${pct(g.map((x) => x.seconds), 0.5).toFixed(1).padStart(6)}  ${pct(g.map((x) => x.seconds), 0.9).toFixed(1).padStart(6)}  ${cost.toFixed(3).padStart(7)}   ${Object.entries(mix).map(([k, v]) => `${k}:${v}`).join(' ')}`);
}
const costed = res.filter((x) => x.cost_usd != null), actual = costed.reduce((s, x) => s + x.cost_usd, 0), per = costed.length ? actual / costed.length : null;
console.log(`\ncost: actual $${actual.toFixed(3)} over ${costed.length}/${res.length} turns with cost in the complete event${per != null ? `; $${per.toFixed(4)}/question → 1200 questions ≈ $${(per * 1200).toFixed(2)}` : '; no cost found (thread not readable: check DEPLOY_SECRET / SIFTER_API)'}`);
mkdirSync('tmp/question-bank', { recursive: true });
const file = `tmp/question-bank/run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), api: process.env.API_BASE || 'https://api.siftersearch.com', rows, results: res }, null, 1));
console.log(`results: ${file}`);

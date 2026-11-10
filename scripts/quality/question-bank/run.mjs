#!/usr/bin/env node
// Question-bank runner: bank questions → live /api/chat/stream, checked in code with the live battery's send/check (no LLM judge). Records strategy, seconds, cost; summary per tradition.
//   node run.mjs [--tradition sikhism,islam] [--limit N] [--sample N] [--include-held-out|--held-out-only] [--concurrency 2] [--seed 1]   API_BASE (default https://api.siftersearch.com)
//   --perplexity  each question also answered by Perplexity sonar, CACHED per question (tests/quality/question-bank/perplexity/<tradition>.json; --refresh-px refetches)
//   --judge       + the Opus source judge per question (perplexity-compare.mjs; usage reported to the ledger as battery-judge → improve cap) → anis_better|equal|px_better
//   Presentation (passage cards, book card, OceanLibrary links, bad/bare links, words, seconds) is scored in code on every answer (px-bank.mjs). Report → tests/quality/reports/.
// Anís answers bill to the test ledger (cap ≈ $5/day, never raised): start small with --sample.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import net from 'net';
net.setDefaultAutoSelectFamilyAttemptTimeout(3000);
// the battery exports send via turn? only check/CASES are exported; re-import its module without running main (guarded by import.meta.url)
import { check, turn } from '../../../tests/quality/anis-live-battery.mjs';
import dotenv from 'dotenv';
import { apiBase } from '../../lib/api-base.mjs';
import Anthropic from '@anthropic-ai/sdk';
import { calculateCost } from '../../../api/lib/model-registry.js';
import { perplexityTurn, compareConversation } from '../../../tests/quality/perplexity-compare.mjs';
import { presentation, pxCache, pxAnswer, asConversation, verdictOf, bankRollup } from './px-bank.mjs';
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
const jobs = [], labels = {};
for (const id of ids) {
  const bank = JSON.parse(readFileSync(`${DIR}/${id}.json`, 'utf8')); labels[id] = bank.label || id;
  let qs = bank.questions;
  qs = flag('held-out-only') ? qs.filter((x) => x.held_out) : flag('include-held-out') ? qs : qs.filter((x) => !x.held_out);
  if (arg('sample')) qs = qs.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).slice(0, Number(arg('sample'))).map((x) => x[1]);
  if (arg('limit')) qs = qs.slice(0, Number(arg('limit')));
  jobs.push(...qs.map((x) => ({ ...x, bank: id })));
}
// estimate: last measured cost per question if a previous run exists, else unknown
console.log(`${jobs.length} questions across ${ids.length} tradition(s)`);
const WITH_PX = flag('perplexity') || flag('judge'), JUDGE = flag('judge'), JUDGE_MODEL = process.env.CONV_JUDGE_MODEL || 'claude-opus-5-5';
const AUTHORITY = `AUTHORITY ORDER: each tradition's own scripture first, then its authorised interpreters, then commentary and scholarship, labelled. For the Bahá'í Faith: the Writings of the Báb, Bahá'u'lláh and 'Abdu'l-Bahá; then Shoghi Effendi; then pilgrims' notes; then scholarship; Universal House of Justice letters are guidance on application, never doctrine.`;
const internal = (path, init = {}) => fetch(`${apiBase()}/api/admin/ops${path}`, { ...init, headers: { 'X-Internal-Key': process.env.DEPLOY_SECRET || '', 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000) });
const usd = (model, u) => calculateCost(model, (u?.input_tokens || 0) + (u?.cache_read_input_tokens || 0) + (u?.cache_creation_input_tokens || 0), u?.output_tokens || 0);
// the judge's Opus calls bypass the app: every call's usage is reported to the ledger (caller battery-judge → the improve cap), and a blocking cap stops the judge
let client; const claude = () => ({ messages: { create: async (p) => { const res = await (client ||= new Anthropic()).messages.create(p);
  await internal('/spend-ledger', { method: 'POST', body: JSON.stringify({ caller: 'battery-judge', provider: 'anthropic', model: p.model, prompt_tokens: res.usage?.input_tokens || 0, completion_tokens: res.usage?.output_tokens || 0, cached_tokens: res.usage?.cache_read_input_tokens || 0, cache_write_tokens: res.usage?.cache_creation_input_tokens || 0 }) })
    .catch((e) => console.warn(`could not report the judge's usage to the ledger: ${e.message}`));
  return res; } } });
if (JUDGE) {
  const r = await internal('/spend-caps').catch(() => null);
  if (!r?.ok) { console.error(`spend-caps check failed (${r?.status ?? 'no answer'}) — refusing to run an unmetered Opus judge`); process.exit(1); }
  const g = ((await r.json()).groups || []).find((x) => x.group === 'improve');
  if (g && (g.blocking || (g.remaining_usd != null && g.remaining_usd <= 0))) { console.error('improve cap reached today — no judge (never raised)'); process.exit(1); }
}
const caches = Object.fromEntries(ids.map((id) => [id, pxCache(id)]));
const spend = { px: 0, judge: 0 };
const res = []; let i = 0, capped = false;
await Promise.all(Array.from({ length: conc }, async () => { while (i < jobs.length && !capped) {
  const j = jobs[i++], c = { id: j.id, q: j.q, ms: 90000 };
  const r = await turn(j.q, c), isCap = /reached today.s limit/i.test(r.text), f = isCap ? ['DAILY SPEND CAP: canned limit reply, not an answer'] : check(c, r), m = r.complete || {}, ti = await threadInfo(m.conversation_id || r.cid);
  if (isCap) { capped = true; console.log('CAP  daily test spend cap reached; stopping (never raised)'); continue; }
  const row = { bank_id: j.id, q: j.q, held_out: j.held_out, fails: f, seconds: +(r.ms / 1000).toFixed(1), first_s: Math.min(...['book', 'chunk', 'text'].map((k) => r.at[k] ?? Infinity)) / 1000, strategy: ti.strategy ?? null, type: ti.type ?? null, cost_usd: ti.usd ?? null, meta: m, text: r.text, cites: r.citations.map((x) => x.title), presentation: presentation(r) };
  if (WITH_PX) {
    const got = await pxAnswer(j.q, caches[j.bank], { refresh: flag('refresh-px'), fetchPx: perplexityTurn });
    spend.px += got.cost; row.px_cost = got.cost; row.px = { text: got.px.text, urls: got.px.urls, cost: got.px.cost, ms: got.px.ms, cached: !got.fetched, error: got.px.error ?? null };
    if (JUDGE && got.px.text && r.text) {
      const conv = asConversation(row, r, got.px, labels[j.bank]);
      await compareConversation(conv, { claude, model: JUDGE_MODEL, usd, api: apiBase(), authority: AUTHORITY, concurrency: 1, onCost: (c) => { spend.judge += c; } });
      const sc = conv.turns[0].source_compare || {};
      row.judge = sc.error ? { error: sc.error } : { verdict: verdictOf(sc.winner), why: sc.why, px_only_sources: sc.px_only_sources, px_errors: sc.px_errors, anis_errors: sc.anis_errors, cost: sc.cost };
    }
  }
  res.push(row);
  const pr = row.presentation;
  console.log(`${f.length ? 'FAIL' : 'ok  '} ${j.id.padEnd(15)} ${String(r.ms).padStart(6)} ms  cards ${pr.passage_cards}${pr.book_card ? '+book' : ''} OL ${pr.ocean_links}/${pr.ocean_works}w${pr.bad_links ? ` bad ${pr.bad_links}` : ''}${row.judge?.verdict ? `  ${row.judge.verdict}` : ''}  ${j.q.slice(0, 50)}${f.length ? `\n      ${f.join('\n      ')}` : ''}`);
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
if (WITH_PX) {
  const roll = bankRollup(res);
  console.log('\ntradition       judged  anís>  =  px>  · cards/ans  OL links  OL works  no-OL  bad  bare  words(px)');
  for (const [t, x] of Object.entries(roll)) console.log(`${t.padEnd(15)} ${String(x.judged).padStart(6)} ${String(x.verdicts.anis_better).padStart(5)} ${String(x.verdicts.equal).padStart(2)} ${String(x.verdicts.px_better).padStart(4)}  · ${String(x.presentation.passage_cards).padStart(9)} ${String(x.presentation.ocean_links).padStart(9)} ${String(x.presentation.ocean_works).padStart(9)} ${String(x.presentation.no_ocean_link).padStart(6)} ${String(x.presentation.bad_links).padStart(4)} ${String(x.presentation.bare_urls).padStart(5)}  ${x.presentation.words}(${x.presentation.px_words ?? '-'})`);
  const missed = Object.values(roll).flatMap((x) => x.missed_in_library);
  if (missed.length) { console.log(`\nmissed but in the library (${missed.length}) — retrieval/selection defects:`); for (const m of missed) console.log(`  ${m.bank_id}: ${m.title}${m.author ? ` (${m.author})` : ''}${m.match ? ` → doc ${m.match.document_id}` : ''}${m.in_anis_sources ? ' [was in his sources]' : ''}`); }
  console.log(`\nPerplexity $${spend.px.toFixed(4)} this run (cached answers cost nothing)${JUDGE ? ` · judge $${spend.judge.toFixed(4)} (reported to the ledger)` : ''}`);
  mkdirSync('tests/quality/reports', { recursive: true });
  const rep = `tests/quality/reports/bank-vs-perplexity-${new Date().toISOString().slice(0, 10)}${only ? `-${only.join('-')}` : ''}.json`;
  writeFileSync(rep, `${JSON.stringify({ at: new Date().toISOString(), api: apiBase(), judge_model: JUDGE ? JUDGE_MODEL : null, usd: { perplexity: +spend.px.toFixed(4), judge: +spend.judge.toFixed(4), anis: +actual.toFixed(4) },
    traditions: roll, results: res.map(({ meta, ...x }) => x) }, null, 1)}\n`);
  console.log(`report: ${rep}`);
}

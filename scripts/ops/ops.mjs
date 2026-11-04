#!/usr/bin/env node
// Ops CLI — an HTTP client of the internal API, never the database (Chad 10-11). Reports run server-side.
//   node scripts/ops/ops.mjs reports                         list reports + recent runs
//   node scripts/ops/ops.mjs search-excluded                 search exclusion list: metadata + retired duplicates, points left per collection
//   node scripts/ops/ops.mjs report <name> [--days 14 | --ids 1,2,3 | --params '{json}'] [--wait] [--latest]
//   node scripts/ops/ops.mjs media held | rejudge [id…] | progress | log [--since 6h|ISO --kind k1,k2 --limit n] | gauges [--host h] [--hours n] [--rows] | health-history <machine> [--from --to] | status <id|slug|words> | stage <stage> [--missing] [--status done] [--after N] | add <url|path>… | redo <id> <stage>…
//   node scripts/ops/ops.mjs spend-caps                      each caller group's spend today vs. its daily cap, and whether it is blocking
//   node scripts/ops/ops.mjs search-latency [--minutes 60]   per-stage p50/p95 vs the search budget (search/latency-budget.js)
//   node scripts/ops/ops.mjs anis-forensics [--days 7] [--stage rank] [--json]   stage × class defect queue (replies, searches) + Opus judge tally
//   node scripts/ops/ops.mjs anis-improvements [--status open] | anis-improvement-status <id> <open|accepted|done|rejected> [note]
//   node scripts/ops/ops.mjs anis-improve-digest [--since 24h|ISO] [--json]   DAILY for Claude Code: assessment + new/grown CODE recommendations + DATA changes
//   node scripts/ops/ops.mjs anis-improve-report [--days 7] [--target code|data|<target>] [--stage S] [--status open] [--since ISO]   audits → conclusions → solutions (JSON)
//   node scripts/ops/ops.mjs anis-improve-status <id> <accepted|done|rejected|open> [--note "what was done"]   sets status + reviewed_by internal:claude-code
//   node scripts/ops/ops.mjs search-replay --class <class> [--days 7]   re-run that class's turns (no LLM) → how many the current code fixes
//   node scripts/ops/ops.mjs anis-trace <thread|thread:round>  an Anís thread / turn: every search (tool, query, ranked hits), writer passages, citations
//   node scripts/ops/ops.mjs search-trace [<traceId>] [--query w --tool t --doc id|title --thread id --turn id --endpoint e --days n --limit n --zero --slow ms]
//   node scripts/ops/ops.mjs search-replay <traceId|thread:round>  re-run on current code (no LLM): old vs new ranks
//   node scripts/ops/ops.mjs anis-strategies [--json]  (Anís strategy graph: versions, node paths, activities)
//   node scripts/ops/ops.mjs anis-strategy-stats [--days 7] [--json]  (per strategy@version: turns, p50/p95, $/turn, judge score, weak %)
//   node scripts/ops/ops.mjs anis-branches <strategy> [--days 7] [--json]  (per branch: node:edge path, share, p50, score)
//   node scripts/ops/ops.mjs anis-step-stats [--days 7] [--json]  (per step@version: runs, p50/p95, $, edge mix, Jev accuracy)
//   node scripts/ops/ops.mjs jev-gates [--days 7] | jev-bank <gate> [--chosen X --q question --wrong|--right|--unlabelled --since 7d --limit n --state] | jev-label <call_id> <answer> [--q question --basis note] | jev-try <gate> <variant> [--n 200 --params '{json}' --chosen X --stored --since 30d --any --max-usd 2]  (Jev decision-gate bank + tuning; --json for JSON)
//   (the three print tables; --json prints the API's JSON)
// Env: SIFTER_API (default: local gateway on tower, public API elsewhere), DEPLOY_SECRET (X-Internal-Key — the key requireInternal checks).
import { apiBase } from '../lib/api-base.mjs';
import dotenv from 'dotenv';
import { turnText, threadText, traceListText, traceText, replayText } from './trace-format.mjs';
import { forensicTable, assessSearch } from '../../api/lib/audit/forensics.js';   // pure (no db)

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
else if (cmd === 'search-excluded') await out(await call('GET', '/ops/search/excluded'));   // excluded docs + which still have Qdrant points
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
else if (cmd === 'spend-caps') await out(await call('GET', '/ops/spend-caps'));
else if (cmd === 'search-latency') await out(await call('GET', `/ops/search-latency?minutes=${val('--minutes') || 60}`));
else if (cmd === 'anis-forensics') {
  const j = await call('GET', `/anis/forensics?days=${val('--days') || 7}${val('--stage') ? `&stage=${encodeURIComponent(val('--stage'))}` : ''}`);
  if (flag('--json')) await out(j);
  else {
    const jd = j.judge || {};
    await new Promise((r) => process.stdout.write(`ANÍS FORENSICS · last ${j.days} days${j.stage ? ` · stage ${j.stage}` : ''}\n\nREPLIES\n${forensicTable(j.replies)}\n\nSEARCHES\n${forensicTable(j.searches)}\n\n`
      + `JUDGE (Opus 5.5): judged ${jd.judged} · pending ${jd.pending} · weak ${jd.weak} (${jd.weak_rate ?? '–'}) · $${jd.usd} ($${jd.usd_per_item ?? '–'}/item)\n`
      + (jd.weak_classes || []).slice(0, 15).map((c) => `  ${c.class.padEnd(26)} ${c.n}`).join('\n') + '\n', r));
  }
} else if (cmd === 'anis-improvements') {
  const j = await call('GET', `/anis/improvements?status=${val('--status') || 'open'}&limit=${val('--limit') || 50}`);
  if (flag('--json')) await out(j);
  else await new Promise((r) => process.stdout.write(`${(j.improvements || []).map((x) => `#${x.id} [${x.status}] score ${x.score} (evidence ${x.evidence_n} × sev ${x.severity}) ${x.stage} ${x.file || ''}${x.fn ? ` ${x.fn}` : ''}\n    ${x.change}\n    → ${x.expected_effect || ''}`).join('\n') || '(none)'}\n`, r));
} else if (cmd === 'anis-improvement-status' && name) {
  const [, , status, ...note] = process.argv.slice(2);
  await out(await call('POST', `/anis/improvements/${Number(name)}/status`, { status, ...(note.length ? { note: note.join(' ') } : {}) }));
} else if (cmd === 'anis-improve-report') {
  const q = new URLSearchParams({ days: val('--days') || '7' });
  for (const k of ['target', 'stage', 'status', 'kind', 'since', 'limit']) if (val(`--${k}`)) q.set(k, val(`--${k}`));
  await out(await call('GET', `/anis/improve-report?${q}`));
} else if (cmd === 'anis-improve-digest') {
  const j = await call('GET', `/anis/improve-digest?since=${encodeURIComponent(val('--since') || '24h')}`);
  if (flag('--json')) await out(j);
  else {
    const a = j.assessment || {};
    const L = [`ANÍS IMPROVEMENT DIGEST · since ${j.since}${j.available ? '' : ' · (no improve store)'}`,
      `assessment: judged ${a.judged} · weak ${a.weak} (${a.weak_pct ?? '–'}%) · mean severity ${a.mean_severity ?? '–'} (weak verdicts, 1-3) · $${a.spend_usd}${a.cap_usd != null ? ` · today $${a.spent_today_usd} of $${a.cap_usd} cap` : ''}`,
      `  by stage: ${Object.entries(a.by_stage || {}).map(([k, n]) => `${k} ${n}`).join(' · ') || '–'}`,
      `  top classes: ${(a.top_classes || []).map((c) => `${c.class} ${c.n}`).join(' · ') || '–'}`,
      '', `CODE recommendations, new or grown (${(j.code || []).length}):`];
    for (const c of j.code || []) {
      L.push(`#${c.id} ${c.new ? 'NEW' : `+${c.evidence_new}`} [${c.status}] ${c.target} · ${c.stage} · ${c.file || '?'}${c.fn ? ` ${c.fn}` : ''} · evidence ${c.evidence_n} × sev ${c.severity}`,
        `    ${c.change}`, ...(c.expected_effect ? [`    → ${c.expected_effect}`] : []),
        ...c.examples.map((e) => `    e.g. ${e.turn_id || e.item_key}  ${e.trace || ''}`));
    }
    L.push('', `DATA changes (${(j.data || []).length}):`, ...(j.data || []).map((x) => `#${x.id} ${x.state} [${x.status}] ${x.target} · ${x.stage} · evidence ${x.evidence_n} — ${x.change}`));
    L.push('', 'Act: node scripts/ops/ops.mjs anis-improve-status <id> <accepted|done|rejected> --note "…"');
    await new Promise((r) => process.stdout.write(`${L.join('\n')}\n`, r));
  }
} else if (cmd === 'anis-improve-status' && name) {
  const status = process.argv[4];
  if (!['open', 'accepted', 'done', 'rejected'].includes(status)) { console.error('usage: ops.mjs anis-improve-status <id> <accepted|done|rejected|open> [--note "…"]'); process.exit(2); }
  await out(await call('POST', `/anis/improvements/${Number(name)}/status`, { status, by: val('--by') || 'claude-code', ...(val('--note') ? { note: val('--note') } : {}) }));
} else if (cmd === 'search-replay' && val('--class')) {   // re-run a defect class's turns through today's search (no LLM) and re-assess
  const cls = val('--class');
  if (!cls) { console.error('usage: ops.mjs search-replay --class <defect-class> [--days 7]'); process.exit(2); }
  const j = await call('GET', `/anis/forensics?days=${val('--days') || 7}&examples=10`);
  const isSearch = (j.searches?.queue || []).some((e) => e.class === cls);
  const entry = [...(j.searches?.queue || []), ...(j.replies?.queue || [])].find((e) => e.class === cls);
  // only the ranked list re-runs without an LLM: classes owned by later stages (SELECTION, WRITER, …) need a new reply
  if (entry && !['RETRIEVAL', 'RANK', 'LATENCY'].includes(entry.stage)) { await out({ class: cls, stage: entry.stage, found: entry.n, note: 'not replayable without the writer (no LLM here)' }); process.exit(0); }
  const res = [];
  for (const x of entry?.examples || []) {
    const path = isSearch ? `/search-trace/${encodeURIComponent(x.message_id)}/replay` : x.turn_id ? `/anis/turns/${encodeURIComponent(x.turn_id)}/replay` : null;
    if (!path) { res.push({ id: x.message_id, error: 'no turn id (reply recorded before 11-04 tracing)' }); continue; }
    try {
      const r = await call('POST', path, {});
      const reps = (r.replays || []).filter((p) => !p.error);
      const still = reps.some((p) => assessSearch({ trace_id: p.trace_id, tool: p.tool, query: p.query, hits: p.diff?.rows || [] }).defects.some((d) => d.class === cls));
      res.push({ id: x.turn_id || x.message_id, ...(reps.length ? { fixed: !still } : { error: (r.replays || [])[0]?.error || 'nothing replayable' }) });
    } catch (e) { res.push({ id: x.turn_id || x.message_id, error: e.message.slice(0, 120) }); }
  }
  await out({ class: cls, stage: entry?.stage ?? null, found: entry?.n ?? 0, replayed: res.filter((r) => !r.error).length, fixed: res.filter((r) => r.fixed).length, items: res });
}
else if (['anis-trace', 'search-trace', 'search-replay'].includes(cmd)) {   // search introspection (11-04): no code needed to read search history
  const isTurn = (x) => /:\d+$/.test(String(x || ''));
  const show = async (res, fmt) => (flag('--json') ? out(res) : new Promise((r) => process.stdout.write(`${fmt(res)}\n`, r)));
  const e = encodeURIComponent;
  if (cmd === 'anis-trace' && name) await (isTurn(name) ? show(await call('GET', `/anis/turns/${e(name)}/trace`), turnText) : show(await call('GET', `/anis/threads/${e(name)}`), threadText));
  else if (cmd === 'search-replay' && name) await show(await call('POST', isTurn(name) ? `/anis/turns/${e(name)}/replay` : `/search-trace/${e(name)}/replay`, {}), replayText);
  else if (cmd === 'search-trace' && name && !name.startsWith('--')) await show(await call('GET', `/search-trace/${e(name)}`), traceText);
  else if (cmd === 'search-trace') {
    const qs = new URLSearchParams(Object.entries({ query: val('--query'), tool: val('--tool'), doc: val('--doc'), thread: val('--thread'), turn: val('--turn'), endpoint: val('--endpoint'),
      days: val('--days'), limit: val('--limit') || 30, slowerThan: val('--slow'), sort: flag('--slow') ? 'slow' : undefined, zeroOnly: flag('--zero') ? 1 : undefined }).filter(([, v]) => v != null && v !== ''));
    await show(await call('GET', `/search-trace?${qs}`), traceListText);
  } else { console.error('usage: ops.mjs anis-trace <thread|thread:round> | search-trace [<traceId>] [--query --tool --doc --thread --turn --endpoint --days --limit --zero --slow ms] | search-replay <traceId|thread:round>  [--json]'); process.exit(2); }
}
else if (cmd === 'anis-strategies') {   // Anís strategy graph (strategies-repo): each strategy's active version + its node path, the store's rev/source
  const j = await call('GET', '/anis/strategies');
  if (flag('--json')) await out(j);
  else {
    const latest = new Map(); for (const s of j.strategies) if (!latest.has(s.id) || latest.get(s.id).version < s.version) latest.set(s.id, s);
    const path = (g) => { const seen = [], next = new Map(); for (const e of g?.edges || []) if (e.on === '*') next.set(e.from, e.to); for (let n = g?.entry; n && n !== '$end' && !seen.includes(n);) { seen.push(n); n = next.get(n); } return seen.join(' → '); };
    await new Promise((r) => process.stdout.write(`ANÍS STRATEGIES · rev ${j.rev} · ${j.source}${j.db ? ` (${j.db})` : ''} · ${j.templates.length} templates · ${j.steps.length} steps · ${j.activities?.length ?? 0} activities\n`
      + [...latest.values()].map((s) => `${`${s.id}@${s.version}`.padEnd(18)} ${String(s.name).padEnd(14)} ${s.status.padEnd(7)} ${path(s.graph)}`).join('\n') + '\n', r));
  }
}
else if (cmd === 'anis-strategy-stats') {   // strategy-stats-repo: every strategy@version over --days, quality joined from the improve judge
  const j = await call('GET', `/anis/strategies/stats?days=${val('--days') || 7}`);
  const f = (x, d = '–') => (x == null ? d : String(x));
  if (flag('--json')) await out(j);
  else await new Promise((r) => process.stdout.write(`ANÍS STRATEGY STATS · last ${j.days} days  (score: judge 0–10, mean of scored)\n${'strategy@v'.padEnd(20)} ${'turns'.padStart(6)} ${'share'.padStart(6)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'$/turn'.padStart(8)} ${'judged'.padStart(6)} ${'score/n'.padStart(8)} ${'weak%'.padStart(6)}  top defects\n`
    + j.strategies.map((s) => `${s.key.padEnd(20)} ${f(s.turns).padStart(6)} ${f(s.share).padStart(6)} ${f(s.p50_ms).padStart(7)} ${f(s.p95_ms).padStart(7)} ${f(s.usd_per_turn).padStart(8)} ${f(s.judged).padStart(6)} ${`${f(s.score)}/${s.n_scored ?? 0}`.padStart(8)} ${f(s.weak_pct).padStart(6)}  ${s.top_defects.map((d) => `${d.class}×${d.n}`).join(' ')}`).join('\n') + '\n', r));
}
else if (cmd === 'anis-branches' && name) {   // one strategy's branches (ordered node:edge paths) with share and quality
  const j = await call('GET', `/anis/strategies/${encodeURIComponent(name)}/branches?days=${val('--days') || 7}`);
  const f = (x, d = '–') => (x == null ? d : String(x));
  if (flag('--json')) await out(j);
  else await new Promise((r) => process.stdout.write(`BRANCHES of ${j.strategy} · last ${j.days} days\n`
    + j.branches.map((b) => `${b.hash}  ${f(b.turns).padStart(5)} turns  share ${f(b.share)}  p50 ${f(b.p50_ms)} ms  p95 ${f(b.p95_ms)} ms  score ${f(b.score)} (${b.n_scored ?? 0} scored, ${b.judged} judged, weak ${f(b.weak_pct)}%)\n    ${b.branch.join(' → ')}`).join('\n') + '\n', r));
}
else if (cmd === 'anis-step-stats') {   // every step@version: runs, latency, edge mix; decision steps: Jev accuracy against the bank's gold
  const j = await call('GET', `/anis/steps/stats?days=${val('--days') || 7}`);
  const f = (x, d = '–') => (x == null ? d : String(x));
  if (flag('--json')) await out(j);
  else await new Promise((r) => process.stdout.write(`ANÍS STEP STATS · last ${j.days} days\n${'step@v'.padEnd(30)} ${'runs'.padStart(6)} ${'p50'.padStart(8)} ${'p95'.padStart(8)} ${'$'.padStart(7)} ${'err'.padStart(4)}  edges${' '.repeat(30)}jev acc\n`
    + j.steps.map((s) => `${s.key.padEnd(30)} ${f(s.runs).padStart(6)} ${f(s.p50_ms).padStart(8)} ${f(s.p95_ms).padStart(8)} ${f(s.usd).padStart(7)} ${f(s.errors).padStart(4)}  ${Object.entries(s.edges).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e}=${n}`).join(' ').padEnd(34)} ${s.jev ? `${f(s.jev.accuracy)} (${s.jev.labelled}/${s.jev.calls})` : ''}`).join('\n') + '\n', r));
}
else if (cmd === 'jev-gates') {   // every Jev decision gate: calls, answer mix, gold coverage/accuracy, shadow agreement, $ of a 200-call experiment
  const j = await call('GET', `/jev/gates?days=${val('--days') || 7}`);
  if (flag('--json')) await out(j);
  else await new Promise((r) => process.stdout.write(`JEV GATES · last ${j.days} days\n${'gate'.padEnd(24)} ${'calls'.padStart(7)} ${'tok'.padStart(6)} ${'ms'.padStart(5)} ${'gold'.padStart(5)} ${'acc'.padStart(5)}  $200-try  answers\n${j.gates.map((g) => `${g.task.padEnd(24)} ${String(g.calls).padStart(7)} ${String(g.avg_tokens).padStart(6)} ${String(g.avg_ms).padStart(5)} ${String(g.gold).padStart(5)} ${String(g.accuracy ?? '–').padStart(5)}  $${String(g.cost_200_usd).padEnd(7)} `
      + Object.entries(g.answers).map(([q, d]) => `${q}: ${Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${c}=${n}`).join(' ')}`).join(' | ')).join('\n')}\n`, r));
} else if (cmd === 'jev-bank' && name) {   // one gate's decisions with their context: jev-bank <gate> [--chosen X] [--q question] [--wrong|--right|--unlabelled] [--since 7d] [--limit n] [--state] [--json]
  const qs = new URLSearchParams(Object.entries({ task: name, chosen: val('--chosen'), q: val('--q'), since: val('--since'), ref: val('--ref'), limit: val('--limit') || 30,
    gold: flag('--wrong') ? 'wrong' : flag('--right') ? 'right' : flag('--unlabelled') ? 'none' : flag('--labelled') ? 'any' : undefined }).filter(([, v]) => v != null && v !== ''));
  const j = await call('GET', `/jev/calls?${qs}`);
  if (flag('--json')) await out(j);
  else await new Promise((r) => process.stdout.write(`${j.calls.map((c) => `#${c.id} ${new Date(c.at).toISOString().slice(0, 16)} ${c.ref || '-'}  chose ${JSON.stringify(c.chosen)}${c.gold ? `  GOLD ${JSON.stringify(c.gold)} (${c.gold_basis})${c.correct === false ? '  WRONG' : ''}` : ''}${c.question ? `\n    asked: ${c.question}` : ''}${flag('--state') ? `\n    state: ${String(c.state).slice(0, 1500)}` : ''}`).join('\n') || '(none)'}\n${j.count} call(s)\n`, r));
} else if (cmd === 'jev-label' && name) {   // jev-label <call_id> <answer> [--q question] [--basis note]
  await out(await call('POST', '/jev/label', { id: Number(name), answer: process.argv[4], q: val('--q'), basis: val('--basis') || 'manual' }));
} else if (cmd === 'jev-try' && name && process.argv[4] && !process.argv[4].startsWith('--')) {   // jev-try <gate> <variant> [--n 200] [--params '{json}'] [--chosen X] [--stored] [--since 30d] [--any] [--max-usd 2]
  const variant = val('--params') ? { id: process.argv[4], params: JSON.parse(val('--params')) } : process.argv[4];
  let job = await call('POST', '/jev/experiment', { task: name, variant, n: Number(val('--n')) || 200, baseline: flag('--stored') ? 'stored' : 'rerun', maxUsd: Number(val('--max-usd')) || 2,
    sample: { filter: { ...(val('--chosen') ? { chosen: val('--chosen') } : {}), ...(val('--q') ? { q: val('--q') } : {}), ...(val('--since') ? { since: val('--since') } : {}), ...(flag('--any') ? { gold: 'any' } : {}) } } });
  console.error(`experiment ${job.key} ${job.status}`);
  const deadline = Date.now() + 30 * 60_000;
  while (job.status === 'running' && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 5000)); job = await call('GET', `/jev/experiment/${job.key}`); }
  const x = job.result;
  if (flag('--json') || !x) await out(job);
  else await new Promise((r) => process.stdout.write(`${x.task} · ${x.variant.id} ${JSON.stringify(x.variant.params)} · sampled ${x.sampled}, done ${x.done}, errors ${x.errors}, skipped ${x.skipped}${x.truncated ? `, TRUNCATED (${x.truncated})` : ''}\n`
    + `accuracy vs gold (${x.labelled} labelled): baseline ${x.accuracy.baseline} → variant ${x.accuracy.variant}  (Δ ${x.accuracy.delta})  fixed ${x.fixed}, broken ${x.broken}\n`
    + `changed ${x.changed}: ${Object.entries(x.flips).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ×${n}`).join(' · ') || '–'}\n`
    + `tokens ${x.avg_tokens.baseline} → ${x.avg_tokens.variant} · ms ${x.avg_ms.baseline} → ${x.avg_ms.variant} · $${x.usd}\n`, r));
}
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
  else if (sub === 'health-history') await out(await call('GET', `/ops/media/health-history?machine=${encodeURIComponent(pos[0] || '')}&from=${encodeURIComponent(val('--from') || '')}&to=${encodeURIComponent(val('--to') || '')}&limit=${val('--limit') || ''}`));
  else if (sub === 'log') await out(await call('GET', `/ops/media/log?since=${encodeURIComponent(val('--since') || '')}&kind=${encodeURIComponent(val('--kind') || '')}&limit=${val('--limit') || ''}`));   // the lane event log (11-03): --since 6h|ISO --kind rent,rent_refused,move_pass,…
  else if (sub === 'gauges') await out(await call('GET', `/ops/media/gauges?hours=${val('--hours') || 6}&host=${encodeURIComponent(val('--host') || '')}&rows=${flag('--rows') ? 1 : 0}`));
  else if (sub === 'status' && pos[0]) await out(await call('GET', `/ops/media/items/${encodeURIComponent(pos.join(' '))}`));
  else if (sub === 'stage' && pos[0]) await out(await call('GET', `/ops/media/items?stage=${encodeURIComponent(pos[0])}&status=${val('--status') || 'done'}&missing=${flag('--missing') ? 1 : 0}&after=${val('--after') || 0}&limit=${val('--limit') || 50}`));
  else if (sub === 'add' && pos.length) await out(await call('POST', '/ops/media/items', { urls: pos.filter((x) => /^https?:/.test(x)), paths: pos.filter((x) => x.startsWith('/')) }));
  else if (sub === 'redo' && pos[1]) await out(await call('POST', `/ops/media/items/${pos[0]}/redo`, { stages: pos.slice(1) }));
  else if (sub === 'promote-image' && pos[0]) {   // --home aorus=tag,boss=tag  --quiet aorus,boss
    const kv = (v) => v ? Object.fromEntries(v.split(',').map((x) => x.split('='))) : undefined;
    await out(await call('POST', '/ops/media/worker-image', { image: pos[0], evidence: val('--evidence'), home_image: kv(val('--home')), quiet_hosts: val('--quiet')?.split(',') }));
  }
  else if (sub === 'stages') await out(await call('GET', '/ops/media/stages'));   // the stage registry (api/lib/media/stages.js)
  else if (sub === 'rerun' && pos[0]) await out(await call('POST', '/ops/media/rerun', { stage: pos[0], where: val('--where') || 'fp!=current', mode: flag('--full') ? 'full' : flag('--canary') ? 'canary' : 'dry', ...(val('--limit') ? { limit: Number(val('--limit')) } : {}) }));   // default --dry-run
  else if (sub === 'held') await out(await call('GET', '/ops/media/held'));   // held remasters (Chad 10-31): counts + reasons; page: /admin/media-held
  else if (sub === 'rejudge') await out(await call('POST', '/ops/media/rejudge', { ids: pos, force: flag('--force') }));   // judge held remasters now (no ids = the paced pass already runs)
  else if (!sub || sub === 'health') await out(await call('GET', '/ops/media/health'));   // loop sections (beats vs own cadence) + progress checks + self-heals
  else if (sub === 'pods') await out({ ...await call('GET', '/ops/media/pod-plan'), health: await call('GET', '/ops/media/health').catch((e) => ({ error: e.message })) });   // R_prep/R_finish/R_pod, supportable, target, binding, R2 buffer, refusals, $/audio-h
  else if (sub === 'queue') await out(await call('GET', `/ops/media/lan-queue?key=${flag('--key') ? 1 : 0}`));   // tower's LAN queue; --key prints the machines' MEDIA_QUEUE_KEY
  else if (sub === 'rentals') await out(await call('POST', '/ops/media/rentals', { ...(flag('--resume') ? { pause: false } : val('--pause') ? { pause: val('--pause') } : {}), ...(val('--max-pods') ? { maxPods: Number(val('--max-pods')) } : {}) }));
  else if (sub === 'off-air-published') await out(await call('POST', '/ops/media/off-air-published', {}));   // clear published_at on every talk off the air → { cleared, ids }
  else if (sub === 'cpu-pod') await out(await call('POST', '/ops/media/cpu-pod', { vcpu: Number(val('--vcpu')) || 32, flavor: val('--flavor') || 'cpu5c' }));   // rent ONE CPU pod by hand (prep/finish overflow; ends itself when idle)
  else { console.error('usage: ops.mjs media [health] | pods | off-air-published | cpu-pod [--vcpu 32] [--flavor cpu5c] | stages | rerun <stage> [--where fp!=current|tool=X|fp=…|all] [--dry-run|--canary|--full] [--limit n] | held | rejudge [id…] [--force] | queue [--key] | rentals [--pause "why" | --resume] [--max-pods n] | promote-image <ghcr…@sha256> --evidence "…" [--home h=tag,…] [--quiet h,…] | progress | gauges [--host h --hours n --rows] | health-history <machine> [--from ISO --to ISO --limit n] | status <ref> | stage <stage> [--missing] | add <url|path>… | redo <id> <stage>…'); process.exit(2); }
} else { console.error('usage: ops.mjs run <id> | failures [--hours N] | dewey-allow | bio-slugs | ops.mjs reports | report <name> [--days N] [--wait] [--latest]'); process.exit(2); }
process.exit(0);

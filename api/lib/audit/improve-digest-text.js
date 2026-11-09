// improve-digest-text — the daily digest (improve.js improveDigest JSON) as text for Claude Code (`ops.mjs anis-improve-digest`).
// CODE items print as acceptance scenarios (Given/When/Then + checks); rows from before scenarios print their change. Pure.

/** One scenario → indented lines: title, Given/When/Then, examples, checks. */
export function scenarioLines(s, pad = '    ') {
  const L = [`${pad}SCENARIO ${s.title}`, `${pad}  Given ${s.given.reader}`];
  for (const h of s.given.history || []) L.push(`${pad}    and earlier: ${h}`);
  L.push(`${pad}  When ${s.when.asks}`, ...(s.when.examples || []).map((e) => `${pad}    e.g. "${e}"`));
  s.then.forEach((c, i) => L.push(`${pad}  ${i ? ' And' : 'Then'} ${c.check}: ${c.expect}`));
  return L;
}

export function digestText(j) {
  const a = j.assessment || {};
  const L = [`ANÍS IMPROVEMENT DIGEST · since ${j.since}${j.available ? '' : ' · (no improve store)'}`,
    `assessment: judged ${a.judged} · weak ${a.weak} (${a.weak_pct ?? '–'}%) · mean severity ${a.mean_severity ?? '–'} (weak verdicts, 1-3) · $${a.spend_usd}${a.cap_usd != null ? ` · today $${a.spent_today_usd} of $${a.cap_usd} cap` : ''}`,
    `  by stage: ${Object.entries(a.by_stage || {}).map(([k, n]) => `${k} ${n}`).join(' · ') || '–'}`,
    `  top classes: ${(a.top_classes || []).map((c) => `${c.class} ${c.n}`).join(' · ') || '–'}`,
    '', `CODE behaviours, new or grown (${(j.code || []).length}):`];
  for (const c of j.code || []) {
    L.push(`#${c.id} ${c.new ? 'NEW' : `+${c.evidence_new}`} [${c.status}] ${c.target} · ${c.stage} · ${c.file || '?'}${c.fn ? ` ${c.fn}` : ''} · evidence ${c.evidence_n} × sev ${c.severity}`);
    if (c.scenarios?.length) { L.push(`    proposal: ${c.change}`); for (const s of c.scenarios) L.push(...scenarioLines(s)); }
    else L.push(`    ${c.change}`, ...(c.expected_effect ? [`    → ${c.expected_effect}`] : []));
    L.push(...(c.examples || []).map((e) => `    evidence ${e.turn_id || e.item_key}  ${e.trace || ''}`));
  }
  const m = j.jev_misses;
  if (m) {
    L.push('', `JEV MISSES (${m.gate}) — a miss = Haiku found the strategy Jev missed; each is gold-labelled, diagnosed and fixed in the background:`,
      `  misses ${m.misses} in ${m.calls} calls (${m.rate ?? '–'} per 100; previous period ${m.prev_rate ?? '–'}) · trend ${m.trend ?? '–'}${m.defect ? ' · DEFECT: the miss rate is not falling' : ''}`,
      `  fixes tried ${m.fixes_tried} · promoted ${m.promoted} · rejected/dropped ${m.rejected}${Object.keys(m.by_gold || {}).length ? ` · missed strategies: ${Object.entries(m.by_gold).map(([k, n]) => `${k} ${n}`).join(', ')}` : ''}`,
      ...(m.fixes || []).map((f) => `  ${f.status} ${f.gold} (${f.misses} miss(es))${f.strategies?.length ? ` ${f.strategies.join(', ')}` : ''}${f.why ? ` — ${f.why}` : ''}${f.failed?.length ? ` [${f.failed.join('; ')}]` : ''}`));
  }
  L.push('', `DATA changes — the system tests and settles these itself (${(j.data || []).length}):`,
    ...(j.data || []).map((x) => `#${x.id} ${x.state} [${x.status}] ${x.target} · ${x.stage} · evidence ${x.evidence_n} — ${x.change}${x.status_note ? ` (${x.status_note})` : ''}`));
  const props = j.proposals || [];
  L.push('', `PROPOSED TOOL IMPROVEMENTS — waiting, with acceptance scenarios (${props.length}):`);
  for (const p of props) {
    L.push(`#${p.id} [${p.status}] ${p.target} · ${p.file || '?'}${p.fn ? ` ${p.fn}` : ''} · behaviour: ${p.run}${p.run_at ? ` (${p.run_at})` : ''}${p.stale ? ' · POSSIBLY STALE: its scenarios already pass' : ''}`,
      `    ${p.change}`);
    for (const s of p.scenarios) L.push(...scenarioLines(s));
  }
  if (j.tools) {
    const t = j.tools;
    L.push('', `TOOLS wishlist (loop TOOLS) - elements the planner wished for, most wanted first (${t.wishlist?.length || 0}); catalog ${t.catalog?.version || '?'}${t.catalog?.queued?.length ? `, re-plans queued for ${t.catalog.queued.join(', ')}` : ''}:`);
    if (t.gherkin) L.push(...t.gherkin.split('\n').map((x) => `  ${x}`));
    for (const r of t.repeat_plans || []) L.push(`  DEFECT: type ${r.type_key} was planned ${r.plans} times (the first plan should have matched)`);
    for (const p of t.probations || []) L.push(`  probation ${p.id}@${p.version}: ${p.runs}/${p.need} runs, mean ${p.mean == null ? 'n/a' : p.mean.toFixed(1)}${p.baseline != null ? ` (baseline ${p.baseline})` : ''}`);
  }
  L.push('', ...WORKFLOW);
  return L.join('\n');
}

/** The test-first loop for a CODE proposal (also tests/behavior/README.md). */
export const WORKFLOW = [
  'Workflow for a CODE proposal (tests/behavior/README.md):',
  '  1. node scripts/ops/ops.mjs anis-improve-scenarios <id> --write      → tests/behavior/proposed/<id>.json',
  '  2. node tests/behavior/run.mjs --proposed <id>                       → should FAIL (if it passes, the proposal may be stale)',
  '  3. implement the change',
  '  4. node tests/behavior/run.mjs --all                                 → the proposal passes, the suite still passes',
  '  5. git mv tests/behavior/proposed/<id>.json tests/behavior/scenarios/; commit',
  '  6. node scripts/ops/ops.mjs anis-improve-status <id> done --note "<commit>"   (or rejected --note "<reason>")',
];

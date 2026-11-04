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
  L.push('', `DATA changes — the system tests and settles these itself (${(j.data || []).length}):`,
    ...(j.data || []).map((x) => `#${x.id} ${x.state} [${x.status}] ${x.target} · ${x.stage} · evidence ${x.evidence_n} — ${x.change}${x.status_note ? ` (${x.status_note})` : ''}`));
  L.push('', 'Act on CODE items: node scripts/ops/ops.mjs anis-improve-status <id> <done|rejected> --note "<commit or reason>"');
  return L.join('\n');
}

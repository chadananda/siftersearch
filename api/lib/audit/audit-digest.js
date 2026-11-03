// Strategy-audit digest, pure (scripts/audit/audit-digest.mjs reads the rows). Verdict rows → the lines Chad reads: exchanges,
// spend, strategy right/wrong, evidence answered, every mistake grouped by WHERE it lies (library data = a work list),
// suggested strategies, data gaps → a maintenance section for the weekly email (api/lib/ops/maintenance.js).
import { markdownHtml } from '../mail-render.js';

const WHERE = { 'library-data': 'In our library data (work list)', 'source-text': 'In published sources', 'reader-premise': "In readers' premises", reply: "In Anís's replies" };
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); if (k != null) m[k] = (m[k] || 0) + 1; return m; }, {});
const top = (m, n = 8) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
const span = (hours) => (hours % 24 === 0 && hours >= 48 ? `${hours / 24} days` : `${hours} h`);

/** @param rows audits rows ({status, usd, verdict_json, session_id, round, channel}) @returns {{ lines, text, markdown, stats, section }} */
export function buildAuditDigest(rows, { hours = 168, now = new Date() } = {}) {
  const done = rows.filter((r) => r.status === 'done').map((r) => ({ ...r, v: JSON.parse(r.verdict_json) }));
  const errors = rows.length - done.length;
  const usd = rows.reduce((s, r) => s + (r.usd || 0), 0);
  const strat = count(done, (r) => r.v.strategy_verdict);
  const misroutes = count(done.filter((r) => r.v.strategy_verdict === 'wrong' || r.v.best_strategy !== r.v.strategy_used), (r) => `${r.v.strategy_used} → ${r.v.best_strategy}`);
  const answered = count(done, (r) => r.v.evidence?.answered);
  const causes = count(done.filter((r) => r.v.evidence?.answered !== 'fully' && r.v.evidence?.cause !== 'none'), (r) => r.v.evidence?.cause);
  const formatWrong = done.filter((r) => r.v.format_verdict?.fit === 'wrong').length;
  const problems = done.flatMap((r) => (r.v.problems || []).map((p) => ({ ...p, session: r.session_id, round: r.round })));
  const byWhere = {}; for (const p of problems) (byWhere[p.where] ||= []).push(p);
  const newStrats = done.filter((r) => r.v.new_strategy?.suggested).map((r) => ({ need: r.v.new_strategy.need, route: r.v.new_strategy.route }));
  const gaps = done.filter((r) => r.v.data_gap?.found).map((r) => r.v.data_gap.detail);
  const feedback = done.filter((r) => r.v.reader_feedback?.present).map((r) => ({ ...r.v.reader_feedback, channel: r.channel }));

  const lines = [
    `Anís strategy audit — last ${span(hours)}`,
    `${done.length} exchanges audited${errors ? `, ${errors} errors` : ''} · $${usd.toFixed(2)} spent`,
    'Passages the auditor names as "missed" come from its own knowledge: leads to check, not facts.',
    '',
    ...(feedback.length ? [`Reader feedback (${feedback.length}) — the strongest signal:`, ...feedback.map((f) => `  • [${f.justified || '?'} · ${f.about || '?'} · ${f.channel || '?'}] ${f.summary || ''}${f.fix && f.fix !== 'none' ? `\n      fix: ${f.fix}` : ''}`), ''] : []),
    `Strategy: right ${strat.right || 0} · acceptable ${strat.acceptable || 0} · wrong ${strat.wrong || 0}`,
    ...(Object.keys(misroutes).length ? ['Better strategy existed (used → best):', ...top(misroutes).map(([k, n]) => `  ${k}  ×${n}`)] : []),
    `Evidence answered: fully ${pct(answered.fully || 0, done.length)} · partly ${pct(answered.partly || 0, done.length)} · no ${pct(answered.no || 0, done.length)}`,
    ...(Object.keys(causes).length ? [`  why not fully: ${top(causes).map(([k, n]) => `${k} ×${n}`).join(' · ')}`] : []),
    `Format wrong: ${formatWrong}`,
    '',
    `Mistakes found: ${problems.length}`,
    ...Object.entries(WHERE).flatMap(([k, label]) => (byWhere[k]?.length ? [`${label} (${byWhere[k].length}):`, ...byWhere[k].slice(0, 15).map((p) => `  • [${p.kind}] ${p.detail}`)] : [])),
    '',
    ...(newStrats.length ? [`Suggested new strategies (${newStrats.length}):`, ...newStrats.slice(0, 10).map((s) => `  • ${s.need}${s.route ? ` — ${s.route}` : ''}`)] : ['Suggested new strategies: none']),
    ...(gaps.length ? ['', `Library gaps (${gaps.length}):`, ...gaps.slice(0, 15).map((g) => `  • ${g}`)] : []),
  ];
  const text = lines.join('\n');
  // Markdown: section lines bold, "  •" items a list
  const markdown = lines.map((l) => (/^\s+•\s/.test(l) ? l.replace(/^\s+•\s+(?:\[([^\]]+)\]\s*)?/, (m, k) => `- ${k ? `**${k}** ` : ''}`)
    : /^\s{4,}\S/.test(l) ? `  ${l.trim()}` : /^\s{2}\S/.test(l) ? `- ${l.trim()}` : /:$/.test(l) || /^Anís strategy audit/.test(l) ? `**${l}**` : l))
    .join('\n').replace(/([^\n])\n(?!- |  |\n)/g, '$1  \n');
  const stats = { exchanges: done.length, errors, usd, wrong: strat.wrong || 0, mistakes: problems.length, feedback: feedback.length, library: byWhere['library-data']?.length || 0 };

  // the weekly section: library-data mistakes are the work list (backlog), the rest notes
  const items = [
    ...(byWhere['library-data'] || []).map((p) => ({ kind: 'backlog', text: `[${p.kind}] ${p.detail}` })),
    ...feedback.map((f) => ({ kind: 'note', text: `Reader feedback (${f.channel || '?'}): ${f.summary || ''}` })),
    ...newStrats.map((s) => ({ kind: 'note', text: `Suggested strategy: ${s.need}${s.route ? ` — ${s.route}` : ''}` })),
    ...gaps.map((g) => ({ kind: 'backlog', text: `Library gap: ${g}` })),
  ];
  if (!items.length && done.length) items.push({ kind: 'note', text: `${done.length} exchanges audited, nothing to act on` });
  const summary = `${stats.exchanges} exchanges · ${stats.wrong} misroutes · ${stats.mistakes} mistakes (${stats.library} in library data) · $${usd.toFixed(2)}`;
  const title = `Anís strategy audit — last ${span(hours)}`;
  const section = { source: 'audit-digest', generated: new Date(now).toISOString(), title, summary, items,
    html: done.length || errors ? `<h2 style="font-size:18px;margin:22px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px">${title}</h2>${markdownHtml(markdown.split('\n').slice(1).join('\n'), { breaks: true })}` : '' };
  return { lines, text, markdown, stats, section };
}

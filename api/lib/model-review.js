// Model re-assessment (Chad 10-11, 11-03: "every couple of weeks … I should be informed of a choice of model change"). Pure:
// roles × registry (× spend) → flags; an eval report → switch/keep/inconclusive; all of it → ONE maintenance section (generic
// shape { source, generated, title, summary, items, html } gathered by the weekly maintenance email). Nothing switches here.
const blended = (p) => (p ? (p.input || 0) + 3 * (p.output || 0) : Infinity);   // ~1:3 in:out, typical of these calls
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r2 = (x, d = 2) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const DIMS = ['accuracy', 'completeness', 'brevity', 'format_fit'];

export function reviewRoles(roles, registry, { now = new Date(), maxAgeDays = 31, spend = [] } = {}) {
  const usd = new Map(spend.map((s) => [s.model, s]));
  return Object.entries(roles).map(([role, r]) => {
    const cur = registry[r.model];
    const flags = [];
    if (!cur && r.provider !== 'systemone') flags.push('model not in registry');
    if (cur?.deprecated) flags.push('model deprecated');
    const age = Math.floor((now - new Date(r.reviewed)) / 86_400_000);
    if (age > maxAgeDays) flags.push(`review ${age} days old`);
    const candidates = cur ? Object.entries(registry)
      .filter(([id, m]) => id !== r.model && !m.deprecated && m.type === cur.type && m.released && (!cur.released || m.released > cur.released)
        && m.released > r.reviewed && blended(m.pricing) <= blended(cur.pricing))   // a model out before the last review was part of that choice
      .map(([id, m]) => ({ id, price: m.pricing, released: m.released })) : [];
    if (candidates.length) flags.push(`newer & cheaper: ${candidates.map((c) => c.id).join(', ')}`);
    return { role, provider: r.provider, model: r.model, reviewed: r.reviewed, eval: r.eval || null, age_days: age, spend_30d: usd.get(r.model) || null, flags, candidates };
  });
}

// ---- declared evals: role.eval names one; the harness measures the role's model against the registry's light candidates
export const EVALS = {
  'anis-writer-ab': { script: 'tests/quality/anis-writer-ab.mjs',
    args: (role, r, { sample = 20, tag }) => ['--compare', 'writer', '--role', role, '--sample', String(sample), ...(r.evalMode ? ['--mode', r.evalMode] : []), ...(tag ? ['--tag', tag] : [])] },
};
/** "estimate: $0.32/question (…) → ~$6.47 total" (the harness's --dry line) → 6.47, or null */
export const parseDryEstimate = (out) => { const m = String(out || '').match(/~\$([\d.]+)\s+total/); return m ? Number(m[1]) : null; };
/** measurement is due when the last one is `everyDays` old or more (weekly run, measures every 2 weeks) */
export const measureDue = (lastMeasured, now = new Date(), everyDays = 13) => !lastMeasured || (now - new Date(lastMeasured)) / 86_400_000 >= everyDays;

/** anis-writer-ab report JSON → { current, candidates[] } on the same axes (quality = mean of the 4 judged dimensions) */
export function summarizeEval(report) {
  const S = report.summary || {}, base = S.variants?.base || {};
  const refs = (S.pairs || []).filter((p) => p.n);
  const refDim = (d) => r2(mean(refs.map((p) => p.reference_scores?.[d]).filter((x) => x != null)));
  const current = { writer: report.baseline, quality: r2(mean(DIMS.map(refDim).filter((x) => x != null))), brevity: refDim('brevity'), completeness: refDim('completeness'),
    ms_median: base.ms_median ?? null, usd_mean: base.usd_mean ?? null };
  const candidates = (S.ranking || []).map((x) => ({ writer: x.writer, quality: x.quality, quality_vs_base: x.quality_vs_base, win: x.win, tie: x.tie, loss: x.loss,
    n: (x.win || 0) + (x.tie || 0) + (x.loss || 0), brevity: x.brevity, completeness: x.completeness, ms_median: x.ms_median, usd_mean: x.usd_mean }));
  return { role: report.role, date: report.date, judged: S.judged ?? 0, questions: S.n ?? 0, spend_usd: r2((report.spend?.anis || 0) + (report.spend?.judge || 0)), current, candidates };
}

// Switch only with no quality loss beyond judge noise AND cheaper or faster. NOISE: the mean of four 1–5 scores moves ~0.25
// between repeat judgings of the same pair; MIN_N judged questions before any verdict.
export const NOISE = 0.25, MIN_N = 10;
export function recommend(ev, { noise = NOISE, minN = MIN_N } = {}) {
  const c = ev.current;
  const cands = ev.candidates.filter((x) => x.n);
  if (!cands.length || Math.max(...cands.map((x) => x.n)) < minN) return { verdict: 'inconclusive', candidate: cands[0] || null, reason: `only ${Math.max(0, ...cands.map((x) => x.n))} questions judged (need ${minN})` };
  const cheaper = (x) => x.usd_mean != null && c.usd_mean != null && x.usd_mean < c.usd_mean * 0.9;
  const faster = (x) => x.ms_median != null && c.ms_median != null && x.ms_median < c.ms_median * 0.9;
  const holds = (x) => x.n >= minN && (x.quality_vs_base ?? -Infinity) >= -noise && x.loss <= x.win + x.tie;
  const ok = cands.filter((x) => holds(x) && (cheaper(x) || faster(x))).sort((a, b) => (a.usd_mean ?? Infinity) - (b.usd_mean ?? Infinity) || (a.ms_median ?? Infinity) - (b.ms_median ?? Infinity));
  if (ok.length) {
    const x = ok[0], gains = [cheaper(x) && `${Math.round((1 - x.usd_mean / c.usd_mean) * 100)}% cheaper`, faster(x) && `${Math.round((1 - x.ms_median / c.ms_median) * 100)}% faster`].filter(Boolean);
    return { verdict: 'switch', candidate: x, reason: `${x.writer}: quality ${sign(x.quality_vs_base)} vs current (within ±${noise}), ${x.win}/${x.tie}/${x.loss} W/T/L, ${gains.join(' and ')}` };
  }
  const best = [...cands].sort((a, b) => (b.quality_vs_base ?? -Infinity) - (a.quality_vs_base ?? -Infinity))[0];
  if (cands.some((x) => holds(x))) return { verdict: 'keep', candidate: best, reason: `the candidates that hold quality are neither cheaper nor faster (best ${best.writer} ${sign(best.quality_vs_base)})` };
  return { verdict: 'keep', candidate: best, reason: `every candidate loses quality: best ${best.writer} ${sign(best.quality_vs_base)} vs current, ${best.win}/${best.tie}/${best.loss} W/T/L` };
}
const sign = (x) => (x == null ? '–' : `${x >= 0 ? '+' : ''}${x}`);
const envKey = (role) => `MODEL_ROLE_${role.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

/** the exact one-line edit for api/lib/model-roles.js (a keep only re-dates the review) */
export function changeLine(role, verdict, writer, today) {
  if (verdict === 'switch' && writer) {
    const [provider, model] = writer.split(':');
    return `api/lib/model-roles.js '${role}': provider: '${provider}', model: '${model}', reviewed: '${today}' (try it first without a deploy: ${envKey(role)}=${provider}:${model})`;
  }
  if (verdict === 'keep') return `api/lib/model-roles.js '${role}': reviewed: '${today}'`;
  return null;
}

/** models used by a role whose registry price carries no priceChecked date — the prices are hand-typed */
export function priceStaleness(roles, registry) {
  const used = [...new Set(Object.values(roles).filter((r) => r.provider !== 'systemone').map((r) => r.model))].sort();
  return used.map((id) => ({ model: id, checked: registry[id]?.priceChecked || null, known: !!registry[id] })).filter((x) => !x.checked);
}

// ---- the maintenance section
const fmtUsd = (x) => (x == null ? '–' : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`);
function evalTable(ev, rec) {
  const c = ev.current, show = [c, ...(rec.candidate ? [rec.candidate] : [])];
  const row = (x, isCur) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #ddd">${esc(x.writer)}${isCur ? ' <i>(current)</i>' : ''}</td>`
    + [x.quality, isCur ? '–' : `${x.win}/${x.tie}/${x.loss}`, x.brevity, x.completeness, x.ms_median == null ? '–' : `${(x.ms_median / 1000).toFixed(1)} s`, fmtUsd(x.usd_mean)]
      .map((v) => `<td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">${esc(v ?? '–')}</td>`).join('') + '</tr>';
  const th = ['model', 'quality (1–5)', 'W/T/L vs current', 'brevity', 'completeness', 'median time', '$ / answer']
    .map((h, i) => `<th style="padding:4px 8px;border-bottom:2px solid #999;text-align:${i ? 'right' : 'left'}">${h}</th>`).join('');
  return `<table style="border-collapse:collapse;font-size:13px;margin:6px 0"><tr>${th}</tr>${show.map((x, i) => row(x, i === 0)).join('')}</table>`;
}

/**
 * @param {object} o  rows (reviewRoles), evals ([{ ev: summarizeEval, measured_at }]), skipped ([{ role, reason }]), roles, registry, now, lastMeasured, spendDays
 * @returns maintenance section; items = [] means nothing to report (the weekly email leaves it out)
 */
export function buildSection({ rows, evals = [], skipped = [], roles, registry, now = new Date(), lastMeasured = null, spendNote = null }) {
  const today = now.toISOString().slice(0, 10), items = [];
  for (const { ev, measured_at } of evals) {
    const rec = recommend(ev), r = roles[ev.role];
    items.push({ kind: 'choice', role: ev.role, measured_at, recommendation: rec.verdict, change: changeLine(ev.role, rec.verdict, rec.candidate?.writer, today),
      text: `${ev.role}: current ${ev.current.writer}${rec.candidate ? ` vs best candidate ${rec.candidate.writer}` : ''} — ${rec.reason} (${ev.judged}/${ev.questions} questions judged, eval cost $${ev.spend_usd ?? '?'}, measured ${measured_at})`,
      table: { current: ev.current, candidate: rec.candidate }, why: r?.why || null });
  }
  for (const s of skipped) items.push({ kind: 'backlog', role: s.role, recommendation: null, change: null, text: `${s.role}: flagged but not measured this run — ${s.reason}` });
  const measuredRoles = new Set([...evals.map((e) => e.ev.role), ...skipped.map((s) => s.role)]);
  const actionable = (f) => !/^review \d+ days old$/.test(f);
  for (const row of rows.filter((x) => x.flags.some(actionable) && !x.eval && !measuredRoles.has(x.role)))
    items.push({ kind: 'backlog', role: row.role, recommendation: null, change: null, text: `${row.role} (${row.provider}:${row.model}): ${row.flags.filter(actionable).join('; ')} — flagged, no eval yet, can't be measured` });
  const stale = rows.filter((x) => x.flags.length && x.flags.every((f) => !actionable(f)) && !measuredRoles.has(x.role));
  if (stale.length) items.push({ kind: 'note', role: null, recommendation: null, change: null,
    text: `${stale.length} role(s) not re-measured in over a month, no newer or cheaper model in the registry: ${stale.map((x) => `${x.role} (${x.age_days} d)`).join(', ')}` });
  const prices = priceStaleness(roles, registry);
  if (items.length && prices.length) items.push({ kind: 'note', role: null, recommendation: null, change: null,
    text: `Prices never verified (hand-typed in api/lib/model-registry.js, no priceChecked date): ${prices.map((p) => p.model + (p.known ? '' : ' (not in registry)')).join(', ')} — the cheaper/newer flags above rest on them` });
  if (items.length && spendNote) items.push({ kind: 'note', role: null, recommendation: null, change: null, text: spendNote });
  const choices = items.filter((i) => i.kind === 'choice'), switches = choices.filter((i) => i.recommendation === 'switch').length;
  const backlog = items.filter((i) => i.kind === 'backlog').length;
  const summary = !items.length ? 'nothing to report'
    : [`${choices.length} role(s) measured${switches ? `, ${switches} switch recommended` : ''}`, backlog && `${backlog} flagged without a measurement`].filter(Boolean).join('; ');
  const section = { source: 'model-review', generated: now.toISOString(), title: switches ? `Model review: ${switches} change(s) to choose` : choices.length ? `Model review: ${choices.length} role(s) re-measured, no switch` : 'Model review',
    summary, items, data: { last_measured: lastMeasured } };
  section.html = items.length ? renderSection(section) : '';
  return section;
}

export function renderSection(s) {
  const P = (t) => `<p style="margin:6px 0">${t}</p>`;
  const choices = s.items.filter((i) => i.kind === 'choice'), backlog = s.items.filter((i) => i.kind === 'backlog'), notes = s.items.filter((i) => i.kind === 'note');
  const out = [`<h2 style="font-size:17px;margin:16px 0 4px">${esc(s.title)}</h2>`, P(`<span style="color:#666">${esc(s.summary)}. Nothing switches by itself — you choose.</span>`)];
  for (const c of choices) {
    const tag = { switch: '#1a7f37', keep: '#555', inconclusive: '#9a6700' }[c.recommendation] || '#555';
    out.push(`<h3 style="font-size:15px;margin:14px 0 2px">${esc(c.role)} — <span style="color:${tag}">${esc(c.recommendation)}</span></h3>`, P(esc(c.text)), evalTable({ current: c.table.current }, { candidate: c.table.candidate }));
    if (c.change) out.push(P(`Change: <code style="background:#f3f3f3;padding:1px 4px">${esc(c.change)}</code>`));
  }
  if (backlog.length) out.push(`<h3 style="font-size:15px;margin:14px 0 2px">Flagged, not measured</h3>`, `<ul style="margin:4px 0;padding-left:20px">${backlog.map((b) => `<li>${esc(b.text)}</li>`).join('')}</ul>`);
  if (notes.length) out.push(`<h3 style="font-size:15px;margin:14px 0 2px">Notes</h3>`, `<ul style="margin:4px 0;padding-left:20px">${notes.map((b) => `<li>${esc(b.text)}</li>`).join('')}</ul>`);
  return `<div class="maint-section" data-source="${esc(s.source)}">${out.join('\n')}</div>`;
}

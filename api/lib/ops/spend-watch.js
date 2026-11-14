// Spend watch (Chad 11-14: "notified if something is burning through API credits -- especially if not working").
// assessSpend is PURE (findings from window/baseline/caps); spendWatchReport reads the ledger via ai-usage-repo. Deps: spend-caps.
import { readFileSync } from 'fs';
import { callerWindow, callerHourlyBaseline, dailySpendByCaller } from '../repos/ai-usage-repo.js';
import { groupOf, capFor, dayOf } from '../spend-caps.js';

const EXEMPT = new Set(JSON.parse(readFileSync(new URL('../../../config/spend-caps.json', import.meta.url), 'utf8')).exempt || []);
export const T = { failUsd: 0.5, failShare: 0.3, loopCalls: 25, loopUsd: 0.5, spikeMinUsd: 2, spikeX: 4 };
const r2 = (n) => +Number(n).toFixed(2);

/** window: { w2: callerWindow(2), w1: callerWindow(1) }; baseline: callerHourlyBaseline(); spentToday: { group: usd } (UTC day). → findings[] */
export function assessSpend({ window, baseline = {}, spentToday = {}, now = Date.now(), capOf = capFor, groupFor = groupOf, exempt = EXEMPT }) {
  const out = [], name = (c) => c || '(no caller)';
  const lever = (c) => { const g = groupFor(c); return `caller ${name(c)} (cap group "${g}"): set SPEND_CAP_${g.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_USD=0 on tower, or pause the service that issues it`; };
  for (const w of window.w2 || []) {
    if (w.usd >= T.failUsd && w.calls && w.failures / w.calls >= T.failShare)
      out.push({ caller: w.caller, kind: 'failing', usd: r2(w.usd), rate_usd_h: r2(w.usd / 2), evidence: `${w.failures} of ${w.calls} calls failed in 2h ($${r2(w.usd)} paid)`, action: `Paying for errors — fix the cause. ${lever(w.caller)}` });
    if (w.max_doc_calls >= T.loopCalls && w.max_doc_usd >= T.loopUsd)
      out.push({ caller: w.caller, kind: 'loop', usd: r2(w.max_doc_usd), rate_usd_h: r2(w.max_doc_usd / 2), evidence: `document ${w.max_doc_id} hit ${w.max_doc_calls} times in 2h ($${r2(w.max_doc_usd)}) — the same work redone`, action: `Look for a retry loop on document ${w.max_doc_id}. ${lever(w.caller)}` });
  }
  const hourFrac = (now % 86_400_000) / 86_400_000, day = dayOf(now);
  for (const w of window.w1 || []) {
    const base = baseline[w.caller]?.median_usd_h || 0;
    if (w.usd >= Math.max(T.spikeMinUsd, T.spikeX * base))
      out.push({ caller: w.caller, kind: 'spike', usd: r2(w.usd), rate_usd_h: r2(w.usd), evidence: `$${r2(w.usd)} in the last hour (${w.calls} calls) vs typical $${r2(base)}/h`, action: `Runaway pace. ${lever(w.caller)}` });
    // the cap will stop it — informational: at this hour's rate the group passes its cap before the UTC day ends
    const g = groupFor(w.caller), cap = capOf(g, day), spent = spentToday[g] || 0;
    if (!exempt.has(w.caller) && Number.isFinite(cap) && cap > 0 && spent < cap) {
      const projected = spent + w.usd * (1 - hourFrac) * 24;
      if (projected > cap) out.push({ caller: w.caller, kind: 'cap-pace', usd: r2(w.usd), rate_usd_h: r2(w.usd), evidence: `group "${g}" at $${r2(spent)} today, $${r2(w.usd)}/h projects to $${r2(projected)} vs cap $${cap}`, action: `The cap will stop it; raise or slow it deliberately. ${lever(w.caller)}` });
    }
  }
  return out;
}

/** ops report: { as_of, window_hours, findings, totals } */
export async function spendWatchReport() {
  const [w2, w1, baseline, byCaller] = await Promise.all([callerWindow(2), callerWindow(1), callerHourlyBaseline(7), dailySpendByCaller()]);
  const spentToday = {};
  for (const [c, usd] of Object.entries(byCaller)) { const g = groupOf(c); spentToday[g] = (spentToday[g] || 0) + usd; }
  const findings = assessSpend({ window: { w2, w1 }, baseline, spentToday });
  const sum = (rows) => r2(rows.reduce((n, x) => n + (x.usd || 0), 0));
  // GPU pods: RunPod's live list (media/live-pods.js, the one source /media and the system-checks pod alert read). Shown here as
  // spend only — the pod alert already alarms idle pods, so no finding (one problem, one mail). Unknown stays unknown, never a guess.
  const { podSnapshot } = await import('../media/live-pods.js');
  const p = await podSnapshot();
  const gpu = { state: p.state, as_of: new Date(p.as_of).toISOString(), unknown_since: p.unknown_since ? new Date(p.unknown_since).toISOString() : null,
    usd_per_hr: p.usd_per_hr, pods: (p.pods || []).length, idle: (p.pods || []).filter((x) => (x.idle_min ?? 0) >= 15).map((x) => ({ name: x.name, idle_min: x.idle_min, cost_per_hr: x.cost_per_hr })) };
  return { as_of: new Date().toISOString(), window_hours: 2, findings, totals: { usd_1h: sum(w1), usd_2h: sum(w2), usd_today: r2(Object.values(byCaller).reduce((n, x) => n + x, 0)), gpu } };
}

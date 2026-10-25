// system-checks for the paid GPU pods (Chad 10-24: GPU spend must be proportional to work done). Pure: cloud_gpu = /ops/services .cloud_gpu.
// → [{ name, ok, detail }] — every finding is CRITICAL in system-checks.
export function podChecks(g, { minEfficiency = 0.7, capWarn = 0.8, idleMin = 10 } = {}) {
  if (!g) return [];
  const live = (g.pods || []).filter((p) => p.live);
  const out = [];
  // the lane itself (10-25: it was down 3.7 h with 261 talks queued and nothing noticed)
  const stale = (g.queue > 0 || g.in_flight > 0) && !g.money_stopped && (g.lane_updated_s ?? Infinity) > 600;
  out.push({ name: 'Cloud lane beat', ok: !stale, detail: stale ? `${g.queue} talks queued and the lane's last beat was ${Math.round((g.lane_updated_s || 0) / 60)} min ago` : g.money_stopped ? `paused by the money rule: ${g.money_stopped}` : 'ok' });
  out.push({ name: 'GPU rental breaker', ok: !g.breaker_until, detail: g.breaker_until ? `no pods rented until ${new Date(g.breaker_until).toISOString().slice(11, 16)}Z: ${g.breaker_reason} · $${g.wasted_usd} wasted on pods that never worked` : `$${g.wasted_usd || 0} wasted on pods that never worked`, });
  const laneDown = !g.running || (g.lane_updated_s ?? Infinity) > 600;
  out.push({ name: 'GPU pods without a lane', ok: !(live.length && laneDown),
    detail: live.length && laneDown ? `${live.length} pod(s) billing (${live.map((p) => p.name).join(', ')}) while the cloud lane is ${g.running ? `silent ${Math.round((g.lane_updated_s || 0) / 60)} min` : 'not running'}` : 'ok' });
  const idle = live.filter((p) => p.idle_min > idleMin);
  out.push({ name: 'GPU pods idle', ok: !idle.length, detail: idle.length ? idle.map((p) => `${p.name} idle ${p.idle_min} min ($${p.cost_per_hr}/h)`).join(' · ') : 'ok' });
  const lowEff = live.length > 0 && g.efficiency_30m != null && g.efficiency_30m < minEfficiency;
  out.push({ name: 'GPU efficiency 30 min', ok: !lowEff, detail: g.efficiency_30m == null ? 'not enough rented time yet' : `${Math.round(g.efficiency_30m * 100)} % of rented GPU time busy (floor ${Math.round(minEfficiency * 100)} %) · rented $${g.rented_usd} · productive $${g.productive_usd}` });
  const near = g.cap_usd > 0 && g.spent_usd >= capWarn * g.cap_usd;
  out.push({ name: 'GPU spend vs cap', ok: !near, detail: `$${g.spent_usd} of $${g.cap_usd}${near ? ` (≥ ${Math.round(capWarn * 100)} %)` : ''}` });
  return out;
}

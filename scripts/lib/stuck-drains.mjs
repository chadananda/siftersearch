// Services draining too long (10-22: dewey-scout #2819 held siftersearch-reports 'draining' 30+ min, claiming nothing): a
// drain should end once the job in hand yields. Since = the heartbeat's draining_since, else when a check first saw that
// pid draining (seen, kept in system-checks state). Pure. Used by scripts/system-checks.mjs.
export function stuckDrains(services = [], { now = Date.now(), limitMs = 10 * 60_000, seen = {} } = {}) {
  const nextSeen = {}, stuck = [];
  for (const s of services) {
    if (s.health !== 'draining' && s.state !== 'draining') continue;
    const key = `${s.name}:${s.pid}`;
    const since = Date.parse(s.draining_since || '') || seen[key] || now;
    nextSeen[key] = since;
    if (now - since > limitMs) stuck.push({ name: s.name, minutes: Math.round((now - since) / 60_000), doing: s.doing || [] });
  }
  return { stuck, seen: nextSeen };
}

// How long a health check waits for pm2 processes caught mid-reload: the longest drain (kill_timeout) among those not
// online, plus a minute to start, capped at 7 min. Pure. Used by scripts/system-checks.mjs.
export const settleMs = (list, names) => Math.min(420_000, 60_000 + Math.max(0, ...list
  .filter((p) => names.includes(p.name) && p.pm2_env?.status !== 'online').map((p) => Number(p.pm2_env?.kill_timeout) || 30_000)));

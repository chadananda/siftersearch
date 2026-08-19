// Declared-vs-live cron comparison. ONE implementation, imported by both health-check (which alarms) and
// update-server (which corrects) — the same logic in two files is how the thread<->dialog linkage drifted
// from its own test.
//
// Why this exists: pm2 keeps its OWN copy of each app's config from whenever it was first started, and
// `startOrReload` does NOT refresh cron_restart (it does refresh max_memory_restart and friends, which is
// what made the omission so easy to miss). Measured 2026-08-19: all four cron apps declared hourly schedules
// and pm2 was running every one of them every 5 MINUTES — 12x, for months. A too-FREQUENT cron never looks
// broken, so nothing surfaced it.

/**
 * cron_restart per app, read from ecosystem source text.
 * Scoped per app-object so one app's cron can never bleed onto a previous app that declares none — an app
 * wrongly credited with a cron would be delete+started by the corrector, and for a long-running service
 * that is downtime.
 * @param {string} source contents of ecosystem.config.cjs
 * @returns {Record<string,string>} name -> cron expression (apps without cron_restart are absent)
 */
export function declaredCrons(source) {
  const out = {};
  const text = String(source || '');
  // Split on each `name:` so a match can only see its own app's fields.
  const parts = text.split(/name:\s*'/).slice(1);
  for (const part of parts) {
    const name = part.slice(0, part.indexOf("'"));
    if (!name) continue;
    const upto = part.split(/name:\s*'/)[0];          // defensive: never cross into the next app
    const m = /cron_restart:\s*'([^']+)'/.exec(upto);
    if (m) out[name] = m[1];
  }
  return out;
}

/**
 * Apps whose live pm2 schedule differs from the declared one.
 * Only considers apps that DECLARE a cron_restart: a live app with no declaration is a long-running service
 * and must never be touched by the corrector.
 * @param {Record<string,string>} declared from declaredCrons()
 * @param {Array<{name:string, cron?:string|null}>} live pm2 processes
 */
export function driftedApps(declared = {}, live = []) {
  const out = [];
  for (const p of live || []) {
    const want = declared?.[p?.name];
    if (!want || !p?.cron) continue;                  // not a cron app, or pm2 has no cron for it
    if (String(p.cron).trim() !== String(want).trim()) {
      out.push({ name: p.name, live: String(p.cron).trim(), declared: String(want).trim() });
    }
  }
  return out;
}

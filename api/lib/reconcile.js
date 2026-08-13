// DECLARED vs ACTUAL. Every deployment surprise this project has had was a gap between what the repo says
// should be running and what is: three cron apps declared in ecosystem.config.cjs that PM2 had never heard
// of, an updater executing three-day-old code because it never restarts itself, a migration written but
// never applied because a version constant wasn't bumped. Each cost an investigation. Each is one comparison.
//
// This module states the intent, reads reality, and reports DRIFT. Pure comparison + injectable readers so
// it is testable without a box. Deps: none at import time.

// Cron one-shots that must exist in PM2 once declared. Long-running workers are deliberately NOT listed:
// several (enrichment, graph-*) are retired-but-declared on purpose, and "declared ⇒ must run" would revive
// them. Intent has to be explicit, not inferred from the config file.
export const EXPECTED_CRON_APPS = [
  'siftersearch-pipeline-snapshot',
  'siftersearch-converter',
  'siftersearch-book-ingest',
  'siftersearch-digest',
];

export const EXPECTED_ONLINE = ['siftersearch-api', 'siftersearch-worker'];

// A cron one-shot that has not started within this many minutes of its schedule is drifting: it is declared,
// registered, and still not running — the exact state that looked identical to "nothing to do" tonight.
const STALE_CRON_HOURS = 3;

/**
 * @param {object} actual {
 *   processes: [{name, status, last_start, restarts}],   // pm2 roster
 *   schemaVersion: {content, user},                       // applied
 *   expectedSchema: {content, user},                      // declared in code
 *   deployedVersion, repoVersion,                         // package.json vs live
 *   now                                                   // ms, injectable for tests
 * }
 * @returns {{ok: boolean, drift: Array<{kind, detail, severity}>, checked: number}}
 */
export function reconcile(actual = {}) {
  const drift = [];
  const now = actual.now ?? Date.now();
  const procs = actual.processes || null;

  if (!procs) {
    drift.push({ kind: 'pm2_unreadable', detail: 'could not read the pm2 roster', severity: 'warn' });
  } else {
    const byName = new Map(procs.map((p) => [p.name, p]));
    for (const name of EXPECTED_CRON_APPS) {
      const p = byName.get(name);
      if (!p) {
        // The failure that wasted tonight's first hours: declared in the config, unknown to pm2, silent.
        drift.push({ kind: 'cron_app_missing', detail: `${name} is declared but PM2 has never heard of it`, severity: 'critical' });
        continue;
      }
      const ageH = p.last_start ? (now - Date.parse(p.last_start)) / 3600000 : Infinity;
      if (!Number.isFinite(ageH)) {
        drift.push({ kind: 'cron_app_never_ran', detail: `${name} is registered but has never started`, severity: 'critical' });
      } else if (ageH > STALE_CRON_HOURS) {
        drift.push({ kind: 'cron_app_stale', detail: `${name} last started ${ageH.toFixed(1)}h ago (expected within ${STALE_CRON_HOURS}h)`, severity: 'warn' });
      }
    }
    for (const name of EXPECTED_ONLINE) {
      const p = byName.get(name);
      if (!p) drift.push({ kind: 'worker_missing', detail: `${name} is not in the pm2 roster`, severity: 'critical' });
      else if (p.status !== 'online') drift.push({ kind: 'worker_down', detail: `${name} is ${p.status}`, severity: 'critical' });
    }
  }

  // A migration written but never applied is invisible until something reads the missing column — which is
  // how the consent-provenance columns were absent in production while the code wrote to them.
  for (const db of ['content', 'user']) {
    const applied = actual.schemaVersion?.[db];
    const expected = actual.expectedSchema?.[db];
    if (applied == null || expected == null) continue;
    if (applied < expected) {
      drift.push({ kind: 'migration_pending', detail: `${db} db at v${applied}, code expects v${expected}`, severity: 'critical' });
    } else if (applied > expected) {
      drift.push({ kind: 'migration_ahead', detail: `${db} db at v${applied} is AHEAD of code v${expected} — a rollback?`, severity: 'warn' });
    }
  }

  if (actual.deployedVersion && actual.repoVersion && actual.deployedVersion !== actual.repoVersion) {
    drift.push({ kind: 'version_skew', detail: `serving ${actual.deployedVersion}, repo is ${actual.repoVersion} — a deploy is pending or stuck`, severity: 'warn' });
  }

  return {
    ok: !drift.some((d) => d.severity === 'critical'),
    drift,
    checked: EXPECTED_CRON_APPS.length + EXPECTED_ONLINE.length + 3,
  };
}

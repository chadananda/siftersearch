// Declared vs live pm2 instance count, for the coordinator (scripts/update-server.js). pm2 startOrReload reloads the
// processes an app already has and never scales it, so raising `instances` in ecosystem.config.cjs did nothing on a
// deploy (11-03: siftersearch-api 1 → 4). Pure; the updater runs `pm2 scale` with the result.

/** { appName: n } for apps whose `instances` is a positive integer ('max', -1, absent = not managed here). */
export const declaredInstances = (config) => Object.fromEntries((config?.apps || [])
  .filter((a) => Number.isInteger(a.instances) && a.instances > 0).map((a) => [a.name, a.instances]));

/** The count to scale to, or null: only a RUNNING app whose live count differs (a stopped one starts at the declared count). */
export const scaleTarget = (declared, live) => (Number.isInteger(declared) && live > 0 && live !== declared ? declared : null);

/** pm_ids to delete to shrink to `target`: the HIGHEST NODE_APP_INSTANCE first, so instance 0 (the singleton) stays.
 *  `pm2 scale` down deletes the first procs it lists, which can be instance 0. Never empties a service. Pure. */
export const idsToRemove = (procs, target) => (target < 1 ? [] : [...procs]
  .sort((a, b) => (b.pm2_env?.NODE_APP_INSTANCE ?? 0) - (a.pm2_env?.NODE_APP_INSTANCE ?? 0))
  .slice(0, Math.max(0, procs.length - target)).map((p) => p.pm_id));

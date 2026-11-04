// Which pm2 cluster instance this process is (11-03 search speed: siftersearch-api runs N instances). Work that must run
// ONCE per service — migrations, seeding, the sync worker, cache prewarm, the grounding supervisor — runs only on
// instance 0; every instance serves requests. pm2 cluster mode sets NODE_APP_INSTANCE (0..N-1, kept across reloads);
// unset (tests, node api/index.js, fork mode) = instance 0. Deps: none.

/** This process's instance index. Pure over env. */
export const instanceIndex = (env = process.env) => {
  const n = Number.parseInt(env.NODE_APP_INSTANCE ?? '0', 10);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};

/** True on the one instance that runs once-per-service work. Pure over env. */
export const runsSingletons = (env = process.env) => instanceIndex(env) === 0;

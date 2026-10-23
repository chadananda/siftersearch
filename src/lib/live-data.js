// Cached SSR + live refresh (Chad 10-22: "pages should never ever wait. they should load from cache and update from
// streamed data"). The page renders from the edge cache (possibly minutes old); each live part calls liveRefresh() on
// mount to fetch fresh data once the page is idle, again on an interval while on screen and the tab is visible, and
// whenever the tab comes back. apply() patches in place — only when the data actually changed (same() decides).
// Convention: CLAUDE.md "Cached SSR + live refresh". Tested in tests/api/live-data.test.js.

/**
 * @param {() => Promise<any>} load   fetch the fresh data (null/undefined = nothing to apply)
 * @param {(data: any) => void} apply patch the island's state
 * @param {{ every?: number, el?: Element|null, same?: (a: any, b: any) => boolean, initial?: any, idle?: boolean }} [opts]
 *   every: ms between refreshes (0 = refresh once after load); el: only refresh while it is on screen;
 *   same(prev, next): skip apply when unchanged (default: JSON equality); initial: the SSR data, for same()
 * @returns {() => void} stop
 */
export function liveRefresh(load, apply, { every = 60_000, el = null, same = sameJson, initial, idle = true } = {}) {
  let stopped = false, visible = true, last = initial, busy = false, timer = null, io = null;
  const run = async () => {
    if (stopped || busy || !visible || document.hidden) return;
    busy = true;
    try {
      const next = await load();
      if (!stopped && next != null && !(last !== undefined && same(last, next))) { last = next; apply(next); }
    } catch { /* keep what is on screen: the cached render is still a good page */ } finally { busy = false; }
  };
  if (el && typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(([e]) => { const was = visible; visible = e.isIntersecting; if (visible && !was) run(); });
    io.observe(el);
  }
  const onVis = () => { if (!document.hidden) run(); };
  document.addEventListener('visibilitychange', onVis);
  const first = () => run();
  if (idle && typeof requestIdleCallback === 'function') requestIdleCallback(first, { timeout: 2500 }); else setTimeout(first, idle ? 600 : 0);
  if (every > 0) timer = setInterval(run, every);
  return () => { stopped = true; clearInterval(timer); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); };
}

export function sameJson(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

// The Reading Room's live data, shared by its islands (one module instance per page): /api/library/landing refreshed
// through liveRefresh (after idle, every minute while the tab is visible), and the shelves index fetched once on demand
// (catalogue search, a work's parts in the lectern). Both are edge-cached: neither ever waits on tower.
import { liveRefresh } from './live-data.js';

const API = import.meta.env.PUBLIC_API_URL || '';
const subs = new Set();
let stop = null, last = null;
const strip = (d) => { if (!d) return d; const { generated_at, ...rest } = d; return rest; };

/** Subscribe to fresh landing payloads; `initial` is the SSR copy (so an unchanged refresh applies nothing). */
export function onLanding(fn, initial = null) {
  subs.add(fn);
  if (last) fn(last);
  if (!stop) {
    stop = liveRefresh(async () => {
      const r = await fetch(`${API}/api/library/landing`);
      return r.ok ? r.json() : null;
    }, (d) => { last = d; for (const f of subs) f(d); },
    { every: 60_000, initial: initial ?? undefined, same: (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b)) });
  }
  return () => subs.delete(fn);
}

let shelvesP = null;
/** The shelves index (/api/library/shelves), fetched at most once per page. */
export function getShelves() {
  if (!shelvesP) shelvesP = fetch(`${API}/api/library/shelves`).then((r) => (r.ok ? r.json() : null)).catch(() => { shelvesP = null; return null; });
  return shelvesP;
}

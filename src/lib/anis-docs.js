// The three Anís docs pages' numbers (/docs/response-strategies, /docs/anis-activities, /docs/anis-tools): one formatter set
// and one flat key → value map per API payload, used by SSR (first render) AND the live refresh, so both print the same
// text. Elements carry data-live="<key>" data-fmt="<kind>"; bindLive() patches them from /api/v1/anis/* (liveRefresh).
import { liveRefresh } from './live-data.js';

const DASH = '–';
export const fmt = {
  ms: (x) => (x == null ? DASH : x < 1000 ? `${Math.round(x)} ms` : `${(x / 1000).toFixed(1)} s`),
  share: (x) => (x == null ? DASH : `${(x * 100).toFixed(1)}%`),
  pct: (x) => (x == null ? DASH : `${x}%`),
  usd: (x) => (x == null ? DASH : `$${Number(x).toFixed(4)}`),
  score: (x) => (x == null ? DASH : `${Number(x).toFixed(1)}/10`),
  n: (x) => (x == null ? DASH : Number(x).toLocaleString('en-US')),
};
export const show = (map, key, kind = 'n') => (fmt[kind] || fmt.n)(map[key]);

const put = (m, prefix, o, keys) => { for (const k of keys) m[`${prefix}.${k}`] = o?.[k] ?? null; };
const STAT_KEYS = ['turns', 'share', 'p50_ms', 'p95_ms', 'usd_per_turn', 'judged', 'n_scored', 'score', 'weak_pct'];

/** /api/v1/anis/strategies → flat map. */
export function strategiesFlat(d) {
  const m = {};
  put(m, 'summary', d?.summary, ['active', 'candidates', 'promotions_30d']);
  for (const s of d?.strategies || []) {
    put(m, `s.${s.id}`, s.stats, STAT_KEYS);
    for (const b of s.branches || []) put(m, `b.${s.id}.${b.hash}`, b, ['share', 'turns', 'p50_ms', 'score']);
    for (const c of s.candidates || []) put(m, `c.${s.id}.${c.version}`, c.stats, STAT_KEYS);
  }
  return m;
}
/** /api/v1/anis/activities → flat map. */
export function activitiesFlat(d) {
  const m = {};
  for (const a of d?.activities || []) put(m, `a.${a.name}`, a.live, ['runs', 'p50_ms', 'usd']);
  return m;
}
/** /api/v1/anis/tools → flat map. */
export function toolsFlat(d) {
  const m = {};
  for (const t of d?.tools || []) put(m, `t.${t.name}`, t.live, ['calls', 'errors', 'p50_ms', 'p95_ms']);
  return m;
}

/** Client: refresh every [data-live] under root from `path` (edge-cached), applying only what changed. */
export function bindLive(root, path, flatten, initial) {
  if (!root) return () => {};
  const API = import.meta.env.PUBLIC_API_URL || '';
  return liveRefresh(async () => {
    const r = await fetch(`${API}${path}`);
    return r.ok ? r.json() : null;
  }, (d) => {
    const m = flatten(d);
    for (const el of root.querySelectorAll('[data-live]')) {
      const k = el.getAttribute('data-live');
      if (!(k in m)) continue;
      const text = show(m, k, el.getAttribute('data-fmt') || 'n');
      if (el.textContent !== text) el.textContent = text;
    }
  }, { every: 120_000, el: root, initial, same: (a, b) => JSON.stringify(flatten(a)) === JSON.stringify(flatten(b)) });
}

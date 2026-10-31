// The media stage ledger (Chad 10-30: "a lightweight sqlite table managing the stages of each staged or published audio file").
// One row per (talk, stage), mirrored from meta.json's stages at every save, so a count is one GROUP BY instead of a walk of 10k folders.
// Pure: schema + the diff between a talk's meta.stages and its rows. Repo: repos/media-ledger-repo.js. Plan: planning/media-ledger-plan-20261030.md
export const MEDIA_LEDGER_SQL = [
  `CREATE TABLE IF NOT EXISTS media_stages (item_id INTEGER NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL, at TEXT, ms INTEGER, host TEXT,
    detail TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (item_id, stage))`,
  `CREATE INDEX IF NOT EXISTS idx_media_stages_stage ON media_stages(stage, status, at)`,
];

const DETAIL_KEYS = ['verdict', 'mode', 'model', 'version', 'kind', 'error', 'skipped', 'why', 'engine', 'tool', 'fp', 'usd'];   // tool/fp/usd: the stage registry's record (stages.js)   // host/pod/worker → the host column
const iso = (v) => (typeof v === 'number' && Number.isFinite(v) ? new Date(v).toISOString() : typeof v === 'string' ? v : null);
const scalar = (v) => (typeof v === 'string' ? v.slice(0, 120) : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);   // meta holds objects in odd places (worker: {…})

/** meta.stages → the rows they mean. A stage with `at` is done; one with an `error`/`failed` and no `at` is failed; other keys are ignored. */
export function stageRows(stages = {}) {
  const out = [];
  for (const [stage, s] of Object.entries(stages || {})) {
    if (!s || typeof s !== 'object') continue;
    const status = s.at ? 'done' : s.error || s.failed ? 'failed' : s.started ? 'running' : null;
    if (!status) continue;
    const detail = Object.fromEntries(DETAIL_KEYS.filter((k) => s[k] != null && typeof s[k] !== 'object' && !(typeof s[k] === 'number' && !Number.isFinite(s[k]))).map((k) => [k, typeof s[k] === 'string' ? s[k].slice(0, 200) : s[k]]));
    if (s.stale) detail.stale = true;   // marked for a re-run campaign: still done (the talk stays on air), re-done next
    out.push({ stage, status, at: iso(s.at || s.started || null), ms: Number.isFinite(Number(s.ms)) ? Math.round(Number(s.ms)) : null,
      host: scalar(s.host) ?? scalar(s.pod) ?? scalar(s.worker), detail: Object.keys(detail).length ? JSON.stringify(detail) : null });
  }
  return out;
}

/** What to write so the rows equal `want`: upserts for new/changed rows, deletes for stages no longer in meta (a redo cleared them). */
export function stageDiff(have = [], want = []) {
  const key = (r) => [r.status, r.at, r.ms, r.host, r.detail].join('\u0001');
  const h = new Map(have.map((r) => [r.stage, r])), w = new Map(want.map((r) => [r.stage, r]));
  return { upsert: want.filter((r) => !h.has(r.stage) || key(h.get(r.stage)) !== key(r)), remove: have.filter((r) => !w.has(r.stage)).map((r) => r.stage) };
}

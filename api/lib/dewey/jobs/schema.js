// Dewey job registry schema (migration 185). New tables only, created empty (instant for the single writer); no backfill.
export const DEWEY_JOBS_SQL = [
  `CREATE TABLE IF NOT EXISTS dewey_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER, kind TEXT NOT NULL, created_by TEXT, channel TEXT, params TEXT, idem_key TEXT,
    state TEXT NOT NULL DEFAULT 'received', step TEXT, steps TEXT, counts TEXT, eta_at TEXT, attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3, next_run_at TEXT, lease_until TEXT, worker TEXT, cost_usd REAL NOT NULL DEFAULT 0, notify TEXT,
    result TEXT, question TEXT, item_id INTEGER, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_dewey_jobs_idem ON dewey_jobs(idem_key) WHERE idem_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_dewey_jobs_open ON dewey_jobs(state, next_run_at) WHERE finished_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_dewey_jobs_parent ON dewey_jobs(parent_id) WHERE parent_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_dewey_jobs_user ON dewey_jobs(created_by, id)`,
  `CREATE TABLE IF NOT EXISTS dewey_job_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL, data TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_dewey_job_events_job ON dewey_job_events(job_id, id)`,
  `CREATE TABLE IF NOT EXISTS dewey_usage (day TEXT NOT NULL, who TEXT NOT NULL, jobs INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0,
    pages INTEGER NOT NULL DEFAULT 0, research INTEGER NOT NULL DEFAULT 0, usd REAL NOT NULL DEFAULT 0, PRIMARY KEY (day, who))`,
  `CREATE TABLE IF NOT EXISTS dewey_flags (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT NOT NULL)`,
];

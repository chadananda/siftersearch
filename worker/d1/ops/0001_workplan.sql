-- WorkPlan (Chad 10-10): the live queue of features — what is being built now (with status), what is next (ordered),
-- what is blocked and on whom, what is done. Chad re-orders; Claude updates status as work happens.
CREATE TABLE IF NOT EXISTS work_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  detail       TEXT,                       -- what it is / acceptance, short
  area         TEXT,                       -- e.g. search, anis, dewey, library, site, ops
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','in_progress','blocked','done','dropped')),
  note         TEXT,                       -- latest progress line ("built X, testing Y") or the blocker
  blocked_on   TEXT,                       -- 'chad' | 'external' | free text, when status = blocked
  position     REAL NOT NULL DEFAULT 0,    -- order within the queue (lower = sooner)
  requested_by TEXT,                       -- chad | claude
  links        TEXT,                       -- JSON array of {label,url} (plans, commits, artifacts)
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  started_at   TEXT,
  done_at      TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_work_status_pos ON work_items (status, position);

// Donor-intake schema (migration 189): donors → drives (custody) → intake_items. One statement each; shared with the tests' in-memory rig.
export const ARCHIVES_SQL = [
  `CREATE TABLE IF NOT EXISTS donors (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT, mail_address TEXT, notes TEXT, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS drives (id TEXT PRIMARY KEY, donor_id TEXT NOT NULL, label TEXT, source TEXT, root TEXT, status TEXT, files INTEGER, bytes INTEGER,
    received_at TEXT, copied_at TEXT, verified_at TEXT, returned_at TEXT, notes TEXT, created_at TEXT, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_drives_donor ON drives(donor_id)`,
  `CREATE TABLE IF NOT EXISTS intake_items (id INTEGER PRIMARY KEY, drive_id TEXT NOT NULL, kind TEXT, section TEXT, title TEXT, creator TEXT, year INTEGER, lang TEXT,
    primary_rel TEXT NOT NULL, rel_paths TEXT, files INTEGER, bytes INTEGER, duration_s REAL, match TEXT, match_ref TEXT, score REAL, why TEXT, destination TEXT, metadata TEXT,
    decision TEXT, decision_note TEXT, decided_by TEXT, decided_at TEXT, info_answer TEXT, imported_ref TEXT, imported_at TEXT, created_at TEXT, updated_at TEXT,
    UNIQUE(drive_id, primary_rel))`,
  `CREATE INDEX IF NOT EXISTS idx_intake_drive_sec ON intake_items(drive_id, section, kind, score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_intake_drive_dec ON intake_items(drive_id, decision)`,
];

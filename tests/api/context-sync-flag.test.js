// Writing a disambiguation note must mark the row for the sync that actually RUNS.
// enhanced_synced lost its consumer when siftersearch-enrichment was retired (2026-07-10), so a note that
// cleared only that flag never reached Meili: 0 of 3 sampled doctrinal paragraphs carried context in the
// index while the DB held notes for all 292 of the Íqán.
//
// Asserts on the SHIPPED statement (imported), not a copy — a test that restates the SQL passes whatever
// production does and cannot catch the drift it exists to prevent.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { UPDATE_CONTEXT_SQL } from '../../api/lib/content.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE content (
    id INTEGER PRIMARY KEY, context TEXT, context_model TEXT,
    synced INTEGER DEFAULT 1, enhanced_synced INTEGER DEFAULT 1, updated_at INTEGER)`);
  db.prepare(`INSERT INTO content (id, synced, enhanced_synced) VALUES (1, 1, 1)`).run();
});
const run = () => db.prepare(UPDATE_CONTEXT_SQL).run('a doctrinal note', 'deepseek-disambig-v1', 1787000000, 1);

describe('a context write must be visible to the sync that runs', () => {
  it('clears synced — the flag the unified worker actually polls', () => {
    run();
    expect(db.prepare('SELECT synced FROM content WHERE id=1').get().synced).toBe(0);
  });
  it('still clears enhanced_synced, so a restored enhanced cycle keeps working', () => {
    run();
    expect(db.prepare('SELECT enhanced_synced FROM content WHERE id=1').get().enhanced_synced).toBe(0);
  });
  it('persists the note and its model stamp', () => {
    run();
    expect(db.prepare('SELECT context, context_model FROM content WHERE id=1').get())
      .toMatchObject({ context: 'a doctrinal note', context_model: 'deepseek-disambig-v1' });
  });
});

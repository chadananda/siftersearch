// enqueue's INSERT…WHERE NOT EXISTS: two API instances racing the plan follower insert identical pending work once.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../../api/lib/pipeline/queue.js', import.meta.url), 'utf8');
const sql = src.match(/INSERT INTO grounding_queue \(doc_id, opts_json, position, note\)\s+SELECT[^`]+/)[0];

describe('enqueue dedupe', () => {
  it('identical pending work is inserted once; different opts or a finished row allow a new one', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE grounding_queue (id INTEGER PRIMARY KEY, doc_id INT, opts_json TEXT, position INT, note TEXT, status TEXT DEFAULT 'queued')`);
    const add = (doc, opts) => db.prepare(sql).run(doc, opts, 1, null, doc, opts).changes;
    expect(add(7, '{}')).toBe(1);
    expect(add(7, '{}')).toBe(0);                                  // the racing second instance
    expect(add(7, '{"only":"hype"}')).toBe(1);                     // a different step of the same book
    db.exec(`UPDATE grounding_queue SET status='done' WHERE opts_json='{}'`);
    expect(add(7, '{}')).toBe(1);                                  // re-running a finished book is still allowed
  });
});

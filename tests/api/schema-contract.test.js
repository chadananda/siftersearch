// THE TIMESTAMP CONTRACT. Three separate bugs in one day, all the same defect — comparing a timestamp
// against the wrong type — with opposite, equally invisible symptoms:
//   grounding_queue.finished_at   (epoch INTEGER) vs datetime('now') → matched ZERO rows  (books never timed out)
//   companion_exposure.created_at (epoch INTEGER) vs datetime('now') → matched ZERO rows  (would re-ask every turn)
//   docs.created_at               (ISO TEXT)      vs an epoch number → matched EVERY row  ("60 ingested this hour")
// SQLite sorts every integer below every text value, so neither comparison errors and neither is visible
// without real data.
//
// The naive contract — "all timestamps must be epoch INTEGER" — is not achievable: 100+ legacy tables store
// ISO TEXT (CURRENT_TIMESTAMP), and rewriting them is a bigger risk than the bug. So the contract that IS
// enforceable, and that actually prevents the failure:
//   1. A table must not MIX the two types. Mixed-type tables are where a developer reads one column's
//      convention and applies it to the next one — the highest-risk shape there is.
//   2. NEW pipeline tables use epoch INTEGER (they do arithmetic: ages, stuck-detection, cooldowns).
//   3. The type of every timestamp column is enumerable from the DDL, so "which is it here?" is a lookup
//      rather than a guess. `npm run schema:timestamps` prints the map.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_FILES = [
  'api/lib/migrations/v1-v25.js', 'api/lib/migrations/v26-v45.js',
  'api/lib/migrations/v46-v58.js', 'api/lib/migrations/v72-v90.js',
  'api/lib/migrations/user.js', 'api/lib/migrations/site.js',
];

// Tables added for the pipeline state machine — these DO arithmetic on time, so they must be epoch integers.
const MUST_BE_EPOCH = ['ingest_stage', 'pipeline_run', 'companion_relationship', 'companion_exposure', 'companion_memory'];

const TIME_COL = /_at$|^(timestamp|ts)$/i;

function tablesFrom(src) {
  const out = [];
  const re = /CREATE TABLE (?:IF NOT EXISTS )?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\n\s*\)/gi;
  let m;
  while ((m = re.exec(src))) {
    const cols = [];
    for (const raw of m[2].split('\n')) {
      const line = raw.replace(/--.*$/, '').trim().replace(/,$/, '');
      if (!line || /^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|CONSTRAINT)\b/i.test(line)) continue;
      const cm = line.match(/^[`"']?(\w+)[`"']?\s+([A-Za-z]+)/);
      if (cm && TIME_COL.test(cm[1])) cols.push({ name: cm[1], type: cm[2].toUpperCase(), line });
    }
    if (cols.length) out.push({ table: m[1], cols });
  }
  return out;
}

const all = MIGRATION_FILES.flatMap((f) => {
  try { return tablesFrom(readFileSync(join(process.cwd(), f), 'utf8')).map((t) => ({ ...t, file: f })); }
  catch { return []; }
});

describe('timestamp type contract', () => {
  it('parses the real migration DDL (guards against this test silently checking nothing)', () => {
    expect(all.length).toBeGreaterThan(20);
    expect(all.map((t) => t.table)).toContain('ingest_stage');
  });

  it('no table MIXES epoch-integer and ISO-text timestamps', () => {
    const mixed = [];
    for (const t of all) {
      const kinds = new Set(t.cols.map((c) => (c.type === 'INTEGER' ? 'epoch' : 'text')));
      if (kinds.size > 1) {
        mixed.push(`${t.table} (${t.file}): ${t.cols.map((c) => `${c.name}:${c.type}`).join(', ')}`);
      }
    }
    expect(mixed, 'A table whose timestamps disagree with each other is where the next comparison bug comes '
      + 'from — a developer reads one column\'s convention and applies it to the next:\n  ' + mixed.join('\n  ')).toEqual([]);
  });

  it('pipeline-state tables use epoch INTEGER, because they do arithmetic on time', () => {
    const bad = [];
    for (const name of MUST_BE_EPOCH) {
      const t = all.find((x) => x.table === name);
      if (!t) continue;                                   // table may live in a migration file not scanned
      for (const c of t.cols) if (c.type !== 'INTEGER') bad.push(`${name}.${c.name} is ${c.type}`);
    }
    expect(bad, `these tables compute ages/cooldowns/stuck-detection and must be epoch INTEGER:\n  ${bad.join('\n  ')}`).toEqual([]);
  });

  it('the pipeline-state clocks default to unixepoch()', () => {
    for (const name of ['ingest_stage', 'pipeline_run']) {
      const t = all.find((x) => x.table === name);
      expect(t, `${name} not found in the scanned DDL`).toBeTruthy();
      expect(t.cols.some((c) => /unixepoch/i.test(c.line)), `${name} should default a clock to unixepoch()`).toBe(true);
    }
  });

  it('exposes the epoch-vs-text split so a WHERE can be written correctly', () => {
    const epoch = all.filter((t) => t.cols.every((c) => c.type === 'INTEGER')).map((t) => t.table);
    const text = all.filter((t) => t.cols.every((c) => c.type !== 'INTEGER')).map((t) => t.table);
    // Both families must be non-empty, or the parser has stopped seeing one of them and this test is blind.
    expect(epoch.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
    expect(epoch).toContain('ingest_stage');
    expect(text).toContain('docs');
  });
});

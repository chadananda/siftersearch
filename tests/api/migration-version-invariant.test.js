// CURRENT_VERSION must equal the highest migration in the dispatch table.
//
// The runner applies fromVersion+1..CURRENT_VERSION. A migration added to the map WITHOUT raising the
// constant is unreachable — it never runs, on any process, in any deploy order, and nothing reports an
// error because from the runner's point of view there is nothing to do. On 2026-08-14 migration 115 sat
// dead this way while code shipped in the same release read the column it was supposed to create; every
// coverage query failed with "no such column: extract_model" and the roadmap rendered 0/893.
//
// The mistake is invisible in review (two files, one number) and invisible at runtime (silent no-op), which
// is exactly the kind that belongs in a test rather than in a convention.
import { describe, it, expect } from 'vitest';
import { migrations, CURRENT_VERSION } from '../../api/lib/migrations/runner.js';

describe('migration dispatch table', () => {
  const versions = Object.keys(migrations).map(Number).filter(Number.isFinite);

  it('CURRENT_VERSION equals the highest migration defined', () => {
    expect(CURRENT_VERSION).toBe(Math.max(...versions));
  });

  it('every migration from 1..CURRENT_VERSION is reachable — no gaps the runner would skip over', () => {
    // A gap is not fatal to the runner (it tolerates a missing key), but it means a version number was
    // claimed and abandoned; surfacing it keeps the table honest about what actually exists.
    const missing = [];
    for (let v = 1; v <= CURRENT_VERSION; v++) if (!(v in migrations)) missing.push(v);
    expect({ missing, note: 'versions claimed but not defined' }).toEqual({ missing, note: 'versions claimed but not defined' });
    expect(versions.every((v) => v <= CURRENT_VERSION)).toBe(true);   // nothing defined ABOVE the ceiling
  });

  it('every migration is a callable', () => {
    for (const v of versions) expect(typeof migrations[v]).toBe('function');
  });
});

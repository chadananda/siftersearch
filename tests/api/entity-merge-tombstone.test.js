// Merge tombstone doctrine — ONE definition of "a merged entity is dead".
//
// 2026-08-24: applyMerge marked merged duplicates by appending ' ⟨merged→N⟩' to canonical_name, while every
// API-layer reader tested `last_assessed_version LIKE 'merged-into-%'`. Neither knew about the other, so
// 6,668 hollow rows (claims + mentions already repointed to the survivor) were served as live persons for
// months — 6,666 of them people, with the marker visible in the name. The real person count was 19,360, not
// the 26,026 every count reported. Only 484 of 7,151 merges were ever properly tombstoned, and because the
// append was not idempotent the markers stacked up to NINE deep on a single row.
//
// These tests encode the invariant, not the implementation. If a second definition of "merged" is ever
// introduced again, the LIVE_SQL tests below are what should fail first.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LIVE_SQL, MERGE_MARKER, stripMergeMarkers, mergeTargets, tombstoneFor,
  tombstoneTarget, isMergedRow, resolveMergeChain,
} from '../../api/lib/entity-live.js';

describe('LIVE_SQL — the single definition of a live entity', () => {
  it('excludes BOTH tombstone forms, so neither definition can drift away alone', () => {
    const sql = LIVE_SQL();
    expect(sql).toMatch(/last_assessed_version/);
    expect(sql).toContain('⟨merged→');
  });

  it('applies the table alias to every column it names — a half-aliased predicate is a runtime error', () => {
    const sql = LIVE_SQL('ge.');
    expect(sql).not.toMatch(/(?<!ge\.)\blast_assessed_version\b/);
    expect(sql).not.toMatch(/(?<!ge\.)\bcanonical_name\b/);
  });
});

describe('merge markers', () => {
  it('strips a single marker and restores the original name', () => {
    expect(stripMergeMarkers('Mírzá Muḥammad-‘Alí ⟨merged→1248015⟩')).toBe('Mírzá Muḥammad-‘Alí');
  });

  it('strips STACKED markers — the non-idempotent append put nine on one row', () => {
    const stacked = 'Mírzá Muḥammad-‘Alí' + ' ⟨merged→1248015⟩'.repeat(9);
    expect(stripMergeMarkers(stacked)).toBe('Mírzá Muḥammad-‘Alí');
  });

  it('leaves a clean name untouched', () => {
    expect(stripMergeMarkers('Ṭáhirih')).toBe('Ṭáhirih');
  });

  it('returns every target in the order it was applied', () => {
    expect(mergeTargets('X ⟨merged→10⟩ ⟨merged→20⟩')).toEqual([10, 20]);
    expect(mergeTargets('Ṭáhirih')).toEqual([]);
  });

  it('MERGE_MARKER is stateless across calls — a /g regex with lastIndex is a heisenbug', () => {
    const n = 'X ⟨merged→10⟩';
    expect(MERGE_MARKER.test(n)).toBe(MERGE_MARKER.test(n));
  });
});

describe('tombstone column', () => {
  it('names the survivor, so a dead id can always redirect', () => {
    expect(tombstoneFor(1248015)).toBe('merged-into-1248015');
    expect(tombstoneTarget('merged-into-1248015')).toBe(1248015);
  });

  it('reads a non-merge version string as not-a-tombstone', () => {
    expect(tombstoneTarget('v3-adaptive')).toBeNull();
    expect(tombstoneTarget(null)).toBeNull();
  });

  it('isMergedRow agrees with LIVE_SQL — either form alone means dead', () => {
    expect(isMergedRow({ canonical_name: 'X', last_assessed_version: 'merged-into-9' })).toBe(true);
    expect(isMergedRow({ canonical_name: 'X ⟨merged→9⟩', last_assessed_version: null })).toBe(true);
    expect(isMergedRow({ canonical_name: 'X', last_assessed_version: null })).toBe(false);
    expect(isMergedRow({ canonical_name: 'X', last_assessed_version: 'hype-v3' })).toBe(false);
  });
});

describe('merge chains — a dead id must redirect to the FINAL survivor', () => {
  it('follows X→A→B to B, not to the intermediate A', () => {
    const r = resolveMergeChain(new Map([[1, 2], [2, 3]]), new Set([3]));
    expect(r.get(1)).toBe(3);
    expect(r.get(2)).toBe(3);
  });

  it('resolves a row whose stacked markers name DIFFERENT survivors (149 rows did)', () => {
    // X was merged into A, then later into B. Both markers are real history; the answer is the live one.
    const r = resolveMergeChain(new Map([[1, 2]]), new Set([2]));
    expect(r.get(1)).toBe(2);
  });

  it('never loops forever on a cycle — returns null for the unresolvable id', () => {
    const r = resolveMergeChain(new Map([[1, 2], [2, 1]]), new Set());
    expect(r.get(1)).toBeNull();
  });

  it('returns null when the chain terminates on an id that no longer exists', () => {
    const r = resolveMergeChain(new Map([[1, 999]]), new Set());
    expect(r.get(1)).toBeNull();
  });
});

// ── The regression itself: applyMerge must write the tombstone every reader actually checks.
const statements = [];
vi.mock('../../api/lib/db.js', () => ({
  queryAll: vi.fn(async () => []),
  queryOne: vi.fn(async () => null),
  query: vi.fn(async () => ({})),
  transaction: vi.fn(async (s) => { statements.push(...s); return []; }),
}));
vi.mock('../../api/lib/content.js', () => ({ default: {} }));
vi.mock('../../api/lib/rag-adapter/gazetteer.js', () => ({
  loadGazetteer: () => ({}), anchorFor: () => null, guardedPair: () => false,
}));

describe('applyMerge', () => {
  beforeEach(() => { statements.length = 0; });

  it('sets last_assessed_version — the column every live filter reads', async () => {
    const { makeStore } = await import('../../api/lib/rag-adapter/store.js');
    await makeStore().applyMerge(1248015, [1287259, 1288070], 'dedupe');
    const tomb = statements.find((s) => /last_assessed_version\s*=/.test(s.sql));
    expect(tomb).toBeDefined();
    // Bound as a parameter, not interpolated — so assert on the value actually written.
    expect(tomb.args).toContain('merged-into-1248015');
  });

  it('does NOT mutate canonical_name — the name field is not a status field', async () => {
    const { makeStore } = await import('../../api/lib/rag-adapter/store.js');
    await makeStore().applyMerge(1248015, [1287259], 'dedupe');
    const setsName = statements.some((s) => /UPDATE graph_entities[\s\S]*SET[\s\S]*canonical_name\s*=/i.test(s.sql));
    expect(setsName).toBe(false);
  });

  it('still repoints mentions and claims onto the survivor', async () => {
    const { makeStore } = await import('../../api/lib/rag-adapter/store.js');
    await makeStore().applyMerge(1248015, [1287259], 'dedupe');
    const sqls = statements.map((s) => s.sql).join('\n');
    expect(sqls).toMatch(/entity_mentions_v2 SET entity_id/);
    expect(sqls).toMatch(/entity_claims SET entity_id/);
    expect(sqls).toMatch(/entity_claims SET target_entity_id/);
  });

  it('is idempotent — re-merging an already-merged id writes the same tombstone, never a stacked one', async () => {
    const { makeStore } = await import('../../api/lib/rag-adapter/store.js');
    const store = makeStore();
    await store.applyMerge(1248015, [1287259], 'dedupe');
    const first = statements.map((s) => s.sql).join('\n');
    statements.length = 0;
    await store.applyMerge(1248015, [1287259], 'dedupe');
    expect(statements.map((s) => s.sql).join('\n')).toBe(first);
    expect(first).not.toMatch(/\|\|/);   // no string concatenation onto an existing value
  });
});

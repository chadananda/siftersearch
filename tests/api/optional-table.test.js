// A "table may not exist yet" catch must swallow ONLY that. Anything else — a typo'd column, a locked db,
// a permission error — looks identical to the caller and vanishes, which is how a bug becomes a mystery.
import { describe, it, expect, beforeEach } from 'vitest';
import { ignoreMissingTable, swallowedTotal, swallowedCounts, resetSwallowed } from '../../api/lib/swallow.js';

beforeEach(() => resetSwallowed());

describe('ignoreMissingTable', () => {
  it('is silent for a genuinely absent table — the expected, benign case', () => {
    ignoreMissingTable(new Error('no such table: library_nodes'), 'library.nodes');
    expect(swallowedTotal()).toBe(0);
  });
  it('is silent for an absent column — same "schema not there yet" shape', () => {
    ignoreMissingTable(new Error('no such column: authority_default'), 'library.nodes');
    expect(swallowedTotal()).toBe(0);
  });
  it('COUNTS a locked database — the table exists and the query really failed', () => {
    ignoreMissingTable(new Error('database is locked'), 'library.nodes');
    expect(swallowedTotal()).toBe(1);
    expect(swallowedCounts().map((r) => r.context)).toContain('library.nodes');
  });
  it('COUNTS a malformed query — a typo must never hide behind "table may not exist"', () => {
    ignoreMissingTable(new Error('near "SELCT": syntax error'), 'library.assets');
    expect(swallowedTotal()).toBe(1);
  });
  it('COUNTS a null/undefined error rather than treating absence of a message as benign', () => {
    ignoreMissingTable(undefined, 'library.queue');
    expect(swallowedTotal()).toBe(1);
  });
});

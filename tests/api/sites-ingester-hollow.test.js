// Root cause of "these files have still not been ingested" (Chad, asked ~6 times): the sites ingester skipped a
// file whose hash matched the stored doc row — but the June reconcile bug had soft-deleted that doc's paragraphs,
// so ESW (20780), This Decisive Hour (20896), Gems (20782), A Traveler's Narrative (20899) stayed EMPTY for three
// months while every run reported "unchanged". Unchanged must mean the text is actually there.
import { describe, it, expect } from 'vitest';
import { isUnchanged } from '../../api/services/sites-ingester.js';

describe('isUnchanged', () => {
  const existing = { id: 20780, file_hash: 'abc' };
  it('skips a file whose hash matches AND whose doc has live paragraphs', () => {
    expect(isUnchanged({ existing, fileHash: 'abc', force: false, hasLiveContent: true })).toBe(true);
  });
  it('re-ingests a HOLLOW doc — same hash, no live paragraphs', () => {
    expect(isUnchanged({ existing, fileHash: 'abc', force: false, hasLiveContent: false })).toBe(false);
  });
  it('re-ingests a changed file', () => {
    expect(isUnchanged({ existing, fileHash: 'xyz', force: false, hasLiveContent: true })).toBe(false);
  });
  it('re-ingests when forced, and ingests a file with no doc yet', () => {
    expect(isUnchanged({ existing, fileHash: 'abc', force: true, hasLiveContent: true })).toBe(false);
    expect(isUnchanged({ existing: null, fileHash: 'abc', force: false, hasLiveContent: false })).toBe(false);
  });
});

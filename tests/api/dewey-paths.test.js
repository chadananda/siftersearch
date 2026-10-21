// Folders Dewey may read in place (10-20: Chad's Public/Ocean-books and Public/pilgrim-notes sweeps were all refused 400).
import { describe, it, expect } from 'vitest';
import { deweyRoots } from '../../api/lib/dewey/paths.js';

describe('dewey read roots', () => {
  it('include the Public folders Chad sends to Dewey, but not all of Public', () => {
    const r = deweyRoots();
    expect(r).toContain('/tank/dropbox/Public/Ocean-books');
    expect(r).toContain('/tank/dropbox/Public/pilgrim-notes');
    expect(r).toContain('/tank/dropbox/Ocean2.0 Supplemental');
    expect(r).not.toContain('/tank/dropbox/Public');
  });
});

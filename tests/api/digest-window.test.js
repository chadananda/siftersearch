// The hourly digest never re-reports a window it already sent, even when the caller's state did not advance.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { windowStart, markSent } from '../../api/lib/pipeline/digest.js';

describe('digest window', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'digest-')), 'w.json');
  it('first run uses the requested start', () => expect(windowStart(1000, file)).toBe(1000));
  it('a stale caller (its curl timed out) cannot re-send a window already sent', () => {
    markSent(5000, file);
    expect(windowStart(1000, file)).toBe(5000);
    expect(windowStart(6000, file)).toBe(6000);
  });
});

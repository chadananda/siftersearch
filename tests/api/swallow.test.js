// A swallowed error is sometimes right; an INVISIBLE one is how a bug becomes a mystery. setConsent wrote to
// columns that did not exist, the failure vanished into `.catch(() => {})`, and connecting an account
// silently recorded no consent. These lock the two things bare catch throws away: a log, and a counter.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const warn = vi.fn();
vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: (...a) => warn(...a) } }));
const { swallow, swallowedCounts, swallowedTotal, resetSwallowed } = await import('../../api/lib/swallow.js');

beforeEach(() => { resetSwallowed(); warn.mockClear(); });

describe('swallow', () => {
  it('never throws — it must be safe inside a catch', () => {
    expect(() => swallow(new Error('x'), 'a.b')).not.toThrow();
    expect(() => swallow(undefined, 'a.b')).not.toThrow();
    expect(() => swallow('a string', 'a.b')).not.toThrow();
    expect(() => swallow(new Error('x'))).not.toThrow();      // unlabelled still works
  });

  it('counts repeats per context, so a constantly-failing path becomes visible', () => {
    swallow(new Error('boom'), 'companion.setConsent');
    swallow(new Error('boom'), 'companion.setConsent');
    swallow(new Error('other'), 'companion.addMemory');
    const counts = swallowedCounts();
    expect(counts[0]).toMatchObject({ context: 'companion.setConsent', count: 2 });
    expect(counts.find((c) => c.context === 'companion.addMemory').count).toBe(1);
    expect(swallowedTotal()).toBe(3);
  });

  it('keeps the last error message, which is what makes the counter actionable', () => {
    swallow(new Error('no such column: consent_source'), 'companion.setConsent');
    expect(swallowedCounts()[0].last_error).toContain('no such column');
    expect(swallowedCounts()[0].last_at).toBeGreaterThan(1700000000);   // epoch seconds
  });

  it('logs each occurrence with its context', () => {
    swallow(new Error('boom'), 'ingest.markStage');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toContain('ingest.markStage');
  });

  it('orders worst-first so the loudest failure is the first thing read', () => {
    swallow(new Error('a'), 'quiet');
    for (let i = 0; i < 5; i++) swallow(new Error('b'), 'loud');
    expect(swallowedCounts()[0].context).toBe('loud');
  });

  it('truncates a huge error instead of retaining it forever', () => {
    swallow(new Error('x'.repeat(5000)), 'big');
    expect(swallowedCounts()[0].last_error.length).toBeLessThanOrEqual(300);
  });
});

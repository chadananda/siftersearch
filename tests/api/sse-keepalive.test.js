import { describe, it, expect, vi } from 'vitest';
import { sseKeepalive } from '../../api/lib/assistant/sse-keepalive.js';
describe('sseKeepalive', () => {
  it('writes a comment every interval and stops', () => {
    vi.useFakeTimers();
    const raw = { write: vi.fn(), once: vi.fn() };
    const stop = sseKeepalive(raw, 15000);
    vi.advanceTimersByTime(46000);
    expect(raw.write).toHaveBeenCalledTimes(3);
    expect(raw.write).toHaveBeenCalledWith(': keepalive\n\n');
    stop(); vi.advanceTimersByTime(30000);
    expect(raw.write).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
  it('stops when the response ended', () => {
    vi.useFakeTimers();
    const raw = { write: vi.fn(), once: vi.fn(), writableEnded: true };
    sseKeepalive(raw, 1000); vi.advanceTimersByTime(5000);
    expect(raw.write).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

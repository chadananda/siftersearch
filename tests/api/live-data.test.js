// liveRefresh (src/lib/live-data.js): cached SSR first, fresh data patched in after load, only when it changed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { liveRefresh } from '../../src/lib/live-data.js';

let listeners;
beforeEach(() => {
  vi.useFakeTimers();
  listeners = {};
  vi.stubGlobal('document', { hidden: false, addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('liveRefresh', () => {
  it('refreshes after load, then on the interval; applies only changed data', async () => {
    const seq = [{ n: 1 }, { n: 1 }, { n: 2 }];
    const load = vi.fn(async () => seq.shift());
    const apply = vi.fn();
    const stop = liveRefresh(load, apply, { every: 1000, initial: { n: 1 } });
    await vi.advanceTimersByTimeAsync(700);           // first refresh (no requestIdleCallback in node → 600 ms)
    expect(load).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();             // same as the SSR data
    await vi.advanceTimersByTimeAsync(1000);
    expect(apply).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(apply).toHaveBeenCalledWith({ n: 2 });
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('keeps the page as is when the fetch fails, and skips while the tab is hidden', async () => {
    const load = vi.fn(async () => { throw new Error('down'); });
    const apply = vi.fn();
    liveRefresh(load, apply, { every: 1000 });
    await vi.advanceTimersByTimeAsync(700);
    expect(apply).not.toHaveBeenCalled();
    document.hidden = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(load).toHaveBeenCalledTimes(1);
    document.hidden = false;
    listeners.visibilitychange();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

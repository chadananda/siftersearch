// Writer fail-fast: a SUSTAINED run of write failures means the single writer is down (deadlocked/crashed),
// not a one-off blip. postWriteBatch tags such an error .fatal so grounding stages abort the book fast
// (→ auto-retry requeue) instead of spinning through every paragraph dropping writes as "per-item flakes".
// Regression guard for the 2026-07-18 writer-deadlock incident (25-min silent spin + queue freeze).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postWriteBatch } from '../../api/lib/db.js';

const okResponse = () => ({ ok: true, json: async () => ({ results: [] }) });
const failFetch = () => { throw new Error('fetch failed'); };

describe('postWriteBatch — writer-down fail-fast', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a lone write failure is NOT fatal (tolerated: dropped paragraph, resume refills)', async () => {
    // A single success first resets any streak carried from a prior test (module-level counter).
    fetch.mockImplementationOnce(okResponse);
    await postWriteBatch([]);
    fetch.mockImplementationOnce(failFetch);
    const e = await postWriteBatch([]).then(() => null, (err) => err);
    expect(e.fatal).toBeUndefined();
  });

  it('a STREAK of failures becomes fatal (writer is down → abort the book)', async () => {
    fetch.mockImplementation(okResponse);
    await postWriteBatch([]);                         // reset streak to 0
    fetch.mockImplementation(failFetch);
    const threshold = 8;                              // SIFTER_WRITER_DOWN_STREAK default
    let lastErr;
    for (let i = 0; i < threshold; i++) {
      lastErr = await postWriteBatch([]).then(() => null, (e) => e);
    }
    expect(lastErr.fatal).toBe(true);                 // the 8th consecutive failure trips fatal
  });

  it('a success mid-streak RESETS the counter (a brief blip does not accumulate toward fatal)', async () => {
    fetch.mockImplementation(okResponse);
    await postWriteBatch([]);                         // reset
    fetch.mockImplementation(failFetch);
    for (let i = 0; i < 5; i++) await postWriteBatch([]).catch(() => {}); // 5 fails (< threshold)
    fetch.mockImplementationOnce(okResponse);
    await postWriteBatch([]);                         // success → streak back to 0
    fetch.mockImplementation(failFetch);
    const e = await postWriteBatch([]).then(() => null, (err) => err);   // 1 fail after reset
    expect(e.fatal).toBeUndefined();                 // not fatal — the reset cleared the prior 5
  });
});

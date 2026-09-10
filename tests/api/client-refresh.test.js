// src/lib/api.js token refresh.
//
// Both behaviours here were measured against production on 2026-09-10: a home page
// that fired its load event at 880ms still had TWO /api/auth/refresh fetches in
// flight 30s later, which is why every page-load audit timed out on networkidle.
// Two separate bugs, one symptom — a refresh per concurrent 401, and a 401 response
// whose body was never read, so the request never completed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let auth, fetchMock, cancelCalls;

// Build a Response-alike whose body must be explicitly drained, so "nobody read it"
// is observable the way the browser sees it.
function unauthorized() {
  const body = {
    cancel: vi.fn(async () => { cancelCalls++; })
  };
  return { ok: false, status: 401, body, json: async () => ({}) };
}

beforeEach(async () => {
  cancelCalls = 0;
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('localStorage', {
    getItem: () => null, setItem: () => {}, removeItem: () => {}
  });
  ({ auth } = await import('../../src/lib/api.js'));
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('token refresh', () => {
  it('drains the body of a 401 so the request can complete', async () => {
    const res = unauthorized();
    fetchMock.mockResolvedValue(res);

    await expect(auth.refresh()).resolves.toBe(false);

    // Returning without touching the body is what held the connection open.
    expect(res.body.cancel).toHaveBeenCalledTimes(1);
    expect(cancelCalls).toBe(1);
  });

  it('collapses concurrent refreshes into a single request', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    fetchMock.mockImplementation(async () => { await gate; return unauthorized(); });

    const all = Promise.all([auth.refresh(), auth.refresh(), auth.refresh()]);
    release();
    const results = await all;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual([false, false, false]);
  });

  it('does not cache the in-flight promise past settlement', async () => {
    fetchMock.mockResolvedValue(unauthorized());

    await auth.refresh();
    await auth.refresh();

    // A later 401 must be able to try again, not reuse the resolved slot.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stores the access token and reports success on 200', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200, body: { cancel: vi.fn() },
      json: async () => ({ accessToken: 'tok_abc' })
    });

    await expect(auth.refresh()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/refresh'),
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });

  it('reports false rather than throwing when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(auth.refresh()).resolves.toBe(false);
  });
});

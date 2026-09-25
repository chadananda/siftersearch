// Author/collection narrowing uses `CONTAINS`, which Meilisearch rejects unless the containsFilter experimental
// feature is on. The rejection was caught per-index and returned as zero hits: "Shoghi Effendi on X" → nothing.
import { describe, it, expect } from 'vitest';
import { ensureContainsFilter } from '../../api/lib/search.js';

function fakeMeili(features, { failPatch = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if (opts.method === 'PATCH') {
      if (failPatch) return { ok: false, status: 400, json: async () => ({ message: 'unknown field' }) };
      Object.assign(features, JSON.parse(opts.body));
    }
    return { ok: true, status: 200, json: async () => ({ ...features }) };
  };
  return { calls, fetchImpl };
}

describe('ensureContainsFilter', () => {
  it('turns the feature on when it is off', async () => {
    const m = fakeMeili({ containsFilter: false });
    const r = await ensureContainsFilter({ meiliUrl: 'http://m', headers: {}, fetchImpl: m.fetchImpl });
    expect(m.calls.some((c) => c.method === 'PATCH' && c.body.containsFilter === true)).toBe(true);
    expect(r).toMatchObject({ enabled: true, changed: true });
  });

  it('does nothing when it is already on — no settings task queued on every restart', async () => {
    const m = fakeMeili({ containsFilter: true });
    const r = await ensureContainsFilter({ meiliUrl: 'http://m', headers: {}, fetchImpl: m.fetchImpl });
    expect(m.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
    expect(r).toMatchObject({ enabled: true, changed: false });
  });

  it('reports failure instead of throwing, so startup never dies on it', async () => {
    const m = fakeMeili({ containsFilter: false }, { failPatch: true });
    const r = await ensureContainsFilter({ meiliUrl: 'http://m', headers: {}, fetchImpl: m.fetchImpl });
    expect(r.enabled).toBe(false);
    expect(r.error).toMatch(/400|unknown/);
  });
});

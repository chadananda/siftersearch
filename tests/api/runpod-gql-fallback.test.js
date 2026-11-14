// REST 429 (day-window limit, 11-14) must not blind the pod reaper: listPods and terminatePod fall back to RunPod GraphQL.
import { describe, it, expect } from 'vitest';
import { listPods, terminatePod } from '../../api/lib/media/cloud.js';

const res = (status, body) => ({ status, ok: status < 400, text: async () => JSON.stringify(body), json: async () => body });
const fake = (rest, gql) => { const calls = []; return { calls, fetchFn: async (url, init) => { calls.push([url, init?.method, init?.body]); return url.includes('graphql') ? gql(init) : rest(init); } }; };

describe('RunPod GraphQL fallback', () => {
  it('listPods: REST refused → pods from GraphQL', async () => {
    const f = fake(() => res(400, { error: 'rate limit exceeded for the day window' }), () => res(200, { data: { myself: { pods: [{ id: 'p1', name: 'sifter-unipase-9', desiredStatus: 'RUNNING' }] } } }));
    expect(await listPods({ fetchFn: f.fetchFn })).toEqual([{ id: 'p1', name: 'sifter-unipase-9', desiredStatus: 'RUNNING' }]);
  });
  it('listPods: REST ok → GraphQL never called', async () => {
    const f = fake(() => res(200, [{ id: 'p2' }]), () => { throw new Error('no'); });
    expect(await listPods({ fetchFn: f.fetchFn })).toEqual([{ id: 'p2' }]);
    expect(f.calls.some(([u]) => u.includes('graphql'))).toBe(false);
  });
  it('listPods: both fail → throws (never an empty list that looks like "no pods")', async () => {
    const f = fake(() => res(400, {}), () => res(200, { errors: [{ message: 'down' }] }));
    await expect(listPods({ fetchFn: f.fetchFn })).rejects.toThrow(/graphql/);
  });
  it('terminatePod: REST refused → podTerminate mutation for that id', async () => {
    const f = fake(() => res(400, { error: 'rate limit' }), () => res(200, { data: { podTerminate: null } }));
    await terminatePod('abc123', { fetchFn: f.fetchFn });
    expect(f.calls.find(([u]) => u.includes('graphql'))[2]).toContain('podTerminate(input: { podId: \\"abc123\\" })');
  });
  it('terminatePod: REST 404 → already gone, no mutation', async () => {
    const f = fake(() => res(404, {}), () => { throw new Error('no'); });
    expect(await terminatePod('gone', { fetchFn: f.fetchFn })).toEqual({});
  });
});

import { afterEach, expect, it, vi } from 'vitest';
import { purgeTalk } from '../../api/lib/media/edge-purge.js';
afterEach(() => vi.unstubAllEnvs());
it('metadata publication invalidates the page without transferring audio', async () => {
  vi.stubEnv('VITEST', '');
  vi.stubEnv('NODE_ENV', 'production');
  const fetchImpl = vi.fn(async () => ({ ok: true }));
  expect(await purgeTalk('sabri-pilgrimage-1989', { version: 4, key: 'test-key', fetchImpl })).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][0]).toContain('/_edge/purge?slug=sabri-pilgrimage-1989');
});

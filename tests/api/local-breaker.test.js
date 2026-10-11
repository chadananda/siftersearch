import { describe, it, expect, vi, afterEach } from 'vitest';
import { localBreakerFetch, _localBreaker } from '../../api/lib/ai-services.js';

afterEach(() => { vi.unstubAllGlobals(); _localBreaker.until = 0; });

describe('local LLM breaker', () => {
  it('a network failure opens the breaker; the next call fails at once without touching the network', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', f);
    await expect(localBreakerFetch('http://dead:1234/v1/x', {})).rejects.toThrow('fetch failed');
    await expect(localBreakerFetch('http://dead:1234/v1/x', {})).rejects.toThrow(/breaker open/);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('an HTTP error response is the host answering — breaker stays shut', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 500 })));
    expect((await localBreakerFetch('http://up:1234/v1/x', {})).status).toBe(500);
    expect(_localBreaker.until).toBe(0);
  });
});

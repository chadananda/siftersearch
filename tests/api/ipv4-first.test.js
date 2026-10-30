// Every service imports logger.js; it must switch DNS to IPv4 first (tower's IPv6 route is dead, 10-29).
import { describe, it, expect } from 'vitest';
import dns from 'node:dns';

describe('ipv4-first', () => {
  it('logger import sets the default result order to ipv4first', async () => {
    await import('../../api/lib/logger.js');
    expect(dns.getDefaultResultOrder()).toBe('ipv4first');
  });
});

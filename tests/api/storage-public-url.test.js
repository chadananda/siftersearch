// storage.getPublicUrl in Cloudflare REST-API mode (tower): the public address, not null (11-13: the PDF share QR and cache hits).
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('getPublicUrl', () => {
  it('REST-API mode answers with the public base', async () => {
    for (const k of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ACCOUNT_ID', 'SCALEWAY_ACCESS_KEY', 'SCALEWAY_SECRET_KEY']) vi.stubEnv(k, '');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 't'); vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'a'); vi.stubEnv('R2_PUBLIC_URL', 'https://pub.example');
    const s = await import('../../api/lib/storage.js');
    s.initStorage();
    expect(s.getPublicUrl('anis/pdf/x.pdf')).toBe('https://pub.example/anis/pdf/x.pdf');
  });
});

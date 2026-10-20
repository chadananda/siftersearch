// 10-20 outage: the coordinator's test boot ran fork-mode order (listen, then warm up) and passed in 5 s while the real
// pm2-cluster boot (warm up, then listen) hung for minutes. Test boots must use the production order and a deadline
// under pm2's listen_timeout.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(import.meta.dirname, '../../scripts/update-server.js'), 'utf8');
const eco = readFileSync(join(import.meta.dirname, '../../ecosystem.config.cjs'), 'utf8');

describe('pre-deploy test boots match production', () => {
  it('every test boot sets API_PREBOOT=1', () => {
    expect(src).toMatch(/API_PORT: String\(HEALTH_CHECK_PORT\), NODE_ENV: 'production', API_PREBOOT: '1'/);
    expect(src.match(/API_PREBOOT: '1' \}\), path: '\/healthz'/g)?.length).toBe(2);
  });
  it('the test-boot deadline stays under the API listen_timeout', () => {
    const retries = Number(src.match(/const HEALTH_CHECK_RETRIES = (\d+)/)[1]);
    const interval = Number(src.match(/const HEALTH_CHECK_INTERVAL = (\d+)/)[1]);
    const listen = Number(eco.match(/listen_timeout: (\d+)/)[1]);
    expect(retries * interval).toBeLessThan(listen);
  });
});

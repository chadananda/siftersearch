import { describe, it, expect } from 'vitest';
import { settleMs } from '../../scripts/lib/settle.mjs';

describe('settleMs (10-19: a fixed 60 s window paged on an ordinary writer restart)', () => {
  it("waits the reloading process's own drain plus a minute", () => {
    const list = [{ name: 'w', pm2_env: { status: 'stopping', kill_timeout: 60000 } }, { name: 'a', pm2_env: { status: 'online', kill_timeout: 300000 } }];
    expect(settleMs(list, ['w', 'a'])).toBe(120000);
  });
  it('caps at 7 minutes and defaults to a 30 s drain', () => {
    expect(settleMs([{ name: 'a', pm2_env: { status: 'launching', kill_timeout: 900000 } }], ['a'])).toBe(420000);
    expect(settleMs([{ name: 'a', pm2_env: { status: 'launching' } }], ['a'])).toBe(90000);
  });
});

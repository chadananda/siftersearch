// Chad 10-20: "please do not send error reports on spending for which permission was given".
import { describe, it, expect } from 'vitest';
import { activeAllowance, spendAlarming } from '../../scripts/lib/approved-spend.mjs';

describe('approved spend raises the alert threshold', () => {
  const entries = [{ usd_per_day: 100, until: '2026-10-27' }, { usd_per_day: 70, until: '2026-10-27' }, { usd_per_day: 500, until: '2026-10-01' }];
  it('counts only allowances still active', () => {
    expect(activeAllowance(entries, new Date('2026-10-20T12:00:00Z'))).toBe(170);
    expect(activeAllowance(entries, new Date('2026-10-28T12:00:00Z'))).toBe(0);
  });
  it('$115 with $170 approved is not an alarm; $250 is', () => {
    expect(spendAlarming(115, 50, 170)).toBe(false);
    expect(spendAlarming(250, 50, 170)).toBe(true);
    expect(spendAlarming(60, 50, 0)).toBe(true);
  });
});

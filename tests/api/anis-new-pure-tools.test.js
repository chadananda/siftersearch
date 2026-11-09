// badi_calendar (pure arithmetic) and reference_lookup (scripture-ref.js): contract behaviour on fixtures.
import { describe, it, expect } from 'vitest';
import { run } from '../../api/lib/assistant/tools.js';
import { badiDate } from '../../api/lib/assistant/badi-calendar.js';

describe('badi_calendar', () => {
  it('Naw-Rúz follows the Tehran equinox rule', () => {
    expect(badiDate('2025-03-20')).toMatchObject({ year: 182, month: 1, day: 1, naw_ruz: true });
    expect(badiDate('2026-03-21')).toMatchObject({ year: 183, month: 1, day: 1, naw_ruz: true });   // equinox 18:16 Tehran: after sunset → the next day
    expect(badiDate('2025-03-19')).toMatchObject({ year: 181, month: 19, month_name: '‘Alá’' });
    expect(badiDate('2025-04-21')).toMatchObject({ year: 182, month: 2, day: 14 });
  });
  it('Ayyám-i-Há sits between Mulk and ‘Alá’', () => {
    expect(badiDate('2025-02-28')).toMatchObject({ month: 0, day: 4 });   // 365-day year: 4 intercalary days, then ‘Alá’ 1
    expect(badiDate('2025-03-01')).toMatchObject({ month: 19, day: 1 });
    expect(badiDate('2025-02-24')).toMatchObject({ month: 18, day: 19 });
  });
  it('through run(): validated input, 400-class error on a bad date', async () => {
    expect((await run('badi_calendar', { date: '2025-03-20' })).naw_ruz).toBe(true);
    await expect(run('badi_calendar', { date: '2025-13-40' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(run('badi_calendar', { date: 'today' })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('reference_lookup', () => {
  it('not a reference → empty passages, ref null (no error)', async () => {
    expect(await run('reference_lookup', { ref: 'what is the soul' })).toEqual({ passages: [], ref: null, exact: false });
  });
});

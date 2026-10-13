
// The off-peak gate on every DeepSeek call (Chad 10-13): background work waits for the half-price hours; people never wait.
import { waitsForOffPeak, offPeakGate } from '../../api/lib/pipeline/peak.js';
describe('offPeakGate', () => {
  it('the API and deep research never wait; pipeline, workers and scripts do; the override wins', () => {
    expect(waitsForOffPeak({ name: 'siftersearch-api' })).toBe(false);
    expect(waitsForOffPeak({ name: 'siftersearch-deep-research' })).toBe(false);
    expect(waitsForOffPeak({ name: 'siftersearch-grounding' })).toBe(true);
    expect(waitsForOffPeak({ name: 'siftersearch-reports' })).toBe(true);
    expect(waitsForOffPeak({})).toBe(true);                                   // a script
    expect(waitsForOffPeak({ name: 'siftersearch-reports', DEEPSEEK_IGNORE_PEAK: '1' })).toBe(false);
    expect(waitsForOffPeak({ name: 'siftersearch-reports', VITEST: 'true' })).toBe(false);
  });
  it('in a peak window it sleeps until the window ends; off-peak it returns at once', async () => {
    const env = { name: 'siftersearch-reports' };
    {
      let t = new Date('2026-10-13T07:30:00Z');                               // Tuesday 07:30 UTC: peak (06:00–10:00)
      const slept = [];
      const waited = await offPeakGate({ env, now: () => t, sleep: async (ms) => { slept.push(ms); t = new Date(t.getTime() + ms); }, log: () => {} });
      expect(waited).toBeGreaterThan(2.4 * 3600e3);
      expect(t.getUTCHours()).toBe(10);
      t = new Date('2026-10-13T12:00:00Z');                                   // off-peak
      expect(await offPeakGate({ env, now: () => t, sleep: async () => { throw new Error('must not sleep'); }, log: () => {} })).toBe(0);
      t = new Date('2026-10-17T07:30:00Z');                                   // Saturday: off-peak all day
      expect(await offPeakGate({ env, now: () => t, sleep: async () => { throw new Error('must not sleep'); }, log: () => {} })).toBe(0);
    }
  });
});

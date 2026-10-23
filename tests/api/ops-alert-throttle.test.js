// Stopped-short alerts (api/lib/ops/alert-throttle.js + service-worker.js): N stopped-short runs of one job × budget family
// in a day → ONE mail, the rest counted; the next day's first mail carries the count (10-23: ~100 mails from media phrase runs).
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { throttleStoppedShort, throttleDecision, alertFamily } from '../../api/lib/ops/alert-throttle.js';

const run = (id, budgetKey, name = 'phrase-index') => ({ id, name, params: { docs: [id], maxUsd: 0.25, budgetKey } });

describe('stopped-short alert throttle', () => {
  it('100 stopped-short runs on one budget key in a day → one mail', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'alerts-')), 'svc.json');
    const day = new Date('2026-10-23T10:00:00Z');
    const sent = Array.from({ length: 100 }, (_, i) => throttleStoppedShort(file, run(5000 + i, 'media-phrase-index'), day)).filter((d) => d.send);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(readFileSync(file, 'utf8'))['phrase-index|media-phrase-index'].count).toBe(100);
  });
  it('per-talk keys share one family (one mail per day, not one per talk)', () => {
    expect(alertFamily(run(1, 'media-phrase-index:983195'))).toBe(alertFamily(run(2, 'media-phrase-index:983196')));
    let s = {}, mails = 0;
    for (let i = 0; i < 50; i++) { const d = throttleDecision(s, run(i, `media-phrase-index:${i}`), new Date('2026-10-23T05:00:00Z')); s = d.state; mails += d.send; }
    expect(mails).toBe(1);
  });
  it('a new day mails again and reports how many went unmailed the day before; other jobs/keys are separate', () => {
    let s = {};
    for (let i = 0; i < 7; i++) s = throttleDecision(s, run(i, 'media-phrase-index'), new Date('2026-10-23T05:00:00Z')).state;
    const other = throttleDecision(s, run(99, 'ops-phrase-index'), new Date('2026-10-23T06:00:00Z'));
    expect(other.send).toBe(true);
    const next = throttleDecision(other.state, run(100, 'media-phrase-index'), new Date('2026-10-24T01:00:00Z'));
    expect(next).toMatchObject({ send: true, count: 1, suppressedBefore: 6, previousDay: '2026-10-23' });
  });
  it('the ops service mails stopped-short runs through the throttle, never directly', () => {
    const src = readFileSync(new URL('../../api/lib/ops/service-worker.js', import.meta.url), 'utf8');
    expect(src).toMatch(/if \(short\) await alertStoppedShort\(/);
    expect(src).not.toMatch(/if \(short\) await alert\(run/);
  });
});

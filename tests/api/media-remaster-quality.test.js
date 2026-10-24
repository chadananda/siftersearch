// Remaster quality verdicts + the grade tool's JSON safety (Chad 10-24).
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { execFileSync } from 'child_process';
import { qualityOf, summarize, deferredMarkdown } from '../../api/lib/media/remaster-quality.js';

const m = (remaster, o = {}) => ({ quality: { overall: 'E', raw: { bandwidth_khz: 5, snr_db: 12 } }, enhancement: { listening: remaster?.status === 'done' ? 'unipase' : 'safe', variants: [] }, remaster, ...o });
describe('verdicts', () => {
  it('usable / partial / review / unrepairable / skipped / unknown', () => {
    expect(qualityOf(m({ status: 'done', verdict: 'pass-auto', fallback_sent_pct: 2, swapped: 2, sentences: 100 })).verdict).toBe('usable');
    const p = qualityOf(m({ status: 'done', verdict: 'pass-auto', fallback_sent_pct: 11 }));
    expect(p.verdict).toBe('partial'); expect(p.reason).toMatch(/11 %/);
    expect(qualityOf(m({ status: 'review', fallback_sent_pct: 21 })).verdict).toBe('review');
    const lo = m({ status: 'review', fallback_sent_pct: 21.9 }); lo.quality.raw.bandwidth_khz = 1.95;
    expect(qualityOf(lo).verdict).toBe('unrepairable');
    expect(qualityOf(m({ status: 'kept', verdict: 'keep-human', fallback_sent_pct: 16.1 })).verdict).toBe('unrepairable');
    expect(qualityOf(m({ status: 'skipped', why: 'grade A' })).verdict).toBe('skipped');
    expect(qualityOf(m(null)).verdict).toBe('unknown');
    expect(qualityOf(m({ status: 'done', fallback_sent_pct: 1 }, { enhancement: { listening: 'safe', variants: [] } })).verdict).toBe('unknown');
  });
  it('summary counts, lists and the archive file', () => {
    const rows = [{ slug: 'a', hours: 1, grade: 'E', qa: { verdict: 'unrepairable', reason: 'x', metrics: { source_bandwidth_khz: 1.95, fallback_pct: 21 } } }, { slug: 'b', hours: 2, grade: 'D', qa: { verdict: 'review', metrics: {} } }, { slug: 'c', hours: 1, grade: 'D', published_remaster: true }];
    const s = summarize(rows);
    expect(s.by_verdict).toEqual({ unrepairable: 1, review: 1, unknown: 1 }); expect(s.published_without_verdict).toBe(1);
    expect(deferredMarkdown(s)).toMatch(/\| a \| E \| 1 \| 1.95 \| 21 \|/);
  });
});

describe('media_tool JSON is always parseable', () => {
  it('-Infinity / NaN become null (10-24: "No number after minus sign" failed the aorus grade)', () => {
    const out = execFileSync('python3', ['-c', `
src = open('scripts/media/media_tool.py').read().split('def load(')[0]
ns = {}; exec(src, ns)
print(ns['jdumps']({'hum': float('-inf'), 'x': [float('nan'), 1.5]}))`], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual({ hum: null, x: [null, 1.5] });
  });
});

describe('the public /media restoration readout', () => {
  it('counts and the latest five only: no workers, cost or tool names', async () => {
    const { restoredShape } = await import('../../api/routes/media.js');
    const r = restoredShape({ total_targets: 1386, published: 900 }, { by_verdict: { usable: 150, partial: 20, review: 22, unrepairable: 2 }, recent: Array.from({ length: 8 }, (_, i) => ({ slug: `t${i}`, title: `T${i}`, speaker: 'S' })), at: 'now' });
    expect(r).toMatchObject({ planned: 1386, published: 900, restored: 170, held: 22 });
    expect(r.recent).toHaveLength(5);
    expect(JSON.stringify(r).toLowerCase()).not.toMatch(/unipase|pod|runpod|usd|cost|spend/);
    expect(restoredShape({}, {})).toMatchObject({ planned: null, restored: 0, held: 0, recent: [] });
  });
});

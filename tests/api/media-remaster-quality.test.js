// Remaster quality verdicts + the grade tool's JSON safety (Chad 10-24).
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { execFileSync } from 'child_process';
import { qualityOf, summarize, deferredMarkdown } from '../../api/lib/media/remaster-quality.js';

const m = (remaster, o = {}) => ({ quality: { overall: 'E', raw: { bandwidth_khz: 5, snr_db: 12 } }, enhancement: { listening: remaster?.status === 'done' ? 'unipase' : 'safe', variants: [] }, remaster: remaster?.status === 'done' && !remaster.check && !remaster.output_assessment ? { ...remaster, check: { verdict: 'changed' } } : remaster, ...o });
describe('verdicts', () => {
  it('usable / partial / review / unrepairable / skipped / unknown', () => {
    expect(qualityOf(m({ status: 'done', verdict: 'pass-auto', fallback_sent_pct: 2, swapped: 2, sentences: 100 })).verdict).toBe('usable');
    const p = qualityOf(m({ status: 'done', verdict: 'pass-auto', fallback_sent_pct: 11 }));
    expect(p.verdict).toBe('partial'); expect(p.reason).toMatch(/11 %/);
    expect(qualityOf(m({ status: 'review', fallback_sent_pct: 21 })).verdict).toBe('review');
    const lo = m({ status: 'review', fallback_sent_pct: 21.9 }); lo.quality.raw.bandwidth_khz = 1.95;
    expect(qualityOf(lo).verdict).toBe('unrepairable');
    expect(qualityOf(m({ status: 'kept', verdict: 'keep-human', fallback_sent_pct: 16.1 })).verdict).toBe('unrepairable');
    expect(qualityOf(m({ status: 'done', verdict: 'pass-cleaned', method: 'cleaned', fallback_sent_pct: 1 })).verdict).toBe('cleaned');
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
  it('counts publishable talks shown better (assessed) vs only shown different', () => {
    const s = summarize([{ slug: 'p', qa: { verdict: 'usable', output_assessment: { passed: true } } }, { slug: 'n', qa: { verdict: 'partial' } }, { slug: 'r', qa: { verdict: 'review' } }]);
    expect(s.assessment).toEqual({ passed: 1, failed: 0, none: 1 }); expect(s.unassessed).toEqual(['n']);
  });
});

describe('proof of improvement (10-29: Dunbar passed with a copy identical to the original)', () => {
  const done = { status: 'done', verdict: 'pass-auto', fallback_sent_pct: 1 };
  const bare = (r) => ({ quality: { overall: 'E', raw: {} }, enhancement: { listening: 'unipase', variants: [] }, remaster: r });
  it('no measurement and no assessment is unverified, never usable', () => {
    expect(qualityOf(bare(done)).verdict).toBe('unverified');
  });
  it('a copy measured as unchanged or suspect is unchanged', () => {
    expect(qualityOf(bare({ ...done, check: { verdict: 'unchanged', why: 'same' } })).verdict).toBe('unchanged');
    expect(qualityOf(bare({ ...done, check: { verdict: 'suspect' } })).verdict).toBe('unchanged');
  });
  it('a passed worker assessment or a changed measurement is usable', () => {
    expect(qualityOf(bare({ ...done, output_assessment: { passed: true } })).verdict).toBe('usable');
    expect(qualityOf(bare({ ...done, check: { verdict: 'changed' } })).verdict).toBe('usable');
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

describe('restoration tiers (every talk has a restored copy; light, cleaned or heavy)', () => {
  it('the audio block names the tier; the original is always there', async () => {
    const { talkAudio, remasterTier } = await import('../../api/lib/media/talk-audio.js');
    const wo = { ogg: 'web/x.original.ogg', m4a: 'web/x.original.m4a' };
    expect(remasterTier({ web_original: wo, aligned_to: 'unipase' })).toBe('heavy');
    expect(remasterTier({ web_original: wo, aligned_to: 'unipase', remaster: { method: 'cleaned' } })).toBe('cleaned');
    expect(remasterTier({ web_original: wo, aligned_to: 'safe', remaster_tier: 'light' })).toBe('light');
    expect(remasterTier({ aligned_to: 'safe' })).toBeNull();
    const a = talkAudio({ slug: 'x', level: 'full', meta: { web_original: wo, aligned_to: 'safe', remaster_tier: 'light', version: 3 } });
    expect(a).toMatchObject({ remastered: true, remaster_tier: 'light' }); expect(a.original_url).toContain('/file/web/x.original.m4a?v=3');
    expect(talkAudio({ slug: 'y', level: 'full', meta: {} })).toMatchObject({ remastered: false, remaster_tier: null });
  });
  it('light verdict + tier in the quality summary', () => {
    const q = qualityOf({ remaster_tier: 'light', web_original: { m4a: 'a' }, enhancement: { listening: 'safe', variants: [] }, quality: { overall: 'A' } });
    expect(q).toMatchObject({ verdict: 'light', tier: 'light' });
    expect(qualityOf(m({ status: 'done', verdict: 'pass-cleaned', method: 'cleaned', fallback_sent_pct: 1 }))).toMatchObject({ verdict: 'cleaned', tier: 'cleaned' });
    expect(summarize([{ slug: 'a', hours: 1, grade: 'A', qa: q }]).by_tier).toEqual({ light: 1 });
  });
});

describe('poor-source restoration requirement (Sabri regression)',()=>{
 it('never accepts D/E basic cleanup as a completed restoration',()=>{
  for(const grade of ['D','E']){
   const q=qualityOf({remaster_tier:'light',web_original:{m4a:'original.m4a'},enhancement:{listening:'safe'},quality:{overall:grade},remaster:null});
   expect(q).toMatchObject({verdict:'pending',tier:null});
   expect(summarize([{slug:'sabri-pilgrimage-1989',grade,qa:q}]).insufficient_restoration).toBe(1);
  }
 });
});

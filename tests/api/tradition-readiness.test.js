// ops/tradition-readiness — pure over coverage_totals rows: religion names normalised, bank traditions first, per-layer tier split,
// complete / incomplete / not measured / partly measured / not needed, ready + missing. Repo injected; no DB.
import { describe, it, expect } from 'vitest';
import { buildReadiness, traditionReadinessReport, READINESS_LAYERS, BANK_TRADITIONS } from '../../api/lib/ops/tradition-readiness.js';

const LEDGER = ['phrase', 'text', 'sections', 'originals', 'context', 'entities', 'concepts', 'hype'];
const DONE = { phrase: 'reached', text: 'indexed', sections: 'generated', originals: 'generated', context: 'generated', entities: 'generated', concepts: 'generated', hype: 'current' };
// a fully done tradition: every layer at 100 % in core (1) and rest (0); originals total 0 (all English)
const full = (religion, docs = 10, over = {}) => LEDGER.flatMap((layer) => [1, 0].map((core) => {
  const total = layer === 'originals' ? 0 : layer === 'sections' ? docs : 100;
  const r = { religion, layer, core, docs, total, generated: 0, current: 0, indexed: 0, reached: 0 };
  r[DONE[layer]] = total;
  return { ...r, ...(over[layer]?.[core] || {}) };
}));

describe('buildReadiness', () => {
  it('normalises stored names into one tradition and lists the 11 bank traditions first, in rollout order', () => {
    const r = buildReadiness([...full("Baha'i"), ...full('Other', 3)], [{ religion: "Baha'i", docs: 15 }, { religion: 'Bahá’í', docs: 5 }, { religion: 'Other', docs: 3 }]);
    expect(r.traditions.slice(0, 11).map((t) => t.religion)).toEqual(["Baha'i", 'Christian', 'Islam', 'Judaism', 'Buddhist', 'Hindu', 'Sikh', 'Confucian', 'Tao', 'Jain', 'Zoroastrian']);
    expect(r.traditions[11].religion).toBe('Other');
    const b = r.traditions[0];
    expect(b.live_docs).toBe(20);
    expect(b.stored_as).toEqual(["Baha'i", 'Bahá’í']);
    expect(BANK_TRADITIONS).toHaveLength(11);
  });
  it('a fully measured tradition is still not ready: concepts is "not measured" (lower bound only)', () => {
    const t = buildReadiness(full("Baha'i"), [{ religion: "Baha'i", docs: 20 }]).traditions[0];
    expect(t.layers.phrase).toMatchObject({ total: 200, done: 200, pct: 100, status: 'complete', tiers: { core: { total: 100, done: 100, pct: 100 }, rest: { total: 100 } } });
    expect(t.layers.translations).toMatchObject({ total: 0, status: 'not needed' });
    expect(t.layers.concepts.status).toBe('not measured');
    expect(t.layers.concepts.reason).toMatch(/concept-extraction stamp/);
    expect(t.missing).toEqual(['concepts']);
    expect(t.ready).toBe(false);
    expect(Object.keys(t.layers)).toEqual(READINESS_LAYERS.map((l) => l.key));
  });
  it('incomplete layers are missing; minPct lowers the bar; done never exceeds total', () => {
    const rows = full("Baha'i", 10, { hype: { 1: { current: 40 }, 0: { current: 500 } }, originals: { 1: { total: 50, generated: 25 } } });
    const t = buildReadiness(rows, [{ religion: "Baha'i", docs: 20 }]).traditions[0];
    expect(t.layers.hype).toMatchObject({ total: 200, done: 140, pct: 70, status: 'incomplete' });
    expect(t.layers.hype.tiers.core.pct).toBe(40);
    expect(t.layers.translations).toMatchObject({ total: 50, done: 25, status: 'incomplete' });
    expect(t.missing).toEqual(['translations', 'concepts', 'hype']);
    const lax = buildReadiness(rows, [{ religion: "Baha'i", docs: 20 }], { minPct: 50 }).traditions[0];
    expect(lax.missing).toEqual(['concepts']);
  });
  it('a tradition absent from the ledger is "not measured" everywhere; a layer the refresh has not reached is "partly measured"; unmeasured docs block ready', () => {
    const r = buildReadiness(full("Baha'i").filter((x) => !(x.layer === 'originals' && x.core === 0)), [{ religion: "Baha'i", docs: 25 }, { religion: 'Jain', docs: 4 }]);
    const jain = r.traditions.find((t) => t.religion === 'Jain');
    expect(Object.values(jain.layers).every((l) => l.status === 'not measured')).toBe(true);
    expect(jain).toMatchObject({ live_docs: 4, measured_docs: 0, unmeasured_docs: 4, ready: false });
    const b = r.traditions[0];
    expect(b.layers.translations.status).toBe('partly measured');
    expect(b).toMatchObject({ measured_docs: 20, unmeasured_docs: 5 });
  });
});

describe('traditionReadinessReport', () => {
  it('reads only the totals + live counts through the repo; tradition filters (bank id or name)', async () => {
    const calls = [];
    const repo = { coverageTotalsAll: async () => { calls.push('totals'); return full('Islam'); }, liveDocsByReligion: async () => { calls.push('live'); return [{ religion: 'Islam', docs: 20 }]; } };
    const r = await traditionReadinessReport({ tradition: 'islam', minPct: '90' }, { repo });
    expect(calls.sort()).toEqual(['live', 'totals']);
    expect(r.min_pct).toBe(90);
    expect(r.traditions.map((t) => t.religion)).toEqual(['Islam']);
    expect(r.layers.find((l) => l.key === 'concepts')).toMatchObject({ measured: false });
  });
});

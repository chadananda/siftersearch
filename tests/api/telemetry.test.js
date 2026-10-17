// Observatory telemetry: ledger rollup → rings × traditions, rates, jobs, capability, disk I/O, activity log.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { shapeCoverage, ratesOf, shapeJobs, shapeCapability, seriesOf, RINGS } from '../../api/lib/telemetry.js';
import { ioBetween } from '../../api/lib/system-health.js';

const row = (religion, layer, o) => ({ religion, layer, docs: 2, total: 100, generated: 0, current: 0, indexed: 0, reached: 0, docs_with: 0, core_total: 50, core_generated: 0, core_reached: 0, ...o });

describe('telemetry shaping', () => {
  it('rings × traditions with the right measure per ring; unknown traditions fold into Other', () => {
    const s = shapeCoverage([
      row("Baha'i", 'text', { indexed: 100 }), row("Baha'i", 'phrase', { indexed: 5000, reached: 80 }), row("Baha'i", 'hype', { generated: 10, core_generated: 10 }),
      row("Baha'i", 'sections', { total: 7, generated: 7, docs_with: 1 }), row('Wicca', 'text', { indexed: 40, total: 40 }),
    ]);
    expect(s.traditions.map((t) => t.id)).toEqual(["Baha'i", 'Other']);
    const cell = (t, r) => s.cells.find((c) => c.tradition === t && c.ring === r);
    expect(cell("Baha'i", 'phrase')).toMatchObject({ done: 80, total: 100 });       // paragraphs reached, not points
    expect(cell("Baha'i", 'sections')).toMatchObject({ done: 1, total: 2 });          // documents with sections
    expect(cell("Baha'i", 'concepts')).toMatchObject({ done: 0, total: 100 });       // no row → empty, never missing
    const hype = s.rings.find((r) => r.id === 'hype');
    expect(hype).toMatchObject({ done: 10, core_done: 10 });
    expect(s.rings.map((r) => r.id)).toEqual(RINGS.map((r) => r.id));
    expect(s.rings.find((r) => r.id === 'translation').planned).toBe(true);
  });
  it('rates per hour from the series', () => {
    const pts = [{ at: 0, series: { phrase: 1000 } }, { at: 1800, series: { phrase: 1500 } }, { at: 3600, series: { phrase: 2000 } }];
    expect(ratesOf(pts, 1)).toEqual({ phrase: 1000 });
    expect(ratesOf(pts.slice(0, 1))).toEqual({});
  });
  it('jobs: running with elapsed, finished with status', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    const j = shapeJobs([{ id: 1, name: 'phrase-index', status: 'running', params: '{"budgetKey":"phrase-islam"}', started_at: '2026-10-16T11:00:00Z' },
      { id: 2, name: 'section-index', status: 'done', params: null, finished_at: '2026-10-16T10:00:00Z', ms: 5 }], now);
    expect(j.running[0]).toMatchObject({ label: 'phrase-index · phrase-islam', elapsed_s: 3600 });
    expect(j.finished[0]).toMatchObject({ name: 'section-index', status: 'done' });
  });
  it('capability from the latest known-item run', () => {
    const c = shapeCapability({ id: 9, finished_at: 'x', result: JSON.stringify({ paragraphs: 176, overall: { words3: { production: { recall_at_1: 0.4, recall_at_10: 0.7, recall_at_30: 0.8, avg_ms: 900 } } } }) });
    expect(c.variants.words3.production).toEqual({ at1: 0.4, at10: 0.7, at30: 0.8, ms: 900 });
    expect(shapeCapability(null)).toBeNull();
  });
  it('series row', () => {
    expect(seriesOf({ rings: [{ id: 'text', done: 5 }], vectors: { phrases: 9 }, counts: { people: 3, concept_claims: 2, sections: 1 } }))
      .toEqual({ text: 5, v_phrases: 9, people: 3, claims: 2, sections: 1 });
  });
  it('disk I/O: busy % and MB/s between two diskstats readings', () => {
    const line = (dev, rs, ws, ticks) => `   8  32 ${dev} 0 0 ${rs} 0 0 0 ${ws} 0 0 ${ticks} 0`;
    const io = ioBetween(line('sdc', 0, 0, 0), line('sdc', 2048 * 30, 0, 2700), 3000);
    expect(io.sdc).toEqual({ busy_pct: 90, read_mb_s: 10, write_mb_s: 0 });
  });
});

let raw;
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, p = []) => { raw.prepare(sql).run(...p); return {}; }),
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
}));
describe('activity log', () => {
  beforeEach(() => { raw = new Database(':memory:'); raw.exec('CREATE TABLE activity_log (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL)'); });
  it('appends trimmed lines; reads the newest, then only what came after', async () => {
    const { logActivity, recentActivity } = await import('../../api/lib/repos/activity-repo.js');
    await logActivity('job', '▶ phrase-index   started', 1);
    await logActivity('probe', 'x'.repeat(500), 2);
    const all = await recentActivity();
    expect(all.map((l) => l.kind)).toEqual(['job', 'probe']);
    expect(all[0].text).toBe('▶ phrase-index started');
    expect(all[1].text).toHaveLength(200);
    expect(await recentActivity(all[0].id)).toHaveLength(1);
  });
});

describe('drive health (SMART)', async () => {
  const { parseSmart } = await import('../../api/lib/system-health.js');
  it('NVMe: life left, TB written, temperature', () => {
    const d = parseSmart('nvme0n1', { critical_warning: 0, temperature: 319, percent_used: 51, data_units_written: 982938374, media_errors: 0, power_on_hours: 2954 }, true);
    expect(d).toMatchObject({ healthy: true, temp_c: 46, life_left_pct: 49, written_tb: 503.3, media_errors: 0 });
  });
  it('SATA SSD and HDD', () => {
    const ssd = parseSmart('sdd', { smart_status: { passed: true }, temperature: { current: 31 }, ata_smart_attributes: { table: [
      { name: 'SSD_Life_Left', value: 65, raw: { value: 65 } }, { name: 'Lifetime_Writes_GiB', value: 100, raw: { value: 45511 } }] } });
    expect(ssd).toMatchObject({ healthy: true, life_left_pct: 65, written_tb: 48.9 });
    const hdd = parseSmart('sdc', { smart_status: { passed: true }, ata_smart_attributes: { table: [{ name: 'Reallocated_Sector_Ct', value: 100, raw: { value: 0 } }] } });
    expect(hdd).toMatchObject({ healthy: true, life_left_pct: null, reallocated: 0 });
  });
});

describe('growing cells (what is being built right now)', async () => {
  const { growingCells } = await import('../../api/lib/telemetry.js');
  it('cells that grew since the previous snapshot, biggest first; new or shrinking cells are not growth', () => {
    const prev = [{ tradition: 'Islam', ring: 'phrase', done: 100 }, { tradition: "Baha'i", ring: 'hype', done: 50 }, { tradition: 'Tao', ring: 'phrase', done: 9 }];
    const now = [{ tradition: 'Islam', ring: 'phrase', done: 400 }, { tradition: "Baha'i", ring: 'hype', done: 60 }, { tradition: 'Tao', ring: 'phrase', done: 8 },
      { tradition: 'Jain', ring: 'phrase', done: 5 }];
    expect(growingCells(now, prev)).toEqual([{ tradition: 'Islam', ring: 'phrase', delta: 300 }, { tradition: "Baha'i", ring: 'hype', delta: 10 }]);
    expect(growingCells(now, [])).toEqual([]);
  });
});

describe('cell rates (sub-progress per tradition between snapshots)', async () => {
  const { cellRates } = await import('../../api/lib/telemetry.js');
  it('growth per hour since an older snapshot, growing cells only', () => {
    const then = [{ tradition: 'Islam', ring: 'phrase', done: 100 }, { tradition: 'Tao', ring: 'phrase', done: 9 }];
    const now = [{ tradition: 'Islam', ring: 'phrase', done: 2500 }, { tradition: 'Tao', ring: 'phrase', done: 9 }, { tradition: 'Jain', ring: 'phrase', done: 5 }];
    expect(cellRates(now, then, 24)).toEqual({ 'Islam|phrase': 100 });
    expect(cellRates(now, then, 0)).toEqual({});
  });
});

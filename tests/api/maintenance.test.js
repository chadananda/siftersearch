// Weekly maintenance queue (api/lib/ops/maintenance.js) + the audit digest's weekly section (api/lib/audit/audit-digest.js):
// dedupe by key, merge/render for weekly digests, pending → drain to sent/, and the weekly email ("all nominal" when empty).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { queueMaintenance, pendingMaintenance, drainMaintenance, buildWeekly } from '../../api/lib/ops/maintenance.js';
import { buildAuditDigest } from '../../api/lib/audit/audit-digest.js';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'maint-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('queueMaintenance', () => {
  it('one item per key: a repeat updates it, counts seen, keeps first', () => {
    queueMaintenance({ source: 'host', key: 'host:disk', title: 'Disk 85%', severity: 'warn' }, { dir, now: Date.parse('2026-11-01T00:00:00Z') });
    const b = queueMaintenance({ source: 'host', key: 'host:disk', title: 'Disk 87%', severity: 'warn' }, { dir, now: Date.parse('2026-11-02T00:00:00Z') });
    expect(b).toMatchObject({ title: 'Disk 87%', seen: 2, first: '2026-11-01T00:00:00.000Z', last: '2026-11-02T00:00:00.000Z', severity: 'warn' });
    expect(pendingMaintenance({ dir }).queued).toHaveLength(1);
  });

  it('merge adds the week up; render writes the words from the merged data', () => {
    const opts = { source: 'grounding', key: 'grounding-digest', merge: (p, d) => ({ n: (p?.n || 0) + d.n }), render: (w) => ({ title: `${w.n} grounded`, text: `n=${w.n}` }) };
    queueMaintenance({ ...opts, data: { n: 2 } }, { dir });
    const it2 = queueMaintenance({ ...opts, data: { n: 3 } }, { dir });
    expect(it2).toMatchObject({ title: '5 grounded', text: 'n=5', data: { n: 5 }, severity: 'suggestion' });
  });

  it('never throws: a missing key returns null', () => {
    expect(queueMaintenance({ source: 'x' }, { dir })).toBeNull();
  });

  it('pending lists queued items and section files; drain moves both to sent/<date>/', () => {
    queueMaintenance({ source: 'ups', key: 'ups-replbatt', title: 'Replace battery', severity: 'warn' }, { dir });
    writeFileSync(join(dir, 'audit-digest.json'), JSON.stringify({ source: 'audit-digest', title: 'Audit', summary: 's', items: [{ kind: 'note', text: 't' }] }));
    writeFileSync(join(dir, 'not-a-section.json'), JSON.stringify({ hello: 1 }));
    const p = pendingMaintenance({ dir });
    expect(p.queued.map((i) => i.key)).toEqual(['ups-replbatt']);
    expect(p.sections.map((s) => s.source)).toEqual(['audit-digest']);
    const d = drainMaintenance({ dir, now: Date.parse('2026-11-09T07:05:00Z') });
    expect(d.moved).toBe(2);
    expect(existsSync(join(dir, 'sent', '2026-11-09', 'queue', 'ups-replbatt.json'))).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(['not-a-section.json', 'queue', 'sent']);
    expect(pendingMaintenance({ dir })).toEqual({ queued: [], sections: [] });
  });
});

describe('buildWeekly', () => {
  const now = new Date('2026-11-09T07:05:00Z');
  it('empty week → one short "all nominal" mail', () => {
    const w = buildWeekly({ health: { criticals: [], warns: [], metrics: ['158,000 documents'] }, now });
    expect(w.empty).toBe(true);
    expect(w.subject).toBe('SifterSearch weekly maintenance 2026-11-09: all nominal');
    expect(w.html).toMatch(/All nominal/);
    expect(w.html).toMatch(/158,000 documents/);
  });

  it('full week: health, sections and queued items grouped by source, warnings counted', () => {
    const w = buildWeekly({ now,
      health: { criticals: [{ name: 'Writer', detail: 'slow' }], warns: [{ name: 'Disk /fast', detail: '86%' }] },
      sections: [{ source: 'audit-digest', title: 'Audit', summary: '3 exchanges', items: [{ kind: 'note', text: 'x' }], html: '<h2>Audit section</h2>' }, { source: 'empty', items: [] }],
      queued: [{ source: 'host', key: 'h', title: 'Memory 90%', severity: 'warn', seen: 3, first: '2026-11-03', last: '2026-11-05' },
        { source: 'segmentation', key: 's', title: 'Approve <book>', text: 'run **this**', severity: 'suggestion', seen: 1, last: '2026-11-04' }] });
    expect(w.empty).toBe(false);
    expect(w.subject).toBe('SifterSearch weekly maintenance 2026-11-09: 1 critical · 2 warning(s) · 1 report section(s) · 2 queued item(s)');
    expect(w.html).toMatch(/Health now/);
    expect(w.html).toMatch(/<h2>Audit section<\/h2>/);
    expect(w.html).toMatch(/Host resources/);
    expect(w.html).toMatch(/3× · 2026-11-03 → 2026-11-05/);
    expect(w.html).toMatch(/Approve &lt;book&gt;/);   // titles escaped
    expect(w.html).toMatch(/<strong[^>]*>this<\/strong>/);   // item text rendered as Markdown
  });
});

describe('buildAuditDigest → weekly section', () => {
  const v = (o) => JSON.stringify({ strategy_verdict: 'right', strategy_used: 'a', best_strategy: 'a', evidence: { answered: 'fully', cause: 'none' }, format_verdict: { fit: 'right' }, problems: [], ...o });
  it('library-data mistakes and gaps become backlog items; summary counts them', () => {
    const rows = [
      { status: 'done', usd: 0.5, session_id: 's1', round: 1, verdict_json: v({ strategy_verdict: 'wrong', best_strategy: 'b', problems: [{ where: 'library-data', kind: 'metadata', detail: 'wrong date on Tablet X' }] }) },
      { status: 'done', usd: 0.25, session_id: 's2', round: 1, verdict_json: v({ data_gap: { found: true, detail: 'no Persian original of Y' } }) },
      { status: 'error', usd: 0 },
    ];
    const d = buildAuditDigest(rows, { hours: 168, now: new Date('2026-11-09T06:45:00Z') });
    expect(d.lines[0]).toBe('Anís strategy audit — last 7 days');
    expect(d.stats).toMatchObject({ exchanges: 2, errors: 1, wrong: 1, mistakes: 1, library: 1 });
    expect(d.section.items).toEqual([{ kind: 'backlog', text: '[metadata] wrong date on Tablet X' }, { kind: 'backlog', text: 'Library gap: no Persian original of Y' }]);
    expect(d.section.summary).toBe('2 exchanges · 1 misroutes · 1 mistakes (1 in library data) · $0.75');
    expect(d.section.html).toMatch(/Anís strategy audit/);
  });
  it('a quiet week has no items and no html (nothing to show)', () => {
    const d = buildAuditDigest([], { hours: 168 });
    expect(d.section.items).toEqual([]);
    expect(d.section.html).toBe('');
  });
});

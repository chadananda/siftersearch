// Mail routing (Chad 11-03: "a weekly maintenance email with such suggestions flagged; daily or hourly emails only for issues
// that need addressed right away"). Each sender's new destination: urgent → api/lib/ops/alert.js actionRequired ([PAGE] /
// [ACTION]); everything else → the weekly queue (api/lib/ops/maintenance.js). No sender mails on its own any more.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { actionRequired } from '../../api/lib/ops/alert.js';
import { outbox } from '../../api/lib/dewey/jobs/notify.js';

const src = (f) => readFileSync(f, 'utf8');

describe('urgent senders → actionRequired', () => {
  it('system-checks: site/API/tunnel down = PAGE, other criticals = ACTION, through one path (no own sendEmail alarm)', () => {
    const s = src('scripts/system-checks.mjs');
    expect(s).toMatch(/PAGE_CHECKS = new Set\(\['API :7839', 'Public API \(tunnel\)', 'Site siftersearch\.com'\]\)/);
    expect(s).toMatch(/severity: hard\.some\(\(c\) => PAGE_CHECKS\.has\(c\.name\)\) \? 'page' : 'action'/);
    for (const name of ['API :7839', 'Public API (tunnel)', 'Site siftersearch.com']) expect(s).toContain(`add('${name}'`);   // the names exist
    expect(s).not.toMatch(/🔴|🟢/);
    // the only sendEmail left is the weekly maintenance mail
    expect(s.match(/sendEmail\(/g)).toHaveLength(1);
    expect(s).toMatch(/if \(SEND_WEEKLY\)/);
  });
  it('system-checks host criticals alarm; host warnings and other warnings go to the weekly queue', () => {
    const s = src('scripts/system-checks.mjs');
    expect(s).toMatch(/key: 'host-resources', quietMs: 0, severity: page \? 'page' : 'action'/);
    expect(s).toMatch(/queueMaintenance\(\{ source: 'host', key: `host:\$\{c\.key \|\| c\.name\}`/);
    expect(s).toMatch(/queueMaintenance\(\{ source: 'system-checks', key: `health:\$\{c\.name\}`/);
  });
  it('stall-guard HALTED, backup FAILED and service-worker job FAILED = ACTION', () => {
    expect(src('scripts/stall-guard.mjs')).toMatch(/actionRequired\(\{ key: 'stall-guard-halted', quietMs: 0, severity: 'action'/);
    expect(src('scripts/backup-daily.mjs')).toMatch(/actionRequired\(\{ key: 'backup-daily', quietMs: 0, severity: 'action'/);
    expect(src('api/lib/ops/service-worker.js')).toMatch(/actionRequired\(\{ key: `ops-job-\$\{run\.id\}-\$\{what\}`, quietMs: 0, severity: 'action'/);
    for (const f of ['scripts/stall-guard.mjs', 'scripts/backup-daily.mjs', 'api/lib/ops/service-worker.js']) expect(src(f)).not.toMatch(/sendEmail\(/);
  });
  it('actionRequired passes `pre` through (aligned plain reports stay monospaced) and prefixes the level', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alert-'));
    try {
      const sent = [];
      await actionRequired({ key: 'k1', subject: 'S', text: 'x', pre: true, severity: 'page' }, { dir, to: 'a@b', sendEmail: async (m) => sent.push(m) });
      await actionRequired({ key: 'k2', subject: 'S', text: 'x' }, { dir, to: 'a@b', sendEmail: async (m) => sent.push(m) });
      expect(sent[0]).toMatchObject({ subject: '[PAGE] S', pre: true });
      expect(sent[1].subject).toBe('[ACTION] S');
      expect('pre' in sent[1]).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('non-urgent senders → the weekly queue', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'maint-')); process.env.MAINTENANCE_DIR = dir; });
  afterEach(() => { delete process.env.MAINTENANCE_DIR; rmSync(dir, { recursive: true, force: true }); });

  it('stall-guard resumed, ingester segmentation over budget, audit-exchanges poor answer, ups replbatt queue', () => {
    expect(src('scripts/stall-guard.mjs')).toMatch(/queueMaintenance\(\{ source: 'stall-guard'/);
    expect(src('api/services/ingester.js')).toMatch(/queueMaintenance\(\{ source: 'segmentation', key: `segment-budget-/);
    const ax = src('scripts/audit/audit-exchanges.mjs');
    expect(ax).toMatch(/queueMaintenance\(\{ source: 'anis-audit', key: `anis-poor-answer-\$\{row\.id\}`/);
    expect(ax).not.toMatch(/sendEmail\(/);
    expect(src('scripts/ops/ups-mail.mjs')).toMatch(/if \(key === 'replbatt'\)[\s\S]{0,200}queueMaintenance\(\{ source: 'ups', key: 'ups-replbatt'/);
  });
  it('audit-digest writes a weekly section and mails nothing', () => {
    const s = src('scripts/audit/audit-digest.mjs');
    expect(s).toMatch(/audit-digest\.json/);
    expect(s).not.toMatch(/sendEmail|actionRequired/);
  });
  it('Dewey 80 % spend note: queued once a day, not mailed', async () => {
    const flags = { 'note80:2026-11-03': JSON.stringify({ spent: 8.2, ceiling: 10 }) }, queued = [];
    const repo = { noticeCandidates: async () => [], dayOf: () => '2026-11-03', getFlag: async (k) => flags[k] ?? null, setFlag: async (k, v) => { flags[k] = v; } };
    expect(await outbox({ repo, queue: (i) => queued.push(i) })).toEqual([]);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ source: 'dewey', key: 'dewey-note80:2026-11-03', title: 'Dewey used 82% of the 2026-11-03 spend ceiling' });
    expect(flags['note80-sent:2026-11-03']).toBeTruthy();
    await outbox({ repo, queue: (i) => queued.push(i) });
    expect(queued).toHaveLength(1);   // once
  });
});

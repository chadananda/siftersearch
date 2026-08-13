// A cron app declared in ecosystem.config.cjs never starts on its own: the updater applies deploys but never
// restarts ITSELF, so registration logic added there can't run. pipeline-snapshot (fresh process every 5 min)
// hosts this instead. These lock the two dangerous edges: it must not revive a deliberately-stopped process,
// and it must not touch anything outside its allowlist.
import { describe, it, expect } from 'vitest';
import { ensurePm2Apps, SELF_REGISTERING } from '../../scripts/lib/ensure-pm2-apps.mjs';

const runner = (known, { failStart = false } = {}) => {
  const calls = [];
  return {
    calls,
    run: async (cmd, args) => {
      calls.push(args.join(' '));
      if (args[0] === 'jlist') return { ok: true, stdout: JSON.stringify(known.map((name) => ({ name }))) };
      if (args[0] === 'startOrReload') return failStart ? { ok: false, stderr: 'boom' } : { ok: true, stdout: '' };
      return { ok: true, stdout: '' };
    },
  };
};

describe('ensurePm2Apps', () => {
  it('registers an app pm2 has never heard of', async () => {
    const r = runner(['siftersearch-api']);
    const out = await ensurePm2Apps('/srv', { run: r.run });
    expect(out.registered).toEqual(SELF_REGISTERING);
    expect(r.calls.filter((c) => c.startsWith('startOrReload'))).toHaveLength(SELF_REGISTERING.length);
    expect(r.calls).toContain('save');                       // survive a pm2 resurrect
  });

  it('does NOT revive a deliberately stopped process — known means leave alone', async () => {
    const r = runner(['siftersearch-api', ...SELF_REGISTERING]);
    const out = await ensurePm2Apps('/srv', { run: r.run });
    expect(out.registered).toEqual([]);
    expect(r.calls.some((c) => c.startsWith('startOrReload'))).toBe(false);
    expect(r.calls).not.toContain('save');                   // nothing changed, nothing to persist
  });

  it('touches ONLY the allowlist, never the retired workers', async () => {
    const r = runner(['siftersearch-api']);
    await ensurePm2Apps('/srv', { run: r.run });
    const started = r.calls.filter((c) => c.startsWith('startOrReload')).join(' ');
    for (const retired of ['siftersearch-enrichment', 'siftersearch-graph-extractor', 'siftersearch-library-watcher']) {
      expect(started).not.toContain(retired);
    }
  });

  it('degrades quietly when pm2 is unreachable or unparseable', async () => {
    const bad = await ensurePm2Apps('/srv', { run: async () => ({ ok: false, stderr: 'no pm2' }) });
    expect(bad.error).toMatch(/unavailable/);
    expect(bad.registered).toEqual([]);
    const junk = await ensurePm2Apps('/srv', { run: async () => ({ ok: true, stdout: 'not json' }) });
    expect(junk.error).toMatch(/unparseable/);
  });

  it('reports a failed start instead of claiming success', async () => {
    const r = runner(['siftersearch-api'], { failStart: true });
    const out = await ensurePm2Apps('/srv', { run: r.run });
    expect(out.registered).toEqual([]);
    expect(out.skipped.join(' ')).toMatch(/failed: boom/);
  });
});

// Global power read-only flag (db-write-path-20261023 § UPS): modes from the tmpfs file, the client refuses writes before
// any network, a 503 'read-only (power)' from the writer is the same verdict, telemetry is dropped (never queued), services
// park while held and start when it clears.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = mkdtempSync(join(tmpdir(), 'power-'));
const FILE = join(dir, 'power.json');
process.env.SIFTER_POWER_FILE = FILE;
const pm = await import('../../api/lib/power-mode.js');
const { postWriteBatch, createTelemetryQueue } = await import('../../api/lib/db.js');
const set = (mode) => { if (mode) writeFileSync(FILE, JSON.stringify({ mode, since: '2026-10-24T00:00:00Z', reason: 'test' })); else rmSync(FILE, { force: true }); pm._resetPowerCache(); };

beforeEach(() => set(null));
afterEach(() => { vi.unstubAllGlobals(); set(null); });

describe('power mode flag', () => {
  it('absent = normal; draining holds work but writes still land; readonly refuses writes', () => {
    expect(pm.powerMode()).toBe('normal');
    expect(pm.isPowerHold()).toBe(false);
    set('draining');
    expect([pm.isPowerHold(), pm.isPowerReadOnly()]).toEqual([true, false]);
    set('readonly');
    expect([pm.isPowerHold(), pm.isPowerReadOnly()]).toEqual([true, true]);
    expect(pm.powerLine()).toMatch(/^POWER: read-only mode since 2026-10-24/);
    writeFileSync(FILE, 'garbage'); pm._resetPowerCache();
    expect(pm.powerMode()).toBe('normal');   // unreadable = normal, never stuck read-only
  });

  it('a write is refused before any network when read-only (fatal, not a writer-down streak)', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    set('readonly');
    const e = await postWriteBatch([{ sql: 'INSERT INTO t VALUES (1)' }], 'x').then(() => null, (err) => err);
    expect(e).toMatchObject({ code: 'SIFTER_READONLY', readonly: true, fatal: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("the writer's 503 'read-only (power)' is the same verdict (a process that has not seen the flag yet)", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => '{"error":"read-only (power): tower is on UPS battery"}' })));
    const e = await postWriteBatch([{ sql: 'INSERT INTO t VALUES (1)' }], 'x').then(() => null, (err) => err);
    expect(e.readonly).toBe(true);
  });

  it('telemetry is dropped (counted) while read-only — never queued behind a refused writer', async () => {
    const post = vi.fn(async () => {});
    const q = createTelemetryQueue(post, { max: 100, delayMs: 60000, readOnly: () => true });
    q.push('INSERT INTO query_stats (hour) VALUES (?)', [1]);
    expect(await q.flush()).toBe(0);
    expect(post).not.toHaveBeenCalled();
    expect(q.dropped()).toBe(1);
  });

  it('a starting service parks while power is held and starts when the flag clears (resume); watchPower fires once', async () => {
    set('readonly');
    let sleeps = 0, parked = null;
    const done = await pm.waitForNormalPower({ every: 1, onPark: (s) => { parked = s.mode; }, sleep: async () => { if (++sleeps === 3) set(null); } });
    expect(done).toBe(true);
    expect(parked).toBe('readonly');
    expect(sleeps).toBe(3);
    expect(await pm.waitForNormalPower()).toBe(false);   // normal: no park
    const fired = [];
    const stop = pm.watchPower((s) => fired.push(s.mode), { every: 5 });
    set('draining');
    await new Promise((r) => setTimeout(r, 30));
    set('readonly');
    await new Promise((r) => setTimeout(r, 30));
    stop();
    expect(fired).toEqual(['draining']);
  });
});

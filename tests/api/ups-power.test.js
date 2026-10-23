// UPS power mode (db-write-path-20261023 § UPS): scripts/ops/ups-power.sh against fake upsc / pm2 / curl / sudo / systemctl.
// Inert without a UPS; enter only on battery (OB) → drain, read-only, flush (writer WAL, RAM disk, zpool sync, db-ship);
// resume only on stable mains (OL) → flag cleared, stopped apps started; idempotent. Plus the NUT debounce config.
import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let dir, log, flag;
const bin = (name, body) => { const f = join(dir, 'bin', name); writeFileSync(f, `#!/bin/bash\n${body}\n`); chmodSync(f, 0o755); };
const pm2json = JSON.stringify(['siftersearch-indexer', 'siftersearch-media', 'siftersearch-embedding', 'siftersearch-deep-research', 'siftersearch-api']
  .map((name) => ({ name, pm2_env: { status: 'online' } })).concat([{ name: 'siftersearch-library-watcher', pm2_env: { status: 'stopped' } }]));
function run(args, env = {}) {
  return spawnSync('bash', ['scripts/ops/ups-power.sh', ...args], { encoding: 'utf8', env: {
    ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, SIFTER_POWER_FILE: flag, SIFTER_DB_SHIP: join(dir, 'bin', 'db-ship'),
    SIFTER_UPS_MAIL: '/nonexistent', SIFTER_UPS_SLEEP: 'true', SIFTER_UPS_GRACE: '5', LOG: log, FAKE_PM2: pm2json, ...env } });
}
const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []);
const state = () => JSON.parse(readFileSync(flag, 'utf8'));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ups-'));
  spawnSync('mkdir', ['-p', join(dir, 'bin')]);
  log = join(dir, 'calls.log'); flag = join(dir, 'power.json');
  bin('upsc', '[ -n "${FAKE_UPS:-}" ] || exit 1; echo "$FAKE_UPS"');
  bin('pm2', 'echo "pm2 $*" >> "$LOG"; [ "$1" = jlist ] && echo "$FAKE_PM2"; exit 0');
  bin('curl', 'echo "curl $*" >> "$LOG"; case "$*" in *power/flush*) echo \'{"ok":true}\';; *"/power"*) echo \'{"quiet_ms":9000}\';; esac; exit 0');
  bin('sudo', 'echo "sudo $*" >> "$LOG"; exit 0');
  bin('systemctl', 'echo "systemctl $*" >> "$LOG"; [ "$1" = cat ] && [ "${FAKE_UNITS:-1}" = 1 ]');
  bin('logger', 'exit 0');
  bin('db-ship', 'echo "db-ship" >> "$LOG"');
  return () => rmSync(dir, { recursive: true, force: true });
});

describe('ups-power.sh', { timeout: 60_000 }, () => {
  it('is INERT with no UPS detected (no upsc answer): nothing done, exit 0', () => {
    const r = run(['enter']);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/no UPS detected .* — inert/);
    expect(existsSync(flag)).toBe(false);
    expect(calls()).toEqual([]);
  });

  it('enter on mains (debounce: power came back) does nothing', () => {
    run(['enter'], { FAKE_UPS: 'OL CHRG' });
    expect(existsSync(flag)).toBe(false);
    expect(calls().some((c) => /pm2 (stop|sendSignal)/.test(c))).toBe(false);
  });

  it('enter on battery: drains (SIGHUP to runService apps, stop for the rest), refuses writes, flushes RAM to disk', () => {
    const r = run(['enter'], { FAKE_UPS: 'OB DISCHRG' });
    expect(r.status).toBe(0);
    const c = calls();
    expect(c).toContain('pm2 sendSignal SIGHUP siftersearch-indexer');
    expect(c).toContain('pm2 sendSignal SIGHUP siftersearch-media');
    expect(c).toContain('pm2 stop siftersearch-embedding');
    expect(c).toContain('pm2 stop siftersearch-deep-research');
    expect(c.some((x) => /pm2 stop siftersearch-(library-watcher|api)/.test(x))).toBe(false);   // not online / a reader
    const flush = c.findIndex((x) => /curl .*-X POST .*\/power\/flush/.test(x));
    expect(flush).toBeGreaterThan(c.findIndex((x) => /pm2 stop siftersearch-embedding/.test(x)));       // flush after the drain
    expect(c).toContain('sudo -n systemctl start qram-flush.service');
    expect(c).toContain('sudo -n zpool sync');
    expect(c.at(-1)).toBe('db-ship');
    const s = state();
    expect(s).toMatchObject({ mode: 'readonly', stopped: ['siftersearch-deep-research', 'siftersearch-embedding'] });
    expect(s.flushed_at).toBeTruthy();
    // idempotent: a second event changes nothing
    const n = calls().length;
    expect(run(["enter"], { FAKE_UPS: "OB DISCHRG" }).stderr).toMatch(/already read-only and flushed/);
    expect(calls()).toHaveLength(n);
  });

  it('resume waits for stable mains, then clears the flag and starts what it stopped', () => {
    run(['enter'], { FAKE_UPS: 'OB DISCHRG' });
    run(['resume'], { FAKE_UPS: 'OB DISCHRG' });
    expect(state().mode).toBe('readonly');                       // still on battery: stays read-only
    run(['resume'], { FAKE_UPS: 'OL CHRG' });
    expect(existsSync(flag)).toBe(false);
    expect(calls()).toEqual(expect.arrayContaining(['pm2 start siftersearch-deep-research', 'pm2 start siftersearch-embedding']));
  });

  it('resume reloads the RAM disk when qdrant-hot does not answer', () => {
    run(['enter'], { FAKE_UPS: 'OB' });
    bin('curl', 'echo "curl $*" >> "$LOG"; case "$*" in *healthz*) exit 7;; esac; exit 0');
    run(['resume'], { FAKE_UPS: 'OL' });
    expect(calls()).toContain('sudo -n systemctl restart qdrant-hot.service');
  });
});

describe('NUT debounce + low-battery-only shutdown (deploy/nut)', () => {
  const conf = readFileSync('deploy/nut/upssched.conf', 'utf8');
  it('read-only only after 10 s on battery; resume only after 60 s on mains; each cancels the other', () => {
    expect(conf).toMatch(/AT ONBATT\s+\*\s+START-TIMER readonly 10/);
    expect(conf).toMatch(/AT ONLINE\s+\*\s+CANCEL-TIMER readonly/);
    expect(conf).toMatch(/AT ONLINE\s+\*\s+START-TIMER resume 60/);
    expect(conf).toMatch(/AT ONBATT\s+\*\s+CANCEL-TIMER resume/);
    expect(conf).not.toMatch(/powerdown/);   // no timed shutdown: the battery is for emergencies
  });
  it('shutdown only on LOW BATTERY: runtime ≤ 180 s or charge ≤ 10 %, through the flushing wrapper', () => {
    const ups = readFileSync('deploy/nut/ups.conf', 'utf8');
    expect(ups).toMatch(/override\.battery\.runtime\.low = 180/);
    expect(ups).toMatch(/override\.battery\.charge\.low = 10/);
    expect(readFileSync('deploy/nut/upsmon.conf', 'utf8')).toMatch(/SHUTDOWNCMD "\/usr\/local\/bin\/sifter-ups-shutdown"/);
    const cmd = readFileSync('deploy/nut/upssched-cmd', 'utf8');
    expect(cmd).toMatch(/readonly\)[^\n]*ups-power|readonly\).*\n?.*UPS_POWER enter/);
    expect(spawnSync('sh', ['-n', 'deploy/nut/upssched-cmd']).status).toBe(0);
    expect(spawnSync('sh', ['-n', 'deploy/nut/sifter-ups-shutdown']).status).toBe(0);
  });
});

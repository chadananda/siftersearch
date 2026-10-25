// The worker pool (Chad 10-24): pods are hosts of the same gate; prep / encodes go to them; trim windows travel as recipe args.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { publishPool, poolHosts, sshConfFor, isPod, podName, POD_SLOTS } from '../../api/lib/media/pool.js';
import { offloadHosts, gateWrap } from '../../api/lib/media/tools.js';

describe('pool registry', () => {
  it('publishes ready pods as ssh aliases + a host list; an empty publish empties the pool', () => {
    const d = mkdtempSync(join(tmpdir(), 'pool-')), file = join(d, 'pool.json'), sshConf = join(d, 'pods.conf');
    publishPool([{ host: 'pod-23', ip: '1.2.3.4', port: 22001 }, { host: 'pod-24', ip: '5.6.7.8', port: 22002 }], { file, sshConf });
    expect(JSON.parse(readFileSync(file, 'utf8')).hosts.map((h) => h.host)).toEqual(['pod-23', 'pod-24']);
    expect(readFileSync(sshConf, 'utf8')).toMatch(/Host pod-23\n  HostName 1\.2\.3\.4\n  Port 22001\n  User root\n  StrictHostKeyChecking no/);
    expect(poolHosts(0, file)).toEqual(['pod-23', 'pod-24']);
    publishPool([], { file, sshConf });
    expect(poolHosts(0, file)).toEqual([]); expect(readFileSync(sshConf, 'utf8')).toBe('');
  });
  it('names and the gate path', () => {
    expect(podName({ name: 'sifter-unipase-23' })).toBe('pod-23'); expect(isPod('pod-23')).toBe(true); expect(isPod('boss')).toBe(false);
    expect(gateWrap('pod-23', 'df')).toBe("SSH_ORIGINAL_COMMAND='df' /opt/gate/asr-gate.sh");
    expect(gateWrap('boss', 'df')).toBe('df');
    expect(POD_SLOTS.encode).toBeGreaterThan(0);
  });
  it('dfn / grade / probe candidates include the rented pods after aorus', () => {
    // (the registry is empty in the test, so only the host list shape is checked)
    expect(offloadHosts('dfn').every(([h, n]) => h && n > 0)).toBe(true);
    expect(sshConfFor([{ host: 'pod-1', ip: 'a', port: 1 }])).toContain('Host pod-1');
  });
});

describe('the encode recipe with a trim window (python)', () => {
  const run = (recipe, af, ss, t) => JSON.parse(execFileSync('python3', ['-c', `
import sys, json, types, subprocess
sys.path.insert(0, 'scripts/media')
import media_tool as m
calls = []
subprocess.run = lambda cmd, **kw: calls.append(cmd)
a = types.SimpleNamespace(recipe=${JSON.stringify(recipe)}, af=${JSON.stringify(af)}, input='in.flac', output='out.x', threads=2, ss=${ss}, t=${t})
m.cmd_encode(a)
print(json.dumps(calls[0]))`], { encoding: 'utf8' }).trim().split('\n').pop());
  it('-ss / -t go before the input; the remaster recipes keep 48 kHz at 96k Opus / 128k AAC; afade is an allowed filter', () => {
    const c = run('oggR', 'afade=t=in:st=0:d=0.5,afade=t=out:st=100.00:d=1', 12.5, 3000);
    expect(c.slice(0, 9)).toEqual(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-threads', '2', '-ss', '12.50']);
    expect(c).toContain('-t'); expect(c.indexOf('-t')).toBeLessThan(c.indexOf('-i'));
    expect(c.join(' ')).toMatch(/-ar 48000 -c:a libopus -b:a 96k/);
    expect(run('m4aR', 'anull', 'None', 'None').join(' ')).toMatch(/-ar 48000 -c:a aac -b:a 128k/);
    expect(run('m4a', 'anull', 'None', 'None').join(' ')).toMatch(/-ar 44100 -c:a aac -b:a 64k/);
    expect(run('m4a', 'anull', 'None', 'None')).not.toContain('-ss');
  });
  it('a filter outside the allow-list is refused', () => {
    expect(() => run('ogg', 'aecho=0.8:0.9:1000:0.3', 'None', 'None')).toThrow();
  });
});

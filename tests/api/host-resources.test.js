// system-checks host resources (10-23: aorus's disk filled, nothing alerted): disk 85/92 % + 24 h projection, memory/swap,
// OOM, load, GPU rules (tower = monitor only), unreachable, alert dedupe. Fixtures are trimmed real host-stat.sh output.
import { describe, it, expect } from 'vitest';
import { parseHostStat, filesystems, diskLevel, hoursToFull, pushSample, evaluateHost, alertPlan, unreachableCheck } from '../../scripts/lib/host-resources.mjs';

const TOWER = `@@version 1
@@host tower-nas
@@nproc 80
@@loadavg 2.16 16.35 25.93
@@meminfo
MemTotal:       197949836 kB
MemAvailable:   86270796 kB
SwapTotal:       8388604 kB
SwapFree:         995340 kB
@@df
tmpfs                  tmpfs       19794984       7728    19787256       1% /run
/dev/sdb2              ext4       228554124   96871032   120000328      45% /
efivarfs               efivarfs         256        101         151      40% /sys/firmware/efi/efivars
fast                   zfs        871589120  466384256   405204864      54% /fast
tank/media             zfs      15404490752  198350848 15206139904       2% /tank/media
tmpfs                  tmpfs       46137344    2292512    43844832       5% /srv/qram
@@zpool
fast\t953482739712\t509033050112\t444449689600
tank\t21990232555520\t6281709023232\t15708523532288
@@zfs
fast\t510643650560
fast/siftersearch-db\t32749289472
tank\t6287469178880
tank/media\t230236520448
@@du
2292512\t/srv/qram/storage
@@oomcount 0
@@oom
@@xid
@@nvsmi
Failed to initialize NVML: Driver/library version mismatch
NVML library version: 580.178
@@nvdev
btop
gnome-shell
mutter-x11-fram
snapd-desktop-i
xdg-desktop-por
Xorg
@@end`;

const AORUS = (usedKb = 90466704, availKb = 142035084, extra = '') => `@@version 1
@@host aorus
@@nproc 24
@@loadavg 2.16 4.66 7.45
@@meminfo
MemTotal:       15787140 kB
MemAvailable:   11951436 kB
SwapTotal:       4194300 kB
SwapFree:        3565344 kB
@@df
/dev/nvme0n1p2 ext4    245020956 ${usedKb}  ${availKb}      39% /
tmpfs          tmpfs     7893572      852    7892720       1% /tmp
tmpfs          tmpfs     7893568        0    7893568       0% /dev/shm
/dev/sda       ext4   3844551496 14246096 3634938088       1% /data
@@du
33711860\t/home/chad/media-gpu/jobs
29376\t/home/chad/media-gpu/tmp
@@oomcount 0
@@oom
@@xid
@@nvsmi
NVIDIA GeForce RTX 3070, 1058, 8192, 63, 12, [N/A]
@@nvdev
python
Xwayland
${extra}@@end`;

const BOSS_BTRFS = `@@df
/dev/mapper/root    btrfs     1998282752  314349192 1680166520      16% /
/dev/mapper/root    btrfs     1998282752  314349192 1680166520      16% /home
/dev/mapper/root    btrfs     1998282752  314349192 1680166520      16% /var/log
none                tmpfs           1024          0       1024       0% /run/credentials/x.service
@@end`;

const byName = (checks, part) => checks.find((c) => c.name.includes(part));

describe('disk thresholds', () => {
  it('warn at 85 %, critical at 92 %', () => {
    expect(diskLevel(84.9)).toBe('ok');
    expect(diskLevel(85)).toBe('warn');
    expect(diskLevel(91.9)).toBe('warn');
    expect(diskLevel(92)).toBe('critical');
    expect(diskLevel(100)).toBe('critical');
  });
  it('aorus root at 100 % (16:09) → CRITICAL naming the media jobs dir', () => {
    const { checks } = evaluateHost('aorus', parseHostStat(AORUS(245020956, 0)), { role: 'compute', prev: { du: { '/home/chad/media-gpu/jobs': 10 * 1024 ** 3 } } });
    const d = byName(checks, 'disk /');
    expect(d.ok).toBe(false);
    expect(d.level).toBe('critical');
    expect(d.detail).toMatch(/media-gpu\/jobs \+/);
  });
  it('aorus root at 87 % → WARN', () => {
    const { checks } = evaluateHost('aorus', parseHostStat(AORUS(213168232, 31852724)), { role: 'compute' });
    expect(byName(checks, 'disk /')).toMatchObject({ ok: false, level: 'warn' });
  });
});

describe('which filesystems', () => {
  it('zfs as pools, tmpfs only /tmp and /srv/* (tower qram), efivarfs/run skipped', () => {
    const ids = filesystems(parseHostStat(TOWER)).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['pool:fast', 'pool:tank', '/', '/srv/qram']));
    expect(ids).not.toContain('/run');
    expect(ids).not.toContain('/tank/media');
    expect(ids.some((i) => i.includes('efivars'))).toBe(false);
  });
  it('btrfs subvolume mounts of one device collapse to one row', () => {
    const fs = filesystems(parseHostStat(BOSS_BTRFS));
    expect(fs.map((f) => f.id)).toEqual(['/']);
  });
});

describe('fill-rate projection', () => {
  const H = 3_600_000, G = 1024 ** 3;
  it('5 GB/h with 50 GB free → 10 h → WARN even at 39 %', () => {
    const samples = [{ t: 0, used: 100 * G }, { t: H, used: 105 * G }, { t: 2 * H, used: 110 * G }];
    expect(hoursToFull(samples, 50 * G)).toBeCloseTo(10);
    const s = parseHostStat(AORUS());
    const used = s.df[0].used;
    const prev = { samples: { '/': [{ t: 0, used: used - 30 * G }, { t: H, used: used - 15 * G }] } };
    const { checks } = evaluateHost('aorus', s, { role: 'compute', prev, now: 2 * H });
    expect(byName(checks, 'disk /')).toMatchObject({ ok: false, level: 'warn' });
    expect(byName(checks, 'disk /').detail).toMatch(/FILLING: full in ~/);
  });
  it('slow growth (full in days), shrinking, or samples too close together → no projection', () => {
    expect(hoursToFull([{ t: 0, used: 0 }, { t: H, used: G }], 100 * G)).toBe(100);
    expect(hoursToFull([{ t: 0, used: 2 * G }, { t: H, used: G }], 10 * G)).toBeNull();
    expect(hoursToFull([{ t: 0, used: 0 }, { t: 10 * 60_000, used: 50 * G }], 10 * G)).toBeNull();
  });
  it('keeps the last 6 samples', () => {
    let s = [];
    for (let i = 0; i < 9; i++) s = pushSample(s, i, i);
    expect(s.map((x) => x.t)).toEqual([3, 4, 5, 6, 7, 8]);
  });
});

describe('memory, OOM, load', () => {
  it('idle swap occupancy does not warn while RAM has headroom', () => {
    const m = byName(evaluateHost('tower', parseHostStat(TOWER), { role: 'monitor' }).checks, 'memory');
    expect(m.ok).toBe(true);
    expect(m.detail).toMatch(/occupancy alone/);
    expect(m.detail).not.toMatch(/LOW MEMORY/);
  });
  it('under 10 % RAM available → WARN', () => {
    const s = parseHostStat(AORUS().replace('MemAvailable:   11951436', 'MemAvailable:   1000000'));
    expect(byName(evaluateHost('aorus', s, { role: 'compute' }).checks, 'memory').detail).toMatch(/LOW MEMORY/);
  });
  it('OOM kills since the last check → WARN with the victim', () => {
    const s = parseHostStat(AORUS().replace('@@oomcount 0\n@@oom\n', '@@oomcount 2\n@@oom\nOct 23 17:28:17 aorus kernel: Out of memory: Killed process 1370034 (python) total-vm:6886644kB, anon-rss:4458992kB, file-rss:12kB\n'));
    const o = byName(evaluateHost('aorus', s, { role: 'compute' }).checks, 'OOM');
    expect(o).toMatchObject({ ok: false, level: 'warn' });
    expect(o.detail).toMatch(/2 process.*python at Oct 23 17:28:17/);
  });
  it('15-min load over 1.5 × cores → WARN', () => {
    expect(byName(evaluateHost('aorus', parseHostStat(AORUS()), { role: 'compute' }).checks, 'load').ok).toBe(true);
    const s = parseHostStat(AORUS().replace('@@loadavg 2.16 4.66 7.45', '@@loadavg 40 39 36.5'));
    expect(byName(evaluateHost('aorus', s, { role: 'compute' }).checks, 'load')).toMatchObject({ ok: false, level: 'warn' });
  });
});

describe('GPU rules', () => {
  it("tower: display + btop only → ok; driver mismatch → informational WARN", () => {
    const { checks } = evaluateHost('tower', parseHostStat(TOWER), { role: 'monitor' });
    expect(byName(checks, 'GPU compute').ok).toBe(true);
    expect(byName(checks, 'GPU driver')).toMatchObject({ ok: false, level: 'warn' });
    expect(byName(checks, 'GPU driver').detail).toMatch(/reboot/);
  });
  it('tower: a python / ollama process on the GPU → CRITICAL', () => {
    const { checks } = evaluateHost('tower', parseHostStat(TOWER.replace('Xorg\n', 'Xorg\npython3\nollama\n')), { role: 'monitor' });
    const g = byName(checks, 'GPU compute');
    expect(g).toMatchObject({ ok: false, level: 'critical' });
    expect(g.detail).toMatch(/python3, ollama/);
  });
  it('aorus: VRAM >95 % alerts only when sustained (two checks)', () => {
    const s = parseHostStat(AORUS().replace('1058, 8192', '8000, 8192'));
    const first = evaluateHost('aorus', s, { role: 'compute' });
    expect(byName(first.checks, ' GPU').ok).toBe(true);
    const second = evaluateHost('aorus', s, { role: 'compute', prev: first.state });
    expect(byName(second.checks, ' GPU')).toMatchObject({ ok: false, level: 'warn' });
  });
  it('aorus: >85°C, ECC errors or an Xid → WARN', () => {
    const hot = parseHostStat(AORUS().replace(', 63, 12,', ', 88, 12,'));
    expect(byName(evaluateHost('aorus', hot, { role: 'compute' }).checks, ' GPU').detail).toMatch(/HOT/);
    const ecc = parseHostStat(AORUS().replace('[N/A]', '3'));
    expect(byName(evaluateHost('aorus', ecc, { role: 'compute' }).checks, ' GPU').detail).toMatch(/ECC ERRORS/);
    const xid = parseHostStat(AORUS().replace('@@xid\n', '@@xid\nOct 23 kernel: NVRM: Xid (PCI:0000:01:00): 79, GPU has fallen off the bus\n'));
    expect(byName(evaluateHost('aorus', xid, { role: 'compute' }).checks, ' GPU').ok).toBe(false);
  });
  it('boss: GPU never alerts', () => {
    const { checks } = evaluateHost('boss', parseHostStat(AORUS().replace(', 63, 12,', ', 99, 12,')), { role: 'none' });
    expect(checks.filter((c) => /GPU/.test(c.name)).every((c) => c.ok)).toBe(true);
  });
});

describe('unreachable', () => {
  it('once is info, twice running is WARN — and never says "down"', () => {
    const a = unreachableCheck('boss', 0);
    expect(a.check).toMatchObject({ ok: true, level: 'info' });
    const b = unreachableCheck('boss', a.misses);
    expect(b.check).toMatchObject({ ok: false, level: 'warn' });
    expect(b.check.detail).toMatch(/unreachable from tower/);
    expect(b.check.detail).not.toMatch(/\bdown\b/);
  });
});

describe('alert dedupe', () => {
  const c = (key, level, ok = false) => ({ key, name: key, level, ok, detail: '' });
  it('a condition mails once, again on escalation, not on flapping back; a cleared one re-arms', () => {
    let p = alertPlan([c('aorus:disk /', 'warn')], {});
    expect(p.send.map((x) => x.key)).toEqual(['aorus:disk /']);
    p = alertPlan([c('aorus:disk /', 'warn')], p.seen);
    expect(p.send).toEqual([]);
    p = alertPlan([c('aorus:disk /', 'critical')], p.seen);
    expect(p.send.map((x) => x.level)).toEqual(['critical']);
    p = alertPlan([c('aorus:disk /', 'warn')], p.seen);
    expect(p.send).toEqual([]);
    p = alertPlan([c('aorus:disk /', 'critical')], p.seen);
    expect(p.send).toEqual([]);
    p = alertPlan([c('aorus:disk /', 'ok', true)], p.seen);
    expect(p.seen).toEqual({});
    p = alertPlan([c('aorus:disk /', 'warn')], p.seen);
    expect(p.send.length).toBe(1);
  });
  it('info and passing checks never mail', () => {
    expect(alertPlan([c('a', 'info'), c('b', 'warn', true)], {}).send).toEqual([]);
  });
});

describe('docker data room (10-25: a 64 GB image filled aorus root)', () => {
  const snap = (availKb, ver = 1) => `@@version ${ver}\n@@host h\n@@nproc 8\n@@loadavg 1 1 1\n@@dockerroot /var/lib/docker\n@@meminfo\nMemTotal: 1000 kB\nMemAvailable: 900 kB\n@@df\n/dev/x ext4 244000000 ${244000000 - availKb} ${availKb} 50% /\n`;
  it('warns under 30 GB free where docker keeps images, critical under 10', async () => {
    const m = await import('../../scripts/lib/host-resources.mjs');
    const ev = (kb) => m.evaluateHost('aorus', m.parseHostStat(snap(kb, m.HOST_STAT_VERSION)), { role: 'compute', expectVersion: m.HOST_STAT_VERSION }).checks.find((c) => c.name === 'aorus docker data');
    expect(ev(20 * 1048576)).toMatchObject({ ok: false, level: 'warn' });
    expect(ev(5 * 1048576)).toMatchObject({ ok: false, level: 'critical' });
    expect(ev(100 * 1048576).ok).toBe(true);
  });
});

describe('boss memory is TWO pools (Chad 10-28)', () => {
  const GiB = 1024 ** 3;
  const text = (o = {}) => [`@@version 2`, `@@host Boss`, `@@nproc 32`, `@@loadavg 2 2 2`, `@@psi`, `some avg10=${o.some ?? 0} avg60=0.00 avg300=0.00 total=1`, `full avg10=${o.full ?? 0} avg60=0.00 avg300=0.00 total=1`,
    `@@zram`, `/dev/zram0 33413922816 50634752 14700544`, `@@amd`, `mem_info_vram_total ${96 * GiB}`, `mem_info_vram_used ${(o.vram ?? 13) * GiB}`, `mem_info_gtt_total ${15.56 * GiB}`, `mem_info_gtt_used ${0.08 * GiB}`, `gpu_busy_percent 100`, `edge_temp_mc 66000`,
    `@@vramproc`, `27533 6065732 8252 2246848 /mnt/data4tb/remaster-rnd/venvs/rocm/bin/python unipase_job.py jobs/um-x`, `@@svc`, `llama-coder [not set] 23742345216`, `laya 2475548672 2833276928`, `ours-capped-scopes 1904271360 -`,
    `@@meminfo`, `MemTotal: 32631588 kB`, `MemAvailable: ${(o.avail ?? 17) * 1048576} kB`, `SwapTotal: 65262372 kB`, `SwapFree: 65211216 kB`, `@@df`, `/dev/x ext4 1000000000 100000000 900000000 10% /`].join('\n');
  it('reads both pools, pressure, per-process VRAM and the services, and labels them plainly', async () => {
    const m = await import('../../scripts/lib/host-resources.mjs');
    const s = m.parseHostStat(text());
    expect(s.amd.mem_info_vram_total).toBe(96 * GiB); expect(s.psi.some.avg10).toBe(0); expect(s.vramProc[0]).toMatchObject({ pid: 27533, vramKb: 6065732 });
    expect(s.svc['llama-coder'].peak).toBe(23742345216); expect(s.zram[0].total).toBe(14700544);
    const p = m.memoryPools(s);
    expect(p.label).toMatch(/system RAM \d+(\.\d)? of 31(\.1)? GB used \(17 GB available\)/);
    expect(p.label).toMatch(/memory pressure some 0 % \/ full 0 %/); expect(p.label).toMatch(/GPU VRAM 13 of 96 GB used/); expect(p.label).toMatch(/GTT 0\.1 of 15\.6 GB used/);
    expect(p.label).toMatch(/llama-coder idle GB now \/ peak 22\.1 GB|llama-coder idle GB now/); expect(p.label).toMatch(/top VRAM: .*unipase_job\.py/); expect(p.ok).toBe(true);
  });
  it('warns on pressure / low MemAvailable / full VRAM, critical on heavy stalls', async () => {
    const m = await import('../../scripts/lib/host-resources.mjs');
    const lv = (o) => { const p = m.memoryPools(m.parseHostStat(text(o))); return p.ok ? 'ok' : p.level; };
    expect(lv({})).toBe('ok'); expect(lv({ some: 6 })).toBe('warn'); expect(lv({ avail: 6 })).toBe('warn'); expect(lv({ vram: 93 })).toBe('warn');
    expect(lv({ some: 25 })).toBe('critical'); expect(lv({ avail: 2 })).toBe('critical'); expect(lv({ full: 2 })).toBe('warn');
  });
});

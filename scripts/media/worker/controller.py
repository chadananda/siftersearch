# Live feedback controller for a media worker (Chad 10-24: concurrency from LIVE measurements, never a startup estimate).
# Samples VRAM / GPU util+temp / CPU / RAM+swap / disk / OOM events; admits a job only with live headroom for its stage; AIMD:
# multiplicative decrease the moment pressure shows, additive increase after a stable window; repeated failures -> 1 -> drain.
# Pure logic + an injectable sampler, so fault injection (low VRAM, RAM pressure, OOM) is a unit test, not a hope.
import os, subprocess, time

# measured per-stage needs (GB of VRAM / RAM) — UniPASE 3.2-4.1, ASR 2-3.5, diarize 1.5 (planning/remaster-rnd-20261023.md, media-gpu-host tests)
STAGES = {
    'preview': {'vram': 1.0, 'ram': 1.5},
    'unipase': {'vram': 4.2, 'ram': 3.0},
    'asr':     {'vram': 3.5, 'ram': 2.5},
    'diarize': {'vram': 1.8, 'ram': 2.0},
    'realign': {'vram': 1.5, 'ram': 2.0},
    'guard':   {'vram': 0.0, 'ram': 2.5},      # numpy / ffmpeg on the CPU
    'encode':  {'vram': 0.0, 'ram': 0.6},
    'grade':   {'vram': 1.5, 'ram': 1.5},
}
LIMITS = {'vram_pct': 90, 'ram_pct': 90, 'temp_c': 83, 'disk_free_gb': 5, 'margin_gb': 0.5}


def read_nvidia():
    try:
        o = subprocess.run(['nvidia-smi', '--query-gpu=memory.used,memory.total,utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'],
                           capture_output=True, text=True, timeout=5).stdout.strip().splitlines()[0]
        u, t, g, c = [float(x) for x in o.split(',')]
        return {'vram_used_gb': u / 1024, 'vram_total_gb': t / 1024, 'gpu_util': g, 'temp_c': c}
    except Exception:
        return {'vram_used_gb': 0.0, 'vram_total_gb': 0.0, 'gpu_util': 0.0, 'temp_c': 0.0}


def read_system():
    mem = {}
    try:
        for line in open('/proc/meminfo'):
            k, v = line.split(':'); mem[k] = float(v.split()[0]) / 1048576
    except Exception:
        pass
    st = os.statvfs('/workspace') if os.path.exists('/workspace') else os.statvfs('/')
    total, available = mem.get('MemTotal', 0), mem.get('MemAvailable', 0)
    cpus = os.cpu_count() or 1
    # Container limits, not the host's hundreds of GB/cores, govern admission.
    for limit_file, used_file in [('/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory.current'),
                                  ('/sys/fs/cgroup/memory/memory.limit_in_bytes', '/sys/fs/cgroup/memory/memory.usage_in_bytes')]:
        try:
            limit = int(open(limit_file).read()) / 2**30
            used = int(open(used_file).read()) / 2**30
            if 0 < limit < total: total, available = limit, min(available, max(0, limit - used))
            break
        except (OSError, ValueError): pass
    try:
        quota, period = open('/sys/fs/cgroup/cpu.max').read().split()
        if quota != 'max': cpus = min(cpus, max(1, int(quota) / int(period)))
    except (OSError, ValueError):
        try:
            quota = int(open('/sys/fs/cgroup/cpu/cpu.cfs_quota_us').read())
            period = int(open('/sys/fs/cgroup/cpu/cpu.cfs_period_us').read())
            if quota > 0: cpus = min(cpus, max(1, quota / period))
        except (OSError, ValueError): pass
    return {'ram_total_gb': total, 'ram_avail_gb': available,
            'swap_used_gb': mem.get('SwapTotal', 0) - mem.get('SwapFree', 0),
            'disk_free_gb': st.f_bavail * st.f_frsize / 1e9, 'load': os.getloadavg()[0], 'cpus': cpus}


def oom_count():
    """OOM kills seen in the kernel log (0 where dmesg is not readable)."""
    try:
        return subprocess.run(['dmesg'], capture_output=True, text=True, timeout=5).stdout.lower().count('out of memory')
    except Exception:
        return 0


def sample():
    s = {**read_nvidia(), **read_system()}
    s['oom'] = oom_count()
    return s


class Controller:
    """admit(stage) -> bool; tick() every few seconds; job_started/finished/failed from the runner. `limit` is the live concurrency ceiling."""

    def __init__(self, sampler=sample, now=time.time, max_jobs=8, stable_s=240, limits=None, stages=None):
        self.sampler, self.now, self.max_jobs, self.stable_s = sampler, now, max_jobs, stable_s
        self.limits = {**LIMITS, **(limits or {})}; self.stages = stages or STAGES
        self.limit = 1; self.running = {}      # job -> {stage, started}
        self.last = self.sampler(); self.calm_since = now(); self.oom_seen = self.last.get('oom', 0)
        self.failures = []; self.state = 'ok'; self.events = []; self.admitting = True

    def _pressure(self, s):
        L = self.limits; why = []
        if s['vram_total_gb'] and s['vram_used_gb'] / s['vram_total_gb'] * 100 > L['vram_pct']: why.append('vram')
        if s['ram_total_gb'] and (1 - s['ram_avail_gb'] / s['ram_total_gb']) * 100 > L['ram_pct']: why.append('ram')
        if s['swap_used_gb'] > self.last.get('swap_used_gb', 0) + 0.25: why.append('swap')
        if s['temp_c'] > L['temp_c']: why.append('temp')
        if s.get('oom', 0) > self.oom_seen: why.append('oom')
        if s['disk_free_gb'] < L['disk_free_gb']: why.append('disk')
        return why

    def tick(self):
        """-> list of job ids to re-queue (the youngest, when the pressure is bad enough to shed one)."""
        s = self.sampler(); t = self.now(); shed = []
        why = self._pressure(s)
        if why:
            self.limit = max(1, self.limit // 2); self.calm_since = t; self.admitting = False
            self.events.append({'at': t, 'pressure': why, 'limit': self.limit})
            if self.state == 'ok': self.state = 'pressure'
            if len(self.running) > self.limit and ('oom' in why or 'vram' in why or 'ram' in why):
                shed = [j for j, _ in sorted(self.running.items(), key=lambda kv: -kv[1]['started'])[:len(self.running) - self.limit]]
        else:
            self.admitting = True
            if t - self.calm_since >= self.stable_s and self.limit < self.max_jobs:
                self.limit += 1; self.calm_since = t; self.state = 'ok'      # additive increase, slowly
        self.oom_seen = max(self.oom_seen, s.get('oom', 0)); self.last = s
        return shed

    def admit(self, stage):
        """Live headroom must cover this stage's need plus a safety margin, and we must be under the live limit."""
        gpu = [j for j, r in self.running.items() if self.stages[r['stage']]['vram'] > 0 and r['stage'] != 'realign']   # the CPU half of a job never blocks the next GPU job
        if not self.admitting or (self.stages[stage]['vram'] > 0 and len(gpu) >= self.limit) or self.state == 'drain': return False
        s = self.sampler(); need = self.stages[stage]; m = self.limits['margin_gb']
        free_vram = s['vram_total_gb'] * self.limits['vram_pct'] / 100 - s['vram_used_gb']
        if need['vram'] and s['vram_total_gb'] and free_vram < need['vram'] + m: return False
        if s['ram_avail_gb'] < need['ram'] + m + s['ram_total_gb'] * (1 - self.limits['ram_pct'] / 100): return False
        return True

    def job_started(self, job, stage): self.running[job] = {'stage': stage, 'started': self.now()}
    def job_finished(self, job): self.running.pop(job, None)

    def job_failed(self, job, reason='error'):
        """A failed job is always re-queued by the caller. Repeated failures: limit 1, then drain (the pod is replaced)."""
        self.running.pop(job, None); t = self.now()
        self.failures = [f for f in self.failures if t - f < 900] + [t]
        if len(self.failures) >= 3: self.limit = 1; self.state = 'unstable'
        if len(self.failures) >= 6: self.state = 'drain'
        self.events.append({'at': t, 'failed': job, 'reason': reason})

    def heartbeat(self):
        """The live numbers tower keeps in the ledger and /ops/services."""
        s = self.last
        return {'limit': self.limit, 'running': len(self.running), 'state': self.state, 'admitting': self.admitting, 'gpu_util': s['gpu_util'], 'temp_c': s['temp_c'],
                'vram_used_gb': round(s['vram_used_gb'], 2), 'vram_total_gb': round(s['vram_total_gb'], 2), 'ram_avail_gb': round(s['ram_avail_gb'], 1),
                'swap_used_gb': round(s['swap_used_gb'], 2), 'disk_free_gb': round(s['disk_free_gb'], 1), 'load': s['load'], 'failures_15m': len(self.failures)}


class Leak:
    """A worker whose resident memory climbs across jobs recycles its process between jobs."""
    def __init__(self, grow_gb=1.5): self.base = None; self.grow = grow_gb
    def check(self, rss_gb):
        if self.base is None: self.base = rss_gb; return False
        return rss_gb - self.base > self.grow

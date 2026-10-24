# Remaster R&D shared helpers: audio IO, resource guard for the SHARED aorus GPU, chunked overlap-add (no word is cut at a
# chunk edge), lag/gain alignment and wet/dry + band-split blending. numpy + soundfile; scipy imported lazily (venv-dfn has none).
import os, subprocess, time
import numpy as np
import soundfile as sf

SR = 48000


def read(path, sr=SR):
    x, s = sf.read(path, dtype='float32', always_2d=True)
    x = x.mean(axis=1)
    if s != sr:
        from scipy.signal import resample_poly
        g = np.gcd(s, sr)
        x = resample_poly(x, sr // g, s // g).astype(np.float32)
    return x


def write(path, x, sr=SR):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    sf.write(path, np.asarray(x, dtype=np.float32), sr, subtype='FLOAT')


def _amd_vram():
    """(total, used) bytes of the AMD iGPU's VRAM carve-out (boss, gfx1151), or None."""
    import glob
    for d in glob.glob('/sys/class/drm/card*/device'):
        try:
            return int(open(f'{d}/mem_info_vram_total').read()), int(open(f'{d}/mem_info_vram_used').read())
        except OSError:
            continue
    return None


def free_vram_gb():
    a = _amd_vram()
    if a:
        return (a[0] - a[1]) / 2 ** 30
    try:
        r = subprocess.run(['nvidia-smi', '--query-gpu=memory.free', '--format=csv,noheader,nounits'], capture_output=True, text=True)
        return int(r.stdout.split()[0]) / 1024
    except Exception:
        return 0.0


def gpu_temp():
    if _amd_vram():   # boss: the APU's die temperature is the CPU's Tctl (the GPU shares the package)
        try:
            out = subprocess.run(['sensors'], capture_output=True, text=True).stdout
            return int(float(next(l.split('+')[1].split('°')[0] for l in out.splitlines() if l.strip().startswith('Tctl'))))
        except Exception:
            return None
    try:
        r = subprocess.run(['nvidia-smi', '--query-gpu=temperature.gpu', '--format=csv,noheader,nounits'], capture_output=True, text=True)
        return int(r.stdout.split()[0])
    except Exception:
        return None


def cool(hot=None, ok=None):
    """aorus runs hot (10-23: 88 °C, throttling): never start GPU work at >= 83 °C, resume at 78. boss's package idles at
    ~94 °C under production ASR: pause at >= 95, resume at 93 (Chad 10-23)."""
    amd = bool(_amd_vram())
    hot = hot or (95 if amd else 83)
    ok = ok or (93 if amd else 78)
    t = gpu_temp()
    if t is None or t < hot:
        return
    while t is not None and t > ok:
        print(f'GPU {t} °C: cooling', flush=True)
        time.sleep(20)
        t = gpu_temp()


def free_ram_gb():
    for line in open('/proc/meminfo'):
        if line.startswith('MemAvailable:'):
            return int(line.split()[1]) / 2 ** 20
    return 0.0


def wait_resources(vram=3.0, ram=4.0, max_wait=1800):
    """Production shares this card: start a model only with >= `vram` GB VRAM and >= `ram` GB RAM free; else wait.
    On boss the VRAM floor is raised by 50 GB: the local LLM (llama.cpp, 49 GB) must always be able to come back."""
    if _amd_vram():
        vram += 50.0
    t0 = time.time()
    while True:
        v, r = free_vram_gb(), free_ram_gb()
        if v >= vram and r >= ram:
            cool()
            return v, r
        if time.time() - t0 > max_wait:
            raise RuntimeError(f'resources not free after {max_wait}s (VRAM {v:.1f} GB, RAM {r:.1f} GB)')
        print(f'waiting: VRAM {v:.1f} GB, RAM {r:.1f} GB', flush=True)
        time.sleep(15)


def chunked(x, sr, fn, chunk_s=10.0, overlap_s=1.0):
    """Run fn(chunk)->same-length chunk over x in overlapping windows, raised-cosine crossfaded (overlap-add)."""
    n, ov = int(chunk_s * sr), int(overlap_s * sr)
    if len(x) <= n:
        return fn(x)[: len(x)]
    hop = n - ov
    out = np.zeros(len(x) + n, dtype=np.float64)
    wsum = np.zeros_like(out)
    fade = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, ov))
    for s in range(0, len(x), hop):
        seg = x[s: s + n]
        cool()
        y = np.asarray(fn(seg), dtype=np.float64)[: len(seg)]
        if len(y) < len(seg):
            y = np.pad(y, (0, len(seg) - len(y)))
        L = len(seg)
        w = np.ones(L)
        if s > 0:
            k = min(ov, L)
            w[:k] = fade[:k]
        last = s + n >= len(x)
        if not last:          # L == n here, so the fade-out fits
            w[-ov:] = fade[::-1]
        out[s: s + L] += y * w
        wsum[s: s + L] += w
        if last:
            break
    return (out[: len(x)] / np.maximum(wsum[: len(x)], 1e-6)).astype(np.float32)


def speech_rms(x, sr=SR):
    n = int(sr * 0.025)
    f = x[: len(x) // n * n].reshape(-1, n)
    e = np.mean(f ** 2, axis=1)
    loud = e[e >= np.percentile(e, 70)]
    return float(np.sqrt(np.mean(loud) + 1e-12))


def align(dry, wet, sr=SR, max_lag_ms=60):
    from scipy.signal import butter, sosfiltfilt, correlate
    """Shift wet to dry by the cross-correlation peak (models add latency); match its speech level. → wet', lag, corr."""
    m = min(len(dry), len(wet))
    d, w = dry[:m], wet[:m]
    L = int(sr * max_lag_ms / 1000)
    sos = butter(4, [200, 3500], 'bandpass', fs=sr, output='sos')   # correlate in the speech band
    db, wb = sosfiltfilt(sos, d), sosfiltfilt(sos, w)
    c = correlate(db, wb, mode='full', method='fft')
    mid = len(wb) - 1
    seg = c[mid - L: mid + L + 1]
    lag = int(np.argmax(np.abs(seg)) - L)
    w2 = np.roll(wet, lag)[: len(dry)]
    if len(w2) < len(dry):
        w2 = np.pad(w2, (0, len(dry) - len(w2)))
    corr = float(np.corrcoef(sosfiltfilt(sos, w2), db if len(db) == len(dry) else sosfiltfilt(sos, dry))[0, 1])
    g = speech_rms(dry, sr) / max(speech_rms(w2, sr), 1e-9)
    return (w2 * g).astype(np.float32), lag, corr


def mix(dry, wet, w):
    """Parallel (wet/dry) mix — the dry path keeps every original syllable."""
    return ((1 - w) * dry + w * wet).astype(np.float32)


def band_split(x, fc, sr=SR):
    from scipy.signal import butter, sosfiltfilt
    lo = sosfiltfilt(butter(4, fc, 'lowpass', fs=sr, output='sos'), x)
    return lo.astype(np.float32), (x - lo).astype(np.float32)


def hf_blend(base, gen, fc, sr=SR, gain_db=0.0):
    """Keep `base` below fc, take the generated (bandwidth-extended) content above fc: the words stay the original's."""
    lo, _ = band_split(base, fc, sr)
    _, hi = band_split(gen, fc, sr)
    return (lo + hi * 10 ** (gain_db / 20)).astype(np.float32)


def env_align(dry, wet, sr=SR, max_lag_ms=100):
    """Lag by 5 ms log-energy ENVELOPE correlation — for generative outputs, whose waveforms do not correlate with the input
    (speech-band corr ~0.05) but whose syllable timing does (env corr ~0.8). → wet shifted + level-matched, lag, env corr."""
    n = int(sr * 0.005)
    def env(x):
        x = x[: len(x) // n * n].reshape(-1, n)
        e = np.log(np.mean(x ** 2, axis=1) + 1e-9)
        return e - e.mean()
    ed, ew = env(dry), env(wet)
    m = min(len(ed), len(ew))
    ed, ew = ed[:m], ew[:m]
    L = int(max_lag_ms / 5)
    c = np.array([np.dot(ed[max(0, k):m + min(0, k)], ew[max(0, -k):m - max(0, k)]) for k in range(-L, L + 1)])
    k = int(np.argmax(c) - L)
    corr = float(c.max() / np.sqrt((ed ** 2).sum() * (ew ** 2).sum()))
    w2 = np.roll(wet, k * n)[: len(dry)]
    if len(w2) < len(dry):
        w2 = np.pad(w2, (0, len(dry) - len(w2)))
    g = speech_rms(dry, sr) / max(speech_rms(w2, sr), 1e-9)
    return (w2 * g).astype(np.float32), k * n, corr

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


def free_vram_gb():
    try:
        r = subprocess.run(['nvidia-smi', '--query-gpu=memory.free', '--format=csv,noheader,nounits'], capture_output=True, text=True)
        return int(r.stdout.split()[0]) / 1024
    except Exception:
        return 0.0


def gpu_temp():
    try:
        r = subprocess.run(['nvidia-smi', '--query-gpu=temperature.gpu', '--format=csv,noheader,nounits'], capture_output=True, text=True)
        return int(r.stdout.split()[0])
    except Exception:
        return None


def cool(hot=83, ok=78):
    """aorus runs hot (10-23: 88 °C, throttling): never start GPU work at >= `hot` °C; wait until it is back to `ok`."""
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
    """Production shares this card: start a model only with >= `vram` GB VRAM and >= `ram` GB RAM free; else wait."""
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

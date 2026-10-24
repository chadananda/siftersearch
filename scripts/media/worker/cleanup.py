# DETERMINISTIC CLEANUP — the fallback for talks the word guard holds (Chad 10-24: "still improve, with no risk of changed words").
# Chad's gentle chain "F" (R&D round 3, scripts/media/remaster-rnd/tube3.py): safe base (70 Hz high-pass, hum notch when measured)
# -> MossFormer2-SE at 60 % wet -> mud cut (-7 dB @ 320 Hz) + presence-band resonance control -> WPE dereverb at 50 % -> split-band de-esser
# -> -18 LUFS. Not generative: the dry path keeps every syllable (60 % wet). Same input, same output: no sampling anywhere, the SE model's
# revision + checksum are pinned in cloud.js (CLEANUP_WEIGHTS), seeds are fixed and cudnn runs deterministic. Runs on the worker, never on tower.
#   python cleanup.py --input IN --output OUT.flac --bw KHZ [--hum HZ] [--cv-python PY --cv-dir DIR]
import argparse, json, os, subprocess, sys, tempfile, time
import numpy as np

SR = 48000
CHAIN = 'F: safe base + MossFormer2-SE 60% + mud-7 + WPE 50% + de-ess (round 3)'


def ffmpeg_in(path, af=None):
    cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-i', path] + (['-af', af] if af else []) + ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()


def speech_frames(x):
    n = int(SR * 0.025)
    f = x[: len(x) // n * n].reshape(-1, n)
    e = 10 * np.log10(np.mean(f ** 2, axis=1) + 1e-12)
    return f[e > np.percentile(e, 10) + 12].reshape(-1)


def smooth_oct(freqs, db, frac):
    out = np.empty_like(db)
    for i, f in enumerate(freqs):
        if f <= 0:
            out[i] = db[i]; continue
        m = (freqs >= f * 2 ** (-0.5 / frac)) & (freqs <= f * 2 ** (0.5 / frac))
        out[i] = 10 * np.log10(np.mean(10 ** (db[m] / 10)))
    return out


def ltass_target(freqs):
    f = np.maximum(freqs, 1)
    return np.where(f < 500, 0.0, -6 * np.log2(f / 500))


def deres(x, fc, mud_db=-7.0, lift_lo=800, lift_hi=1800, lift_end=2500, max_boost=5.0, max_cut=6.0):
    """tube3.deres2: a corrective EQ from the talk's own speech spectrum, deeper mud cut, 12 dB/oct high-pass at 100 Hz (linear phase)."""
    from scipy.signal import welch, firwin2, oaconvolve
    s = speech_frames(x)
    freqs, P = welch(s, SR, nperseg=8192)
    db = 10 * np.log10(P + 1e-20)
    s6, s1 = smooth_oct(freqs, db, 6), smooth_oct(freqs, db, 1)
    band = (freqs >= 150) & (freqs <= fc)
    peaks = np.clip(s6 - s1, 0, None)
    tgt = ltass_target(freqs) + s1[np.argmin(abs(freqs - 500))]
    tilt = np.clip(tgt - s1, -4, max_boost)
    w = np.interp(freqs, [lift_lo * 0.8, lift_lo, lift_hi, lift_end], [0, 1, 1, 0])
    tilt = np.where(tilt > 0, tilt * w, tilt)
    corr = np.where(band, np.clip(-0.8 * peaks, -max_cut, 0) + tilt, 0.0)
    corr += mud_db * np.exp(-0.5 * (np.log2(np.maximum(freqs, 1) / 320) / 0.55) ** 2)
    taper = np.interp(np.log2(np.maximum(freqs, 1)), [np.log2(80), np.log2(110), np.log2(fc), np.log2(fc * 1.26)], [0, 1, 1, 0])
    corr = smooth_oct(freqs, corr * taper, 6)
    corr = np.where(freqs < 100, corr - 12 * np.log2(100 / np.maximum(freqs, 10)), corr)
    taps = firwin2(4095, freqs / (SR / 2), 10 ** (np.maximum(corr, -40) / 20))
    return oaconvolve(x, taps, mode='same').astype(np.float32)


def wpe_block(x, taps=10, delay=3, iters=3):
    from nara_wpe.wpe import wpe as _wpe
    from nara_wpe.utils import stft, istft
    Y = stft(x[None], size=2048, shift=512).transpose(2, 0, 1)
    Z = _wpe(Y, taps=taps, delay=delay, iterations=iters, statistics_mode='full').transpose(1, 2, 0)
    z = istft(Z, size=2048, shift=512)[0]
    z = z[: len(x)] if len(z) >= len(x) else np.pad(z, (0, len(x) - len(z)))
    return z.astype(np.float32)


def chunked(x, fn, chunk_s=60.0, overlap_s=2.0):
    """fn over overlapping windows, raised-cosine overlap-add: bounded memory on a two-hour talk."""
    n, ov = int(chunk_s * SR), int(overlap_s * SR)
    if len(x) <= n:
        return fn(x)[: len(x)]
    hop = n - ov
    out = np.zeros(len(x), dtype=np.float64); wsum = np.zeros(len(x), dtype=np.float64)
    fade = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, ov))
    for s in range(0, len(x), hop):
        seg = x[s: s + n]; L = len(seg)
        y = np.asarray(fn(seg), dtype=np.float64)[:L]
        if len(y) < L: y = np.pad(y, (0, L - len(y)))
        w = np.ones(L)
        if s > 0: w[:min(ov, L)] = fade[:min(ov, L)]
        last = s + n >= len(x)
        if not last: w[-ov:] = fade[::-1]
        out[s: s + L] += y * w; wsum[s: s + L] += w
        if last: break
    return (out / np.maximum(wsum, 1e-9)).astype(np.float32)


def deess(x, lo=2000, hi=3600, max_red_db=8.0, over_db=6.0):
    from scipy.signal import butter, sosfiltfilt
    b = sosfiltfilt(butter(4, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
    hop = int(SR * 0.005); n = len(x) // hop
    e = 10 * np.log10(np.mean(b[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    ref = np.percentile(e[e > np.percentile(e, 30)], 60)
    red = np.clip(e - (ref + over_db), 0, max_red_db)
    rel = np.exp(-1 / (0.060 / 0.005)); g = np.empty_like(red); cur = 0.0
    for i, r in enumerate(red):
        cur = r if r > cur else cur * rel + r * (1 - rel); g[i] = cur
    gain = np.pad(10 ** (-np.repeat(g, hop) / 20), (0, len(x) - n * hop), constant_values=1.0)[: len(x)]
    return (x - b + b * gain).astype(np.float32)


def align(dry, wet, max_lag_ms=60):
    """Shift the model's output onto the dry by the cross-correlation peak (models add latency) and match its speech level."""
    from scipy.signal import butter, sosfiltfilt, correlate
    m = min(len(dry), len(wet)); d, w = dry[:m], wet[:m]
    L = int(SR * max_lag_ms / 1000)
    sos = butter(4, [200, 3500], 'bandpass', fs=SR, output='sos')
    c = correlate(sosfiltfilt(sos, d), sosfiltfilt(sos, w), mode='full', method='fft')
    mid = m - 1
    lag = int(np.argmax(np.abs(c[mid - L: mid + L + 1])) - L)
    w2 = np.roll(wet, lag)[: len(dry)]
    if len(w2) < len(dry): w2 = np.pad(w2, (0, len(dry) - len(w2)))
    rms = lambda v: float(np.sqrt(np.mean(speech_frames(v) ** 2)) + 1e-9)
    return (w2 * (rms(dry) / rms(w2))).astype(np.float32), lag


MF2SE_RUNNER = '''
import sys, os, numpy as np, soundfile as sf, torch, tempfile
sys.path.insert(0, sys.argv[4])
from cleanup import chunked, SR
torch.manual_seed(0); np.random.seed(0)
torch.backends.cudnn.deterministic = True; torch.backends.cudnn.benchmark = False
src, dst, cvdir = sys.argv[1], sys.argv[2], sys.argv[3]
os.chdir(cvdir)      # ClearVoice reads checkpoints/ relative to the cwd (baked + sha-pinned)
from clearvoice import ClearVoice
cv = ClearVoice(task='speech_enhancement', model_names=['MossFormer2_SE_48K'])      # loaded ONCE for the whole talk
tmp = tempfile.mkdtemp()
def fn(seg):
    p = os.path.join(tmp, 'seg.wav'); sf.write(p, seg, SR, subtype='FLOAT')
    y = cv(input_path=p, online_write=False)
    return np.asarray(y[0] if isinstance(y, (list, tuple)) else y, dtype=np.float32).reshape(-1)
x = sf.read(src, dtype='float32')[0]
sf.write(dst, chunked(x, fn, chunk_s=10.0, overlap_s=1.0), SR, subtype='FLOAT')
'''


def mf2se(x, cv_python, cv_dir):
    """MossFormer2-SE over 10 s windows (1 s overlap-add) in ONE model process: a two-hour file never sits in the model at once."""
    tmp = tempfile.mkdtemp()
    runner = os.path.join(tmp, 'run.py'); open(runner, 'w').write(MF2SE_RUNNER)
    import soundfile as sf
    a, b = os.path.join(tmp, 'a.wav'), os.path.join(tmp, 'b.wav')
    sf.write(a, x, SR, subtype='FLOAT')
    subprocess.run([cv_python, runner, a, b, cv_dir, os.path.dirname(os.path.abspath(__file__))], check=True, capture_output=True)
    return sf.read(b, dtype='float32')[0]


def clean(src, out, bw_khz, hum_hz=None, cv_python=None, cv_dir='/opt/models/clearvoice', _mf2se=mf2se):
    t0 = time.time()
    base_af = ['highpass=f=70:p=2'] + ([f'bandreject=f={hum_hz * k}:width_type=q:w=30' for k in (1, 2, 3, 4)] if hum_hz else [])
    dry = ffmpeg_in(src, ','.join(base_af))
    wet = align(dry, _mf2se(dry, cv_python, cv_dir))[0]
    x = (0.4 * dry + 0.6 * wet).astype(np.float32)
    x = deres(x, fc=max(bw_khz, 1.5) * 0.97 * 1000)
    x = (0.5 * x + 0.5 * chunked(x, wpe_block)).astype(np.float32)
    x = deess(x)
    raw = out + '.f32'
    x.tofile(raw)
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', raw,
                    '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.891:level=disabled', '-ar', str(SR), '-c:a', 'flac', '-sample_fmt', 's16', out], check=True)
    os.remove(raw)
    return {'chain': CHAIN, 'seconds': round(time.time() - t0, 1), 'audio_s': round(len(dry) / SR, 1), 'bw_khz': bw_khz, 'hum_hz': hum_hz}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True); p.add_argument('--output', required=True)
    p.add_argument('--bw', type=float, default=3.0); p.add_argument('--hum', type=float, default=None)
    p.add_argument('--cv-python', default='/opt/cv/bin/python'); p.add_argument('--cv-dir', default='/opt/models/clearvoice')
    a = p.parse_args()
    print(json.dumps(clean(a.input, a.output, a.bw, a.hum, a.cv_python, a.cv_dir)))

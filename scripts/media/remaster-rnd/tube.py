# Remaster R&D round 2 — the "listening through a tube" defect (Chad 10-23 on Ioas). Three parts, three tools, then chains:
#   de-resonance: long-term speech spectrum vs a speech-spectrum target → linear-phase corrective EQ (cuts boxy 250 Hz–fc
#                 peaks, restores the presence tilt up to the band edge; never boosts above it, where only hiss lives)
#   dereverb:     WPE (nara_wpe, classic linear prediction; nothing generated), mixed in gently
#   highs:        band-split BWE — the words below fc stay the (denoised) original; ONLY the band above fc comes from a model
#                 (Sidon / AudioSR / Resemble enhancer / VoiceFixer / MossFormer2-SR) at a set level — or the classic
#                 harmonic exciter (ffmpeg aexciter) as the non-generative baseline
# CPU only (boss, nice 15). Venv: ~/media-asr/venv + PYTHONPATH pylib (pyloudnorm, nara_wpe). Usage: python tube.py <root> <clip>
# → <root>/cands/<clip>/t2-*.wav (at -18 LUFS, like every candidate) + <root>/cands/<clip>/_tube.json (EQ curve, settings)
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy.signal import firwin2, fftconvolve, welch
from rnd_common import SR, read, write, align, mix, hf_blend
from build_cands import finish, ffmpeg, BW

ROOT, CLIP = sys.argv[1], sys.argv[2]
FC = BW[CLIP] * 0.97 * 1000                      # crossover just under the measured band edge
os.makedirs(f'{ROOT}/work', exist_ok=True)


def speech_frames(x, sr=SR):
    n = int(sr * 0.025)
    f = x[: len(x) // n * n].reshape(-1, n)
    e = 10 * np.log10(np.mean(f ** 2, axis=1) + 1e-12)
    return f[e > np.percentile(e, 10) + 12].reshape(-1)


def smooth_oct(freqs, db, frac):
    """Fractional-octave smoothing (frac = 1 → octave, 6 → 1/6 octave)."""
    out = np.empty_like(db)
    for i, f in enumerate(freqs):
        if f <= 0:
            out[i] = db[i]
            continue
        lo, hi = f * 2 ** (-0.5 / frac), f * 2 ** (0.5 / frac)
        m = (freqs >= lo) & (freqs <= hi)
        out[i] = 10 * np.log10(np.mean(10 ** (db[m] / 10)))
    return out


def ltass_target(freqs):
    """Long-term average speech spectrum shape (after Byrne et al. 1994): ~flat 150–500 Hz, then about -6 dB/octave. dB re 500 Hz."""
    f = np.maximum(freqs, 1)
    return np.where(f < 500, 0.0, -6 * np.log2(f / 500))


def deresonance(x, max_cut=6.0, max_boost=6.0):
    """Corrective EQ from the clip's own speech spectrum: cut resonant peaks (1/6-octave LTAS above its octave trend) and pull
    the trend toward the LTASS target between 150 Hz and fc. Linear-phase FIR (no smearing of word onsets beyond ±21 ms)."""
    s = speech_frames(x)
    freqs, P = welch(s, SR, nperseg=8192)
    db = 10 * np.log10(P + 1e-20)
    s6, s1 = smooth_oct(freqs, db, 6), smooth_oct(freqs, db, 1)
    band = (freqs >= 150) & (freqs <= FC)
    peaks = np.clip(s6 - s1, 0, None)                         # resonances sit above the trend
    ref = 500
    tgt = ltass_target(freqs) + s1[np.argmin(abs(freqs - ref))]
    tilt = np.clip(tgt - s1, -4, max_boost)
    tilt = np.where(freqs < 800, np.minimum(tilt, 0), tilt)     # never add low-mid body: that IS the boxy sound
    corr = np.where(band, np.clip(-0.8 * peaks, -max_cut, 0) + tilt, 0.0)
    # taper the correction to 0 dB over a third-octave outside the band (no step at the edges)
    taper = np.interp(np.log2(np.maximum(freqs, 1)), [np.log2(120), np.log2(150), np.log2(FC), np.log2(FC * 1.26)], [0, 1, 1, 0])
    corr = smooth_oct(freqs, corr * taper, 6)
    g = 10 ** (corr / 20)
    taps = firwin2(2047, freqs / (SR / 2), g)
    y = fftconvolve(x, taps, mode='same').astype(np.float32)
    pick = [125, 250, 400, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150]
    return y, {f: round(float(np.interp(f, freqs, corr)), 1) for f in pick}


def wpe(x, taps=10, delay=3, iters=3):
    from nara_wpe.wpe import wpe as _wpe
    from nara_wpe.utils import stft, istft
    Y = stft(x[None], size=2048, shift=512).transpose(2, 0, 1)     # (F, D=1, T)
    Z = _wpe(Y, taps=taps, delay=delay, iterations=iters, statistics_mode='full').transpose(1, 2, 0)
    z = istft(Z, size=2048, shift=512)[0]
    z = z[: len(x)] if len(z) >= len(x) else np.pad(z, (0, len(x) - len(z)))
    return z.astype(np.float32)


def exciter(x, amount):
    return ffmpeg(x, f'aexciter=amount={amount}:drive=8.5:blend=0:freq=2000:ceil=16000')


def main():
    dry = read(f'{ROOT}/clips/{CLIP}.wav')
    wet = {}
    for m in ('mf2se', 'dfn6', 'sidon', 'audiosr', 'resenh', 'vf0', 'mf2sr'):
        p = f'{ROOT}/wet/{m}/{CLIP}.wav'
        if os.path.exists(p):
            wet[m] = align(dry, read(p))[0]
    base = mix(dry, wet['mf2se'], 0.6)                          # round-1 survivor (gentle MossFormer2) = the base
    deres, curve = deresonance(base)
    dw = mix(deres, wpe(deres), 0.5)                            # gentle WPE
    out = {
        't2-deres': deres,
        't2-deres-wpe': dw,
        't2-deres-wpe-exc2': exciter(dw, 2),
        't2-deres-wpe-exc4': exciter(dw, 4),
    }
    for m in ('sidon', 'audiosr', 'resenh', 'vf0', 'mf2sr'):
        if m in wet:
            for g in (-4, -10):
                out[f't2-deres-wpe+{m}-hf{g}'] = hf_blend(dw, wet[m], FC, gain_db=g)
    od = f'{ROOT}/cands/{CLIP}'
    for n, y in out.items():
        if os.path.exists(f'{od}/{n}.wav') and not os.environ.get('REBUILD'):
            continue
        write(f'{od}/{n}.wav', finish(y))
    json.dump({'fc_hz': round(FC), 'eq_db': curve, 'base': 'mf2se@0.6', 'wpe': 'taps 10, delay 3, 3 iterations, 2048/512 STFT, 50 % mix',
               'cands': sorted(out)}, open(f'{od}/_tube.json', 'w'), indent=1)
    print(CLIP, 'fc', round(FC), 'EQ', curve, len(out), 'candidates')


if __name__ == '__main__':
    main()

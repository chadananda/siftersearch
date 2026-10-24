# Remaster R&D round 3, from Chad's r2 pick (MF2SE 60 % + de-resonance + WPE: "still muddy and loud sibilants").
# Changes on top of that chain: a deeper low-mid (mud) cut with a 100 Hz high-pass; the presence lift moved DOWN (0.8–1.8 kHz,
# tapering to 0 by 2.5 kHz) so it no longer feeds the "s" band of a 3 kHz recording; a split-band DE-ESSER (2.0–3.6 kHz,
# zero-phase band, fast envelope, reduces only the band and only on sibilant peaks). CPU (boss). Usage: python tube3.py <root> ioas
# → <root>/cands/<clip>/t3-*.wav + _tube3.json
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy.signal import butter, sosfiltfilt, firwin2, fftconvolve, welch
import tube
from tube import speech_frames, smooth_oct, ltass_target, wpe, FC
from rnd_common import SR, read, write, align, mix
from build_cands import finish

ROOT, CLIP = sys.argv[1], sys.argv[2]


def deres2(x, mud_db, lift_lo=800, lift_hi=1800, lift_end=2500, max_boost=5.0, max_cut=6.0):
    s = speech_frames(x)
    freqs, P = welch(s, SR, nperseg=8192)
    db = 10 * np.log10(P + 1e-20)
    s6, s1 = smooth_oct(freqs, db, 6), smooth_oct(freqs, db, 1)
    band = (freqs >= 150) & (freqs <= FC)
    peaks = np.clip(s6 - s1, 0, None)
    tgt = ltass_target(freqs) + s1[np.argmin(abs(freqs - 500))]
    tilt = np.clip(tgt - s1, -4, max_boost)
    w = np.interp(freqs, [lift_lo * 0.8, lift_lo, lift_hi, lift_end], [0, 1, 1, 0])   # boosts only in the low-presence band
    tilt = np.where(tilt > 0, tilt * w, tilt)
    corr = np.where(band, np.clip(-0.8 * peaks, -max_cut, 0) + tilt, 0.0)
    # mud: a broad bell cut centred at 320 Hz (about 1.3 octaves wide)
    lf = np.log2(np.maximum(freqs, 1) / 320)
    corr += mud_db * np.exp(-0.5 * (lf / 0.55) ** 2)
    taper = np.interp(np.log2(np.maximum(freqs, 1)), [np.log2(80), np.log2(110), np.log2(FC), np.log2(FC * 1.26)], [0, 1, 1, 0])
    corr = smooth_oct(freqs, corr * taper, 6)
    corr = np.where(freqs < 100, corr - 12 * np.log2(100 / np.maximum(freqs, 10)), corr)   # 12 dB/oct high-pass at 100 Hz
    taps = firwin2(4095, freqs / (SR / 2), 10 ** (np.maximum(corr, -40) / 20))
    pick = [80, 125, 250, 320, 400, 630, 1000, 1250, 1600, 2000, 2500, 3150]
    return fftconvolve(x, taps, mode='same').astype(np.float32), {f: round(float(np.interp(f, freqs, corr)), 1) for f in pick}


def deess(x, lo=2000, hi=3600, max_red_db=8.0, over_db=6.0):
    """Split-band de-esser: the 2.0–3.6 kHz band (zero-phase) is turned down only where its short-term level rises more than
    `over_db` above its own running speech level (sibilant peaks), by up to max_red_db; the rest of the signal is untouched."""
    sos = butter(4, [lo, hi], 'bandpass', fs=SR, output='sos')
    b = sosfiltfilt(sos, x)
    hop = int(SR * 0.005)
    n = len(x) // hop
    e = 10 * np.log10(np.mean(b[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    ref = np.percentile(e[e > np.percentile(e, 30)], 60)               # typical band level during speech
    red = np.clip(e - (ref + over_db), 0, max_red_db)                  # dB to remove per 5 ms frame
    # fast attack (instant), 60 ms release
    rel = np.exp(-1 / (0.060 / 0.005))
    g = np.empty_like(red)
    cur = 0.0
    for i, r in enumerate(red):
        cur = r if r > cur else cur * rel + r * (1 - rel)
        g[i] = cur
    gain = 10 ** (-np.repeat(g, hop) / 20)
    gain = np.pad(gain, (0, len(x) - len(gain)), constant_values=1.0)
    return (x - b + b * gain).astype(np.float32), round(float(np.mean(g > 1) * 100), 1)


def main():
    dry = read(f'{ROOT}/clips/{CLIP}.wav')
    base = mix(dry, align(dry, read(f'{ROOT}/wet/mf2se/{CLIP}.wav'))[0], 0.6)
    info, out = {}, {}
    for mud in (-4, -7):
        eq, curve = deres2(base, mud)
        info[f'eq_mud{mud}'] = curve
        w50 = mix(eq, wpe(eq), 0.5)
        des, share = deess(w50)
        info[f'deess_active_pct_mud{mud}'] = share
        out[f't3-mud{-mud}-wpe-deess'] = des
        if mud == -4:
            out['t3-mud4-wpe'] = w50
        else:
            w80 = mix(eq, wpe(eq), 0.8)
            out['t3-mud7-wpe80-deess'] = deess(w80)[0]
    od = f'{ROOT}/cands/{CLIP}'
    for n, y in out.items():
        write(f'{od}/{n}.wav', finish(y))
    json.dump({'base': 'mf2se@0.6', **info, 'cands': sorted(out)}, open(f'{od}/_tube3.json', 'w'), indent=1)
    print(json.dumps(info))


if __name__ == '__main__':
    main()

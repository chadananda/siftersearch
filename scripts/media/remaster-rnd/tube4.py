# Remaster R&D round 4, from Chad's r3 pick (t3-mud7-wpe-deess: "Still a lot of ess"). On a ~3 kHz recording the "s"
# lives at 1.8–3.6 kHz, the same band the presence lift raises, so the r3 level-threshold de-esser (acts on 20 % of frames,
# −8 dB max) is too weak. Round 4 detects SIBILANTS by spectral balance (that band's energy over the 200–1000 Hz voice band,
# a vowel never has a high ratio) over 1.8–5 kHz and turns it down harder (−12/−16 dB); variants end the presence lift at
# 1.4 kHz and lower MF2SE to 45 % (it raises the s-contrast by 2–3 dB).
# Reports sibilant contrast (s-frames vs vowel frames, 1.8–3 kHz, dB; frames classified on the original). CPU (boss).
# Usage: python tube4.py <root> <clip> → <root>/cands/<clip>/t4-*.wav + _tube4.json
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy.signal import butter, sosfiltfilt
import tube, tube3
from rnd_common import SR, read, write, align, mix
from build_cands import finish

HI, LO = (1800, 5000), (200, 1000)   # measured on Ioas F: sibilant energy sits 1.8–3 kHz (absolute) and rose 3.6–6 kHz


def band_env(x, band, hop):
    b = sosfiltfilt(butter(4, band, 'bandpass', fs=SR, output='sos'), x)
    n = len(x) // hop
    return b, 10 * np.log10(np.mean(b[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)


def sib_contrast(x, ref):
    """Sibilant-vs-vowel level (dB) in 1.8–3.0 kHz on frames classified from the ORIGINAL `ref` (time-aligned): how far the
    "s" stands out. The original Ioas measures +7.2 dB (1.8–2.5 kHz); MF2SE 60 % raises it to +9.2."""
    from scipy.signal import stft
    def bands(sig):
        f, _, Z = stft(sig, SR, nperseg=2048, noverlap=1536)
        P = np.abs(Z) ** 2
        return lambda lo, hi: 10 * np.log10(P[(f >= lo) & (f < hi)].sum(0) + 1e-12)
    B = bands(ref)
    r = B(1800, 5000) - B(200, 1000)
    tot = B(200, 5000)
    loud = tot > np.percentile(tot, 40)
    sib, vow = loud & (r > np.percentile(r[loud], 85)), loud & (r < np.percentile(r[loud], 50))
    e = bands(x)(1800, 3000)
    n = min(len(e), len(sib))
    return round(float(np.mean(e[:n][sib[:n]]) - np.mean(e[:n][vow[:n]])), 1)


def deess_ratio(x, max_red_db=12.0, over_db=3.0, release_s=0.05):
    """Turn the 1.8–5 kHz band down where it is louder than the 200–1000 Hz band by more than `over_db` relative to the
    clip's typical vowel balance (sibilants, not vowels), by (excess × 1.5) up to max_red_db; instant attack, short release."""
    hop = int(SR * 0.005)
    b, eh = band_env(x, HI, hop)
    _, el = band_env(x, LO, hop)
    ratio = eh - el
    loud = eh > np.percentile(eh, 30)
    typical = np.median(ratio[loud])
    red = np.clip((ratio - typical - over_db) * 1.5, 0, max_red_db) * loud
    rel = np.exp(-1 / (release_s / 0.005))
    g = np.empty_like(red)
    cur = 0.0
    for i, r in enumerate(red):
        cur = r if r > cur else cur * rel + r * (1 - rel)
        g[i] = cur
    gain = np.repeat(10 ** (-g / 20), hop)
    gain = np.pad(gain, (0, len(x) - len(gain)), constant_values=1.0)
    return (x - b + b * gain).astype(np.float32), round(float(np.mean(g > 1) * 100), 1)


RECIPES = {   # name: (MF2SE wet share, presence lift ends at Hz, de-esser, max reduction dB)
    't4-ratio12': (0.6, 1800, 'ratio', 12),
    't4-ratio16-lift14': (0.6, 1400, 'ratio', 16),
    't4-ratio16-lift14-mf45': (0.45, 1400, 'ratio', 16),
    't4-level16': (0.6, 1800, 'level', 16),
}


def build(dry, wet, bw_khz, name):
    w, lift_hi, de, red = RECIPES[name]
    tube.set_fc(bw_khz)
    base = mix(dry, wet, w)
    y = tube3.deres2(base, -7, lift_hi=lift_hi, lift_end=lift_hi + 200)[0] if lift_hi != 1800 else tube3.deres2(base, -7)[0]
    y = mix(y, tube.wpe(y), 0.5)
    if de == 'ratio':
        return deess_ratio(y, max_red_db=red, over_db=3.0 if red <= 12 else 2.0)   # 0 dB acted on 76 % of frames (vowels too)
    return tube3.deess(y, lo=HI[0], hi=HI[1], max_red_db=red, over_db=2.0)


def main():
    root, clip = sys.argv[1], sys.argv[2]
    tube.set_fc(tube.BW[clip])
    dry = read(f'{root}/clips/{clip}.wav')
    wet = align(dry, read(f'{root}/wet/mf2se/{clip}.wav'))[0]
    od = f'{root}/cands/{clip}'
    info = {'sib_original': sib_contrast(dry, dry)}
    for f in ('t3-mud7-wpe-deess', 'mf2se-w60'):
        if os.path.exists(f'{od}/{f}.wav'):
            info[f'sib_{f}'] = sib_contrast(read(f'{od}/{f}.wav'), dry)
    for n in RECIPES:
        y, act = build(dry, wet, tube.BW[clip], n)
        y = finish(y)
        write(f'{od}/{n}.wav', y)
        info[f'sib_{n}'] = sib_contrast(y, dry)
        info[f'deess_active_pct_{n}'] = act
    json.dump(info, open(f'{od}/_tube4.json', 'w'), indent=1)
    print(json.dumps(info))


if __name__ == '__main__':
    main()

# Remaster R&D step 2c: build the CANDIDATES from the clips and the models' wet outputs — the ONE classic baseline (EQ +
# level ride), parallel wet/dry mixes (the dry path keeps every syllable), and band-split blends (generated content only
# above the original's bandwidth). Every candidate (and the original) leaves at -18 LUFS with a -1 dBFS peak limiter, so
# screening and listening judge the same files. Venv: ~/media-gpu/venv-rnd (CPU only). Usage: python build_cands.py <root>
# → <root>/cands/<clip>/<name>.wav + <root>/cands/_build.json (lag/correlation of each wet output)
import json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import pyloudnorm as pyln
from rnd_common import SR, read, write, align, mix, hf_blend

ROOT = sys.argv[1]
SPEC = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cands.json')))
CLIPS = json.load(open(f'{ROOT}/clips/clips.json'))
BW = {'ioas': 2.98, 'panahi': 9.25, 'muhajir': 7.29, 'sears': 5.6, 'banani': 5.46}   # grade bandwidth (kHz) of each talk
HUM = {'banani': 50}                                                                # mains hum notch (grade ≥ 10 dB)


def classic_chain(clip):
    """The classic broadcast baseline: rumble cut (+ hum notch), mud cut, presence lift, slow level ride, gentle compression."""
    f = ['highpass=f=70:p=2']
    if clip in HUM:
        h = HUM[clip]
        f += [f'bandreject=f={h * k}:width_type=q:w=30' for k in (1, 2, 3, 4)]
    f += ['equalizer=f=300:t=q:w=1.0:g=-3', 'equalizer=f=2500:t=q:w=1.0:g=4', 'highshelf=f=6000:g=1.5',
          'dynaudnorm=f=500:g=31:p=0.9:m=4:r=0.0', 'acompressor=threshold=-24dB:ratio=2:attack=20:release=250:makeup=1']
    return ','.join(f)


def ffmpeg(x, af):
    with tempfile.TemporaryDirectory(dir=f'{ROOT}/work') as t:
        write(f'{t}/i.wav', x)
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', f'{t}/i.wav', '-af', af, '-ar', str(SR), '-ac', '1', '-c:a', 'pcm_f32le', f'{t}/o.wav'], check=True)
        return read(f'{t}/o.wav')


def finish(x):
    """-18 LUFS by linear gain, then a -1 dBFS peak limiter (only touches peaks)."""
    lufs = pyln.Meter(SR).integrated_loudness(x.astype(np.float64))
    x = (x * 10 ** ((-18 - lufs) / 20)).astype(np.float32)
    if np.max(np.abs(x)) > 0.89:
        x = ffmpeg(x, 'alimiter=limit=0.89:attack=5:release=60:level=false:asc=1')
    return x


def main():
    os.makedirs(f'{ROOT}/work', exist_ok=True)
    build = {}
    for clip in CLIPS:
        dry = read(f'{ROOT}/clips/{clip}.wav')
        od = f'{ROOT}/cands/{clip}'
        os.makedirs(od, exist_ok=True)
        wet, info = {}, {}

        def W(model):
            if model not in wet:
                p = f'{ROOT}/wet/{model}/{clip}.wav'
                if not os.path.exists(p):
                    wet[model] = None
                else:
                    wet[model], lag, corr = align(dry, read(p))
                    info[model] = {'lag': lag, 'corr': round(corr, 3)}
            return wet[model]

        out = {'original': dry, 'classic': ffmpeg(dry, classic_chain(clip))}
        fc = min(BW[clip] * 0.85, 7.0) * 1000
        for name, s in SPEC.items():
            if s.get('only') and clip not in s['only']:
                continue
            base = dry if s.get('base', 'dry') == 'dry' else None
            if s.get('base', 'dry') != 'dry':      # base = another mix, e.g. "mf2se@0.5"
                m, w = s['base'].split('@')
                if W(m) is None:
                    continue
                base = mix(dry, W(m), float(w))
            if 'wet' in s:
                if W(s['wet']) is None:
                    continue
                y = mix(base, W(s['wet']), s.get('w', 1.0))
            else:
                y = base
            if 'hf' in s:                            # generated band above fc (skip when the talk is already wide)
                if W(s['hf']) is None or BW[clip] >= s.get('hf_max_bw', 8.0):
                    continue
                y = hf_blend(y, W(s['hf']), fc, gain_db=s.get('hf_gain_db', 0.0))
            out[name] = y
        for name, y in out.items():   # existing files are kept (their screening is cached by mtime); REBUILD=1 rewrites
            if os.path.exists(f'{od}/{name}.wav') and not os.environ.get('REBUILD'):
                continue
            write(f'{od}/{name}.wav', finish(y))
        build[clip] = {'wet': info, 'cands': sorted(out), 'hf_fc_hz': round(fc)}
        print(clip, len(out), 'candidates', info, flush=True)
    json.dump(build, open(f'{ROOT}/cands/_build.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
